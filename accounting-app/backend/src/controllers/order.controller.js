import { query, withTransaction } from "../config/db.js";
import { asyncHandler, badRequest, notFound } from "../utils/http.js";
import { nextDocNo } from "../utils/docFormat.js";
import { nextCode } from "../utils/sequence.js";
import { upsertStock } from "./stock.controller.js";
import { renderInvoiceHtml } from "../utils/printTemplate.js";

// GET /api/orders
export const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT o.*, w.name AS warehouse_name FROM orders o JOIN warehouses w ON w.id = o.warehouse_id ORDER BY o.created_at DESC`
  );
  res.json(rows);
});

// GET /api/orders/:id — kèm chi tiết dòng hàng
export const getOne = asyncHandler(async (req, res) => {
  const order = (await query(
    `SELECT o.*, w.name AS warehouse_name FROM orders o JOIN warehouses w ON w.id = o.warehouse_id WHERE o.id = $1`,
    [req.params.id]
  )).rows[0];
  if (!order) throw notFound();
  const items = (await query(
    `SELECT oi.*, p.name AS product_name, p.sku, p.unit, v.attrs AS variant_attrs, v.sku AS variant_sku
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_variants v ON v.id = oi.variant_id
       WHERE oi.order_id = $1`,
    [req.params.id]
  )).rows;
  res.json({ ...order, items });
});

// POST /api/orders { customerId, newCustomer:{name,phone,address}, warehouseId, items:[{productId,variantId,qty,price}], discount, paidNow, method, note }
// newCustomer: tạo nhanh khách lẻ ngay lúc lập đơn (khi customerId không có) — chỉ cần "name" là đủ.
export const create = asyncHandler(async (req, res) => {
  const { customerId, newCustomer, warehouseId, items, discount, paidNow, method, note } = req.body || {};
  if (!warehouseId) throw badRequest("Thiếu kho xuất hàng");
  if (!Array.isArray(items) || !items.length) throw badRequest("Đơn hàng cần ít nhất 1 sản phẩm");

  const result = await withTransaction(async (c) => {
    const code = await nextDocNo(c, "orders");

    let customer = null;
    let resolvedCustomerId = customerId || null;
    if (customerId) {
      customer = (await c.query(`SELECT * FROM partners WHERE id = $1 FOR UPDATE`, [customerId])).rows[0];
      if (!customer) throw notFound("Khách hàng không tồn tại");
    } else if (newCustomer && String(newCustomer.name || "").trim()) {
      const partnerCode = await nextCode(c, "KH", "partner_seq");
      customer = (await c.query(
        `INSERT INTO partners(code, name, type, phone, address) VALUES($1,$2,'customer',$3,$4) RETURNING *`,
        [partnerCode, newCustomer.name.trim(), newCustomer.phone || null, newCustomer.address || null]
      )).rows[0];
      resolvedCustomerId = customer.id;
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
      const price = item.price !== undefined ? Number(item.price) : Number(variant?.price ?? product.price ?? 0);
      const cost = Number(variant?.cost ?? product.cost ?? 0);
      subtotal += price * Number(item.qty);
      lineRows.push({ productId: product.id, variantId: variant?.id || null, qty: Number(item.qty), price, cost });
    }

    const disc = Number(discount) || 0;
    const total = Math.max(subtotal - disc, 0);
    const paid = Math.min(Number(paidNow) || 0, total);

    const order = (await c.query(
      `INSERT INTO orders(code, customer_id, customer_name, warehouse_id, subtotal, discount, total, paid, note, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [code, resolvedCustomerId, customer?.name || null, warehouseId, subtotal, disc, total, paid, note || null, req.user.sub]
    )).rows[0];

    for (const line of lineRows) {
      await c.query(
        `INSERT INTO order_items(order_id, product_id, variant_id, qty, price, cost_at_sale) VALUES($1,$2,$3,$4,$5,$6)`,
        [order.id, line.productId, line.variantId, line.qty, line.price, line.cost]
      );
      await upsertStock(c, line.productId, line.variantId, warehouseId, -line.qty);
      const moveCode = await nextDocNo(c, "outbound");
      await c.query(
        `INSERT INTO stock_movements(code, product_id, variant_id, warehouse_id, qty_change, type, partner_id, order_id, note, created_by)
         VALUES($1,$2,$3,$4,$5,'outbound',$6,$7,$8,$9)`,
        [moveCode, line.productId, line.variantId, warehouseId, -line.qty, resolvedCustomerId, order.id, `Đơn hàng ${code}`, req.user.sub]
      );
    }

    let transaction = null;
    if (paid > 0) {
      const txCode = await nextDocNo(c, "transaction");
      transaction = (await c.query(
        `INSERT INTO transactions(code, type, category_name, amount, method, partner_id, partner_name, note, created_by)
         VALUES($1,'Thu','Bán hàng',$2,$3,$4,$5,$6,$7) RETURNING *`,
        [txCode, paid, method || null, resolvedCustomerId, customer?.name || null, `Thanh toán đơn ${code}`, req.user.sub]
      )).rows[0];
    }

    const remaining = total - paid;
    if (remaining > 0 && customer) {
      const debtCode = await nextDocNo(c, "debt");
      await c.query(
        `INSERT INTO debt_entries(code, partner_id, direction, amount, note, created_by) VALUES($1,$2,'increase',$3,$4,$5)`,
        [debtCode, customer.id, remaining, `Đơn hàng ${code} chưa thanh toán hết`, req.user.sub]
      );
      await c.query(`UPDATE partners SET debt = debt + $1 WHERE id = $2`, [remaining, customer.id]);
    }

    return { order, transaction };
  });
  res.status(201).json(result);
});

