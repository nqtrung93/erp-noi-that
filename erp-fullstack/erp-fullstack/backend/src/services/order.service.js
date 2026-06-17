import { withTransaction, query } from "../config/db.js";
import { assertEnoughStock, applyMovement } from "./stock.service.js";
import { badRequest, notFound } from "../utils/http.js";

const DEFAULT_VAT_RATE = 8;

// Trạng thái khiến tồn bị trừ (đã xuất hàng)
const STOCK_CONSUMING = new Set(["Đang giao", "Hoàn thành"]);

// Lấy snapshot giá bán & giá vốn của 1 dòng tại thời điểm bán (#10).
async function snapshotItem(client, { productId, variantId, qty, priceOverride }) {
  const prod = (await client.query(`SELECT * FROM products WHERE id = $1`, [productId])).rows[0];
  if (!prod) throw badRequest("Sản phẩm không tồn tại");

  let basePrice = Number(prod.price);
  let baseCost = Number(prod.cost);
  let name = prod.name;

  if (prod.has_variants) {
    if (!variantId) throw badRequest(`Sản phẩm "${prod.name}" yêu cầu chọn biến thể`);
    const v = (await client.query(
      `SELECT * FROM product_variants WHERE id = $1 AND product_id = $2`,
      [variantId, productId]
    )).rows[0];
    if (!v) throw badRequest("Biến thể không hợp lệ");
    basePrice = Number(v.price);
    baseCost = Number(v.cost);
    const attrs = v.attrs || {};
    name = `${prod.name} (${Object.values(attrs).join(" / ")})`;
  }

  const priceAtSale = priceOverride != null && priceOverride !== "" ? Number(priceOverride) : basePrice;
  return { productId, variantId: variantId ?? null, name, qty: Number(qty), priceAtSale, costAtSale: baseCost };
}

// Tạo đơn: kiểm tồn (#7) + lưu priceAtSale/costAtSale (#10). Mã đơn dùng sequence (#13).
export async function createOrder(input, createdBy) {
  return withTransaction(async (client) => {
    const items = [];
    for (const raw of input.items || []) {
      items.push(await snapshotItem(client, raw));
    }
    if (!items.length) throw badRequest("Đơn phải có ít nhất 1 sản phẩm");

    // Kiểm tồn theo warehouse + product + variant (#7)
    await assertEnoughStock(client, input.warehouseId, items);

    const subtotal = items.reduce((s, i) => s + i.priceAtSale * i.qty, 0);
    const discount = Number(input.discount) || 0;
    const base = Math.max(subtotal - discount, 0);
    const shipping = Number(input.shipping) || 0;        // phí thu khách (nếu có)
    const requiresVat = !!input.requiresVat;
    const vatRate = requiresVat ? DEFAULT_VAT_RATE : 0;
    // Giá đã gồm VAT → tách ngược
    const vatAmount = requiresVat ? Math.round(base - base / (1 + vatRate / 100)) : 0;
    const total = base + shipping;
    const paid = Math.min(Number(input.paidNow) || 0, total);

    const codeRow = await client.query(`SELECT 'ORD-' || LPAD(nextval('order_seq')::text, 6, '0') AS code`);
    const code = codeRow.rows[0].code;

    const order = (await client.query(
      `INSERT INTO orders
        (code, customer_id, warehouse_id, status, subtotal, discount, shipping,
         requires_vat, vat_rate, vat_amount, vat_invoice_status, vat_invoice_no,
         total, paid, payment, note, delivery_method, carrier, delivery_staff_id,
         is_cod, cod_amount, created_by)
       VALUES ($1,$2,$3,'Chờ xác nhận',$4,$5,$6,$7,$8,$9,$10,'',$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        code, input.customerId, input.warehouseId, subtotal, discount, shipping,
        requiresVat, vatRate, vatAmount, requiresVat ? "Chưa xuất" : null,
        total, paid, input.payment || null, input.note || null,
        input.deliveryMethod || "carrier",
        input.deliveryMethod === "self" ? null : (input.carrier || null),
        input.deliveryMethod === "self" ? (input.deliveryStaffId || null) : null,
        input.payment === "COD", input.payment === "COD" ? total : 0, createdBy,
      ]
    )).rows[0];

    for (const it of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, variant_id, name, qty, price_at_sale, cost_at_sale)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, it.productId, it.variantId, it.name, it.qty, it.priceAtSale, it.costAtSale]
      );
    }

    return getOrderById(order.id);
  });
}

// Chuyển trạng thái đơn + đồng bộ tồn (#8/#9). Idempotent qua cờ stock_applied.
export async function setOrderStatus(orderId, newStatus, actorId) {
  return withTransaction(async (client) => {
    const order = (await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId])).rows[0];
    if (!order) throw notFound("Đơn không tồn tại");

    const items = (await client.query(`SELECT * FROM order_items WHERE order_id = $1`, [orderId])).rows;
    const willConsume = STOCK_CONSUMING.has(newStatus) && newStatus !== "Đã huỷ";
    const wasApplied = order.stock_applied;

    // Trừ tồn khi lần đầu chuyển sang trạng thái tiêu tồn (#8)
    if (willConsume && !wasApplied) {
      await assertEnoughStock(
        client,
        order.warehouse_id,
        items.map((i) => ({ productId: i.product_id, variantId: i.variant_id, qty: i.qty, name: i.name }))
      );
      for (const i of items) {
        await applyMovement(client, {
          productId: i.product_id, variantId: i.variant_id, warehouseId: order.warehouse_id,
          qtyChange: -i.qty, type: "sale", refType: "order", refId: order.id,
          reason: `Xuất bán đơn ${order.code}`, createdBy: actorId,
        });
      }
      await client.query(`UPDATE orders SET stock_applied = true WHERE id = $1`, [orderId]);
    }

    // Hoàn tồn khi huỷ/hoàn hàng nếu trước đó đã trừ (#9: movement ngược)
    if (newStatus === "Đã huỷ" && wasApplied) {
      for (const i of items) {
        await applyMovement(client, {
          productId: i.product_id, variantId: i.variant_id, warehouseId: order.warehouse_id,
          qtyChange: +i.qty, type: "return", refType: "order", refId: order.id,
          reason: `Hoàn tồn do huỷ đơn ${order.code}`, createdBy: actorId,
        });
      }
      await client.query(`UPDATE orders SET stock_applied = false WHERE id = $1`, [orderId]);
    }

    // Đồng bộ trạng thái giao khi hoàn thành
    const deliveryStatus = newStatus === "Hoàn thành" ? "Đã giao" : order.delivery_status;
    await client.query(`UPDATE orders SET status = $1, delivery_status = $2 WHERE id = $3`,
      [newStatus, deliveryStatus, orderId]);

    return getOrderById(orderId);
  });
}

export async function getOrderById(id) {
  const order = (await query(`SELECT * FROM orders WHERE id = $1`, [id])).rows[0];
  if (!order) return null;
  const items = (await query(`SELECT * FROM order_items WHERE order_id = $1`, [id])).rows;
  return { ...order, items };
}

export async function listOrders() {
  const { rows } = await query(`SELECT * FROM orders ORDER BY created_at DESC`);
  return rows;
}
