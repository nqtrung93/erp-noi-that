import { query, withTransaction } from "../config/db.js";
import { asyncHandler, badRequest, notFound } from "../utils/http.js";
import { nextDocNo } from "../utils/docFormat.js";

// GET /api/stock — tồn kho hiện tại theo sản phẩm (+ biến thể) + kho
export const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ws.id, ws.product_id, ws.variant_id, ws.warehouse_id, ws.qty,
            p.sku, p.name AS product_name, p.unit, p.cost AS product_cost,
            v.sku AS variant_sku, v.attrs AS variant_attrs, v.cost AS variant_cost,
            w.code AS warehouse_code, w.name AS warehouse_name
       FROM warehouse_stock ws
       JOIN products p ON p.id = ws.product_id
       LEFT JOIN product_variants v ON v.id = ws.variant_id
       JOIN warehouses w ON w.id = ws.warehouse_id
       ORDER BY p.name, w.name`
  );
  res.json(rows.map((r) => ({ ...r, cost: r.variant_id ? r.variant_cost : r.product_cost })));
});

// GET /api/stock/movements?productId=&warehouseId=&type=
export const listMovements = asyncHandler(async (req, res) => {
  const { productId, warehouseId, type } = req.query;
  const conds = [];
  const params = [];
  if (productId) { params.push(productId); conds.push(`sm.product_id = $${params.length}`); }
  if (warehouseId) { params.push(warehouseId); conds.push(`sm.warehouse_id = $${params.length}`); }
  if (type) { params.push(type); conds.push(`sm.type = $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const { rows } = await query(
    `SELECT sm.*, p.name AS product_name, p.unit, v.attrs AS variant_attrs, w.name AS warehouse_name, pt.name AS partner_name
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       LEFT JOIN product_variants v ON v.id = sm.variant_id
       JOIN warehouses w ON w.id = sm.warehouse_id
       LEFT JOIN partners pt ON pt.id = sm.partner_id
       ${where}
       ORDER BY sm.created_at DESC`,
    params
  );
  res.json(rows);
});

// POST /api/stock/import-opening { rows: [{ warehouse, sku, name, unit, qty, cost }] }
// Nhập tồn kho đầu kỳ từ CSV: tự tạo kho (theo tên) + sản phẩm (theo SKU) nếu chưa có,
// rồi SET số lượng tồn TUYỆT ĐỐI (không cộng dồn) — ghi 1 phiếu "adjust" cho mỗi dòng để có
// audit trail (lệch giữa tồn cũ và tồn mới nhập).
export const importOpeningStock = asyncHandler(async (req, res) => {
  const rows = Array.isArray((req.body || {}).rows) ? req.body.rows : [];
  if (!rows.length) throw badRequest("Không có dữ liệu để nhập");

  const result = await withTransaction(async (c) => {
    let created = 0, updated = 0;
    const failed = [];
    for (const row of rows) {
      try {
        const warehouseName = String(row.warehouse || "").trim();
        const sku = String(row.sku || "").trim();
        const name = String(row.name || "").trim();
        const unit = String(row.unit || "cái").trim() || "cái";
        const qty = Number(row.qty) || 0;
        const cost = row.cost !== undefined && row.cost !== "" ? Number(row.cost) || 0 : null;
        if (!warehouseName || !sku || !name) throw new Error("Thiếu kho, mã hàng hoặc tên hàng");

        let warehouse = (await c.query(`SELECT * FROM warehouses WHERE name = $1`, [warehouseName])).rows[0];
        if (!warehouse) {
          let code, exists = true;
          while (exists) {
            const { rows: wcode } = await c.query(`SELECT nextval('warehouse_seq') AS n`);
            code = `KHO${String(wcode[0].n).padStart(2, "0")}`;
            exists = (await c.query(`SELECT 1 FROM warehouses WHERE code = $1`, [code])).rows.length > 0;
          }
          warehouse = (await c.query(`INSERT INTO warehouses(code, name) VALUES($1,$2) RETURNING *`, [code, warehouseName])).rows[0];
        }

        let product = (await c.query(`SELECT * FROM products WHERE sku = $1`, [sku])).rows[0];
        if (!product) {
          product = (await c.query(
            `INSERT INTO products(sku, name, unit, cost, price) VALUES($1,$2,$3,$4,$4) RETURNING *`,
            [sku, name, unit, cost ?? 0]
          )).rows[0];
        } else if (cost !== null) {
          await c.query(`UPDATE products SET cost = $1 WHERE id = $2`, [cost, product.id]);
        }

        const existingStock = (await c.query(
          `SELECT qty FROM warehouse_stock WHERE product_id = $1 AND COALESCE(variant_id,-1) = -1 AND warehouse_id = $2`,
          [product.id, warehouse.id]
        )).rows[0];
        const oldQty = existingStock ? Number(existingStock.qty) : 0;

        await c.query(
          `INSERT INTO warehouse_stock(product_id, warehouse_id, qty) VALUES($1,$2,$3)
           ON CONFLICT (product_id, COALESCE(variant_id, -1), warehouse_id) DO UPDATE SET qty = $3`,
          [product.id, warehouse.id, qty]
        );

        if (qty !== oldQty) {
          const moveCode = await nextDocNo(c, "adjust");
          await c.query(
            `INSERT INTO stock_movements(code, product_id, warehouse_id, qty_change, type, note, created_by)
             VALUES($1,$2,$3,$4,'adjust',$5,$6)`,
            [moveCode, product.id, warehouse.id, qty - oldQty, "Nhập tồn đầu kỳ từ CSV", req.user.sub]
          );
        }

        if (existingStock) updated++; else created++;
      } catch (e) {
        failed.push(`${row.sku || "?"}: ${e.message}`);
      }
    }
    return { created, updated, failed };
  });
  res.status(201).json(result);
});