// PATCH /api/orders/:id/status { status: 'Hoàn thành' | 'Đã hủy' }
export const changeStatus = asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!["Hoàn thành", "Đã hủy"].includes(status)) throw badRequest("Trạng thái không hợp lệ");

  const result = await withTransaction(async (c) => {
    const order = (await c.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [req.params.id])).rows[0];
    if (!order) throw notFound();
    if (order.status !== "Mới") throw badRequest("Chỉ có thể đổi trạng thái đơn đang ở trạng thái Mới");

    if (status === "Đã hủy") {
      const items = (await c.query(`SELECT * FROM order_items WHERE order_id = $1`, [order.id])).rows;
      for (const item of items) {
        await upsertStock(c, item.product_id, item.variant_id, order.warehouse_id, Number(item.qty));
        const moveCode = await nextDocNo(c, "inbound");
        await c.query(
          `INSERT INTO stock_movements(code, product_id, variant_id, warehouse_id, qty_change, type, order_id, note, created_by)
           VALUES($1,$2,$3,$4,$5,'inbound',$6,$7,$8)`,
          [moveCode, item.product_id, item.variant_id, order.warehouse_id, Number(item.qty), order.id, `Hủy đơn ${order.code}`, req.user.sub]
        );
      }
      const remaining = Number(order.total) - Number(order.paid);
      if (remaining > 0 && order.customer_id) {
        await c.query(`UPDATE partners SET debt = GREATEST(debt - $1, 0) WHERE id = $2`, [remaining, order.customer_id]);
      }
    }

    const updated = (await c.query(`UPDATE orders SET status = $1 WHERE id = $2 RETURNING *`, [status, order.id])).rows[0];
    return updated;
  });
  res.json(result);
});

// POST /api/orders/:id/payments { amount, method } — thanh toán thêm cho đơn còn nợ
export const addPayment = asyncHandler(async (req, res) => {
  const { amount, method } = req.body || {};
  if (!amount || Number(amount) <= 0) throw badRequest("Số tiền không hợp lệ");

  const result = await withTransaction(async (c) => {
    const order = (await c.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [req.params.id])).rows[0];
    if (!order) throw notFound();
    const remaining = Number(order.total) - Number(order.paid);
    if (remaining <= 0) throw badRequest("Đơn hàng đã thanh toán đủ");
    const amt = Math.min(Number(amount), remaining);

    const txCode = await nextDocNo(c, "transaction");
    const tx = (await c.query(
      `INSERT INTO transactions(code, type, category_name, amount, method, partner_id, partner_name, note, created_by)
       VALUES($1,'Thu','Bán hàng',$2,$3,$4,$5,$6,$7) RETURNING *`,
      [txCode, amt, method || null, order.customer_id, order.customer_name, `Thanh toán đơn ${order.code}`, req.user.sub]
    )).rows[0];

    if (order.customer_id) {
      await c.query(`UPDATE partners SET debt = GREATEST(debt - $1, 0) WHERE id = $2`, [amt, order.customer_id]);
    }
    const updated = (await c.query(`UPDATE orders SET paid = paid + $1 WHERE id = $2 RETURNING *`, [amt, order.id])).rows[0];

    return { order: updated, transaction: tx };
  });
  res.status(201).json(result);
});

// GET /api/orders/:id/invoice — hoá đơn HTML, dùng mẫu tuỳ chỉnh ở Cài đặt nếu có
export const invoice = asyncHandler(async (req, res) => {
  const order = (await query(`SELECT * FROM orders WHERE id = $1`, [req.params.id])).rows[0];
  if (!order) throw notFound();
  const items = (await query(
    `SELECT oi.*, p.name AS product_name, p.unit, v.attrs AS variant_attrs
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_variants v ON v.id = oi.variant_id
       WHERE oi.order_id = $1`,
    [order.id]
  )).rows;

  res.type("html").send(await renderInvoiceHtml(order, items));
});
