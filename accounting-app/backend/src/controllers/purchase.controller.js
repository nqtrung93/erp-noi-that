import { query, withTransaction } from "../config/db.js";
import { asyncHandler, badRequest, notFound } from "../utils/http.js";
import { nextDocNo } from "../utils/docFormat.js";
import { upsertStock } from "./stock.controller.js";

// GET /api/purchases
export const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT po.*, w.name AS warehouse_name FROM purchase_orders po JOIN warehouses w ON w.id = po.warehouse_id ORDER BY po.created_at DESC`
  );
  res.json(rows);
});

// GET /api/purchases/:id — kèm chi tiết dòng hàng
export const getOne = asyncHandler(async (req, res) => {
  const po = (await query(
    `SELECT po.*, w.name AS warehouse_name FROM purchase_orders po JOIN warehouses w ON w.id = po.warehouse_id WHERE po.id = $1`,
    [req.params.id]
  )).rows[0];
  if (!po) throw notFound();
  const items = (await query(
    `SELECT poi.*, p.name AS product_name, p.sku, p.unit, v.attrs AS variant_attrs, v.sku AS variant_sku
       FROM purchase_order_items poi JOIN products p ON p.id = poi.product_id
       LEFT JOIN product_variants v ON v.id = poi.variant_id
       WHERE poi.purchase_order_id = $1`,
    [req.params.id]
  )).rows;
  res.json({ ...po, items });
});

// POST /api/purchases { supplierId, warehouseId, items:[{productId,variantId,qty,price}], discount, vatRate, shippingFee, paidNow, method, note }
export const create = asyncHandler(async (req, res) => {
  const { supplierId, warehouseId, items, discount, vatRate, shippingFee, paidNow, method, note } = req.body || {};
  if (!warehouseId) throw badRequest("Thiếu kho nhập hàng");
  if (!Array.isArray(items) || !items.length) throw badRequest("Đơn mua cần ít nhất 1 sản phẩm");

  const result = await withTransaction(async (c) => {
    const code = await nextDocNo(c, "purchase");

    let supplier = null;
    if (supplierId) {
      supplier = (await c.query(`SELECT * FROM partners WHERE id = $1 FOR UPDATE`, [supplierId])).rows[0];
      if (!supplier) throw notFound("Nhà cung cấp không tồn tại");
    }

    let subtotal = 0;
    const lineRows = [];
    for (const item of items) {
      if (!item.productId || !item.qty || Number(item.qty) <= 0) throw badRequest("Dòng sản phẩm không hợp lệ");
      const product = (await c.query(`SELECT * FROM products WHERE id = $1`, [item.productId])).rows[0];
      if (!product) throw notFound(`Sản phẩm #${item.productId} không tồn tại`);
      let variant = null;
      if (item.variantId) {
        variant = (await c.query(`SELECT * FROM product_variants WHERE id = $1`, [item.variantId])).rows[0];
        if (!variant) throw notFound(`Biến thể #${item.variantId} không tồn tại`);
      }
      const price = item.price !== undefined ? Number(item.price) : Number(variant?.cost ?? product.cost ?? 0);
      subtotal += price * Number(item.qty);
      lineRows.push({ productId: product.id, variantId: variant?.id || null, qty: Number(item.qty), price });
    }

    const disc = Number(discount) || 0;
    const vatPct = Number(vatRate) || 0;
    const ship = Number(shippingFee) || 0;
    const afterDiscount = Math.max(subtotal - disc, 0);
    const vatAmount = Math.round(afterDiscount * vatPct) / 100;
    const total = Math.max(afterDiscount + vatAmount + ship, 0);
    const paid = Math.min(Number(paidNow) || 0, total);

    const po = (await c.query(
      `INSERT INTO purchase_orders(code, supplier_id, supplier_name, warehouse_id, subtotal, discount, vat_rate, vat_amount, shipping_fee, total, paid, note, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [code, supplierId || null, supplier?.name || null, warehouseId, subtotal, disc, vatPct, vatAmount, ship, total, paid, note || null, req.user.sub]
    )).rows[0];

    for (const line of lineRows) {
      await c.query(
        `INSERT INTO purchase_order_items(purchase_order_id, product_id, variant_id, qty, price) VALUES($1,$2,$3,$4,$5)`,
        [po.id, line.productId, line.variantId, line.qty, line.price]
      );
      // Nhập hàng → giá vốn sản phẩm/biến thể cập nhật theo giá mua mới nhất.
      if (line.variantId) await c.query(`UPDATE product_variants SET cost = $1 WHERE id = $2`, [line.price, line.variantId]);
      else await c.query(`UPDATE products SET cost = $1 WHERE id = $2`, [line.price, line.productId]);

      await upsertStock(c, line.productId, line.variantId, warehouseId, line.qty);
      const moveCode = await nextDocNo(c, "inbound");
      await c.query(
        `INSERT INTO stock_movements(code, product_id, variant_id, warehouse_id, qty_change, type, partner_id, purchase_order_id, note, created_by)
         VALUES($1,$2,$3,$4,$5,'inbound',$6,$7,$8,$9)`,
        [moveCode, line.productId, line.variantId, warehouseId, line.qty, supplierId || null, po.id, `Đơn mua ${code}`, req.user.sub]
      );
    }

    let transaction = null;
    if (paid > 0) {
      const txCode = await nextDocNo(c, "transaction");
      transaction = (await c.query(
        `INSERT INTO transactions(code, type, category_name, amount, method, partner_id, partner_name, note, created_by)
         VALUES($1,'Chi','Mua hàng',$2,$3,$4,$5,$6,$7) RETURNING *`,
        [txCode, paid, method || null, supplierId || null, supplier?.name || null, `Thanh toán đơn mua ${code}`, req.user.sub]
      )).rows[0];
    }

    const remaining = total - paid;
    if (remaining > 0 && supplier) {
      const debtCode = await nextDocNo(c, "debt");
      await c.query(
        `INSERT INTO debt_entries(code, partner_id, direction, amount, note, created_by) VALUES($1,$2,'increase',$3,$4,$5)`,
        [debtCode, supplier.id, remaining, `Đơn mua ${code} chưa thanh toán hết`, req.user.sub]
      );
      await c.query(`UPDATE partners SET debt = debt + $1 WHERE id = $2`, [remaining, supplier.id]);
    }

    return { purchase: po, transaction };
  });
  res.status(201).json(result);
});

// PATCH /api/purchases/:id/status { status: 'Hoàn thành' | 'Đã hủy' }
export const changeStatus = asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!["Hoàn thành", "Đã hủy"].includes(status)) throw badRequest("Trạng thái không hợp lệ");

  const result = await withTransaction(async (c) => {
    const po = (await c.query(`SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE`, [req.params.id])).rows[0];
    if (!po) throw notFound();
    if (po.status !== "Mới") throw badRequest("Chỉ có thể đổi trạng thái đơn đang ở trạng thái Mới");

    if (status === "Đã hủy") {
      const items = (await c.query(`SELECT * FROM purchase_order_items WHERE purchase_order_id = $1`, [po.id])).rows;
      for (const item of items) {
        // Trừ lại tồn đã nhập — nếu hàng đã bán ra hết thì sẽ báo lỗi không đủ tồn (đúng, không cho hủy bừa).
        await upsertStock(c, item.product_id, item.variant_id, po.warehouse_id, -Number(item.qty));
        const moveCode = await nextDocNo(c, "outbound");
        await c.query(
          `INSERT INTO stock_movements(code, product_id, variant_id, warehouse_id, qty_change, type, purchase_order_id, note, created_by)
           VALUES($1,$2,$3,$4,$5,'outbound',$6,$7,$8)`,
          [moveCode, item.product_id, item.variant_id, po.warehouse_id, -Number(item.qty), po.id, `Hủy đơn mua ${po.code}`, req.user.sub]
        );
      }
      const remaining = Number(po.total) - Number(po.paid);
      if (remaining > 0 && po.supplier_id) {
        await c.query(`UPDATE partners SET debt = GREATEST(debt - $1, 0) WHERE id = $2`, [remaining, po.supplier_id]);
      }
    }

    const updated = (await c.query(`UPDATE purchase_orders SET status = $1 WHERE id = $2 RETURNING *`, [status, po.id])).rows[0];
    return updated;
  });
  res.json(result);
});

// POST /api/purchases/:id/payments { amount, method } — trả thêm tiền cho đơn mua còn nợ
export const addPayment = asyncHandler(async (req, res) => {
  const { amount, method } = req.body || {};
  if (!amount || Number(amount) <= 0) throw badRequest("Số tiền không hợp lệ");

  const result = await withTransaction(async (c) => {
    const po = (await c.query(`SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE`, [req.params.id])).rows[0];
    if (!po) throw notFound();
    const remaining = Number(po.total) - Number(po.paid);
    if (remaining <= 0) throw badRequest("Đơn mua đã thanh toán đủ");
    const amt = Math.min(Number(amount), remaining);

    const txCode = await nextDocNo(c, "transaction");
    const tx = (await c.query(
      `INSERT INTO transactions(code, type, category_name, amount, method, partner_id, partner_name, note, created_by)
       VALUES($1,'Chi','Mua hàng',$2,$3,$4,$5,$6,$7) RETURNING *`,
      [txCode, amt, method || null, po.supplier_id, po.supplier_name, `Thanh toán đơn mua ${po.code}`, req.user.sub]
    )).rows[0];

    if (po.supplier_id) {
      await c.query(`UPDATE partners SET debt = GREATEST(debt - $1, 0) WHERE id = $2`, [amt, po.supplier_id]);
    }
    const updated = (await c.query(`UPDATE purchase_orders SET paid = paid + $1 WHERE id = $2 RETURNING *`, [amt, po.id])).rows[0];

    return { purchase: updated, transaction: tx };
  });
  res.status(201).json(result);
});