export async function upsertStock(c, productId, variantId, warehouseId, delta) {
  const { rows } = await c.query(
    `INSERT INTO warehouse_stock(product_id, variant_id, warehouse_id, qty) VALUES($1,$2,$3,$4)
     ON CONFLICT (product_id, COALESCE(variant_id, -1), warehouse_id) DO UPDATE SET qty = warehouse_stock.qty + $4
     RETURNING *`,
    [productId, variantId || null, warehouseId, delta]
  );
  if (Number(rows[0].qty) < 0) throw badRequest("Số lượng tồn không đủ để xuất");
  return rows[0];
}

// POST /api/stock/inbound { productId, variantId, warehouseId, qty, unitCost, partnerId, settlement: 'cash'|'debt', method, note }
export const inbound = asyncHandler(async (req, res) => {
  const { productId, variantId, warehouseId, qty, unitCost, partnerId, settlement, method, note } = req.body || {};
  if (!productId || !warehouseId || !qty || Number(qty) <= 0) throw badRequest("Thiếu thông tin nhập hàng");
  const cost = Number(unitCost) || 0;

  const result = await withTransaction(async (c) => {
    const product = (await c.query(`SELECT * FROM products WHERE id = $1`, [productId])).rows[0];
    if (!product) throw notFound("Sản phẩm không tồn tại");

    const code = await nextDocNo(c, "inbound");
    let transactionId = null;
    let partnerName = null;
    if (partnerId) {
      const partner = (await c.query(`SELECT * FROM partners WHERE id = $1 FOR UPDATE`, [partnerId])).rows[0];
      if (!partner) throw notFound("Đối tượng không tồn tại");
      partnerName = partner.name;
      const amount = cost * Number(qty);
      if (amount > 0) {
        if (settlement === "debt") {
          const debtCode = await nextDocNo(c, "debt");
          await c.query(
            `INSERT INTO debt_entries(code, partner_id, direction, amount, note, created_by) VALUES($1,$2,'increase',$3,$4,$5)`,
            [debtCode, partner.id, amount, `Nhập hàng: ${product.name} x${qty}`, req.user.sub]
          );
          await c.query(`UPDATE partners SET debt = debt + $1 WHERE id = $2`, [amount, partner.id]);
        } else {
          const txCode = await nextDocNo(c, "transaction");
          const tx = (await c.query(
            `INSERT INTO transactions(code, type, category_name, amount, method, partner_id, partner_name, note, created_by)
             VALUES($1,'Chi','Nhập hàng',$2,$3,$4,$5,$6,$7) RETURNING *`,
            [txCode, amount, method || null, partner.id, partner.name, note || null, req.user.sub]
          )).rows[0];
          transactionId = tx.id;
        }
      }
    }

    if (cost > 0) {
      if (variantId) await c.query(`UPDATE product_variants SET cost = $1 WHERE id = $2`, [cost, variantId]);
      else await c.query(`UPDATE products SET cost = $1 WHERE id = $2`, [cost, productId]);
    }
    const stock = await upsertStock(c, productId, variantId, warehouseId, Number(qty));
    const movement = (await c.query(
      `INSERT INTO stock_movements(code, product_id, variant_id, warehouse_id, qty_change, type, partner_id, transaction_id, note, created_by)
       VALUES($1,$2,$3,$4,$5,'inbound',$6,$7,$8,$9) RETURNING *`,
      [code, productId, variantId || null, warehouseId, Number(qty), partnerId || null, transactionId, note || null, req.user.sub]
    )).rows[0];

    return { movement, stock, partnerName };
  });
  res.status(201).json(result);
});

