import { query, withTransaction } from "../config/db.js";
import { applyMovement, assertEnoughStock, getStock } from "../services/stock.service.js";
import { asyncHandler, badRequest } from "../utils/http.js";
import { nextDocNo } from "../utils/docFormat.js";

// GET /api/stock?warehouseId=... → tồn kho kèm tên sản phẩm/biến thể
export const list = asyncHandler(async (req, res) => {
  const params = [];
  let where = "";
  if (req.query.warehouseId) { params.push(req.query.warehouseId); where = `WHERE ws.warehouse_id = $${params.length}`; }
  const { rows } = await query(
    `SELECT ws.*, p.name AS product_name, p.sku AS product_sku, w.code AS warehouse_code, w.name AS warehouse_name,
            v.attrs AS variant_attrs, v.sku AS variant_sku
       FROM warehouse_stock ws
       JOIN products p ON p.id = ws.product_id
       JOIN warehouses w ON w.id = ws.warehouse_id
       LEFT JOIN product_variants v ON v.id = ws.variant_id
       ${where}
      ORDER BY p.name`,
    params
  );
  res.json(rows);
});

// GET /api/stock/movements?type=&warehouseId= → lịch sử phiếu nhập/xuất/điều chỉnh/chuyển kho
export const listMovements = asyncHandler(async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.warehouseId) { params.push(req.query.warehouseId); where.push(`sm.warehouse_id = $${params.length}`); }
  if (req.query.type) { params.push(req.query.type); where.push(`sm.type = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await query(
    `SELECT sm.*, p.name AS product_name, p.sku AS product_sku, w.name AS warehouse_name, w.code AS warehouse_code,
            s.name AS supplier_name, u.name AS created_by_name, v.attrs AS variant_attrs, v.sku AS variant_sku
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       JOIN warehouses w ON w.id = sm.warehouse_id
       LEFT JOIN suppliers s ON s.id = sm.supplier_id
       LEFT JOIN users u ON u.id = sm.created_by
       LEFT JOIN product_variants v ON v.id = sm.variant_id
       ${whereSql}
      ORDER BY sm.created_at DESC LIMIT 300`,
    params
  );
  res.json(rows);
});

// POST /api/stock/inbound  { warehouseId, items:[{productId, variantId, qty}], supplierId, debtAmount, reason }
// Nhập nhiều sản phẩm trong 1 phiếu (doc_no). debtAmount (nếu có) cộng vào công nợ nhà cung cấp.
export const inbound = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items.filter((i) => i.productId && Number(i.qty) > 0) : [];
  if (!b.warehouseId || !items.length) throw badRequest("Thiếu thông tin nhập hàng");

  const docNo = await withTransaction(async (c) => {
    const doc = await nextDocNo(c, "inbound");
    for (const it of items) {
      await applyMovement(c, {
        productId: it.productId, variantId: it.variantId || null, warehouseId: b.warehouseId,
        qtyChange: Number(it.qty), type: "inbound", reason: b.reason || "Nhập hàng",
        createdBy: req.user.sub, supplierId: b.supplierId || null, docNo: doc,
      });
    }
    if (b.supplierId && Number(b.debtAmount) > 0) {
      await c.query(`UPDATE suppliers SET debt = debt + $1 WHERE id = $2`, [Number(b.debtAmount), b.supplierId]);
    }
    return doc;
  });
  res.status(201).json({ ok: true, docNo });
});

// POST /api/stock/adjust  { warehouseId, items:[{productId, variantId, qtyChange}], reason } → kiểm/điều chỉnh tồn nhiều SP
// Trả về tồn sau điều chỉnh của từng dòng để hiển thị ngay trên giao diện.
export const adjust = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items.filter((i) => i.productId && Number(i.qtyChange)) : [];
  if (!b.warehouseId || !items.length) throw badRequest("Thiếu thông tin điều chỉnh");

  const result = await withTransaction(async (c) => {
    const doc = await nextDocNo(c, "adjust");
    const after = [];
    for (const it of items) {
      await applyMovement(c, {
        productId: it.productId, variantId: it.variantId || null, warehouseId: b.warehouseId,
        qtyChange: Number(it.qtyChange), type: "adjust", reason: b.reason || "Điều chỉnh tồn",
        createdBy: req.user.sub, docNo: doc,
      });
      const qtyAfter = await getStock(c, it.productId, it.variantId || null, b.warehouseId);
      after.push({ productId: it.productId, variantId: it.variantId || null, qtyAfter });
    }
    return { docNo: doc, after };
  });
  res.status(201).json({ ok: true, ...result });
});

// POST /api/stock/transfer  { fromWarehouseId, toWarehouseId, items:[{productId, variantId, qty}], reason }
// Luân chuyển nhiều sản phẩm trong 1 lần, tất cả trong 1 transaction (atomic), có số phiếu.
export const transfer = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items.filter((i) => i.productId && Number(i.qty) > 0) : [];
  if (!b.fromWarehouseId || !b.toWarehouseId || !items.length) throw badRequest("Thiếu thông tin luân chuyển");
  if (b.fromWarehouseId === b.toWarehouseId) throw badRequest("Kho nguồn và kho đích phải khác nhau");

  const docNo = await withTransaction(async (c) => {
    await assertEnoughStock(c, b.fromWarehouseId, items.map((i) => ({
      productId: i.productId, variantId: i.variantId || null, qty: Number(i.qty), name: "sản phẩm",
    })));
    const doc = await nextDocNo(c, "transfer");
    for (const i of items) {
      await applyMovement(c, {
        productId: i.productId, variantId: i.variantId || null, warehouseId: b.fromWarehouseId,
        qtyChange: -Number(i.qty), type: "transfer_out", reason: b.reason || "Luân chuyển kho", createdBy: req.user.sub, docNo: doc,
      });
      await applyMovement(c, {
        productId: i.productId, variantId: i.variantId || null, warehouseId: b.toWarehouseId,
        qtyChange: Number(i.qty), type: "transfer_in", reason: b.reason || "Luân chuyển kho", createdBy: req.user.sub, docNo: doc,
      });
    }
    return doc;
  });
  res.status(201).json({ ok: true, docNo, items });
});