// POST /api/stock/outbound { productId, variantId, warehouseId, qty, unitPrice, partnerId, settlement, method, note }
export const outbound = asyncHandler(async (req, res) => {
  const { productId, variantId, warehouseId, qty, unitPrice, partnerId, settlement, method, note } = req.body || {};
  if (!productId || !warehouseId || !qty || Number(qty) <= 0) throw badRequest("Thiếu thông tin xuất hàng");
  const price = Number(unitPrice) || 0;

  const result = await withTransaction(async (c) => {
    const product = (await c.query(`SELECT * FROM products WHERE id = $1`, [productId])).rows[0];
    if (!product) throw notFound("Sản phẩm không tồn tại");

    const code = await nextDocNo(c, "outbound");
    let transactionId = null;
    if (partnerId) {
      const partner = (await c.query(`SELECT * FROM partners WHERE id = $1 FOR UPDATE`, [partnerId])).rows[0];
      if (!partner) throw notFound("Đối tượng không tồn tại");
      const amount = price * Number(qty);
      if (amount > 0) {
        if (settlement === "debt") {
          const debtCode = await nextDocNo(c, "debt");
          await c.query(
            `INSERT INTO debt_entries(code, partner_id, direction, amount, note, created_by) VALUES($1,$2,'increase',$3,$4,$5)`,
            [debtCode, partner.id, amount, `Xuất hàng: ${product.name} x${qty}`, req.user.sub]
          );
          await c.query(`UPDATE partners SET debt = debt + $1 WHERE id = $2`, [amount, partner.id]);
        } else {
          const txCode = await nextDocNo(c, "transaction");
          const tx = (await c.query(
            `INSERT INTO transactions(code, type, category_name, amount, method, partner_id, partner_name, note, created_by)
             VALUES($1,'Thu','Bán hàng',$2,$3,$4,$5,$6,$7) RETURNING *`,
            [txCode, amount, method || null, partner.id, partner.name, note || null, req.user.sub]
          )).rows[0];
          transactionId = tx.id;
        }
      }
    }

    const stock = await upsertStock(c, productId, variantId, warehouseId, -Number(qty));
    const movement = (await c.query(
      `INSERT INTO stock_movements(code, product_id, variant_id, warehouse_id, qty_change, type, partner_id, transaction_id, note, created_by)
       VALUES($1,$2,$3,$4,$5,'outbound',$6,$7,$8,$9) RETURNING *`,
      [code, productId, variantId || null, warehouseId, -Number(qty), partnerId || null, transactionId, note || null, req.user.sub]
    )).rows[0];

    return { movement, stock };
  });
  res.status(201).json(result);
});

// POST /api/stock/adjust { productId, variantId, warehouseId, qtyChange, note } — điều chỉnh tồn (kiểm kê, hao hụt...)
export const adjust = asyncHandler(async (req, res) => {
  const { productId, variantId, warehouseId, qtyChange, note } = req.body || {};
  if (!productId || !warehouseId || !qtyChange || Number(qtyChange) === 0) throw badRequest("Thiếu thông tin điều chỉnh");

  const result = await withTransaction(async (c) => {
    const code = await nextDocNo(c, "adjust");
    const stock = await upsertStock(c, productId, variantId, warehouseId, Number(qtyChange));
    const movement = (await c.query(
      `INSERT INTO stock_movements(code, product_id, variant_id, warehouse_id, qty_change, type, note, created_by)
       VALUES($1,$2,$3,$4,$5,'adjust',$6,$7) RETURNING *`,
      [code, productId, variantId || null, warehouseId, Number(qtyChange), note || null, req.user.sub]
    )).rows[0];
    return { movement, stock };
  });
  res.status(201).json(result);
});

// POST /api/stock/transfer { productId, variantId, fromWarehouseId, toWarehouseId, qty, note }
export const transfer = asyncHandler(async (req, res) => {
  const { productId, variantId, fromWarehouseId, toWarehouseId, qty, note } = req.body || {};
  if (!productId || !fromWarehouseId || !toWarehouseId || !qty || Number(qty) <= 0) throw badRequest("Thiếu thông tin luân chuyển");
  if (fromWarehouseId === toWarehouseId) throw badRequest("Kho nguồn và kho đích phải khác nhau");

  const result = await withTransaction(async (c) => {
    const code = await nextDocNo(c, "transfer");
    const outStock = await upsertStock(c, productId, variantId, fromWarehouseId, -Number(qty));
    const inStock = await upsertStock(c, productId, variantId, toWarehouseId, Number(qty));
    await c.query(
      `INSERT INTO stock_movements(code, product_id, variant_id, warehouse_id, qty_change, type, note, created_by)
       VALUES($1,$2,$3,$4,$5,'transfer_out',$6,$7)`,
      [code, productId, variantId || null, fromWarehouseId, -Number(qty), note || null, req.user.sub]
    );
    await c.query(
      `INSERT INTO stock_movements(code, product_id, variant_id, warehouse_id, qty_change, type, note, created_by)
       VALUES($1,$2,$3,$4,$5,'transfer_in',$6,$7)`,
      [code, productId, variantId || null, toWarehouseId, Number(qty), note || null, req.user.sub]
    );
    return { from: outStock, to: inStock };
  });
  res.status(201).json(result);
});
