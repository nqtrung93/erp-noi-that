import { withTransaction, query } from "../config/db.js";
import { assertEnoughStock, applyMovement, hasEnoughStock } from "./stock.service.js";
import { badRequest, notFound } from "../utils/http.js";
import { nextDocNo } from "../utils/docFormat.js";
import { createWarrantiesForOrder, hasWarrantiesForOrder } from "./warranty.service.js";

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

    // Không đủ tồn vẫn cho tạo đơn, nhưng đánh dấu "phiếu đặt hàng" (is_preorder).
    // Tồn vẫn được kiểm chặt khi thực sự xuất hàng (chuyển "Đang giao"/"Hoàn thành").
    const isPreorder = !(await hasEnoughStock(client, input.warehouseId, items));

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

    const code = await nextDocNo(client, "orders");

    const order = (await client.query(
      `INSERT INTO orders
        (code, customer_id, warehouse_id, status, subtotal, discount, shipping,
         requires_vat, vat_rate, vat_amount, vat_invoice_status, vat_invoice_no,
         total, paid, payment, note, delivery_method, carrier, delivery_staff_id,
         is_cod, cod_amount, created_by, is_preorder, order_source, is_ecommerce, shop_id, external_order_code)
       VALUES ($1,$2,$3,'Chờ xác nhận',$4,$5,$6,$7,$8,$9,$10,'',$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       RETURNING *`,
      [
        code, input.customerId || null, input.warehouseId, subtotal, discount, shipping,
        requiresVat, vatRate, vatAmount, requiresVat ? "Chưa xuất" : null,
        total, paid, input.payment || null, input.note || null,
        input.deliveryMethod || "carrier",
        input.deliveryMethod === "self" ? null : (input.carrier || null),
        input.deliveryMethod === "self" ? (input.deliveryStaffId || null) : null,
        input.payment === "COD", input.payment === "COD" ? Math.max(total - paid, 0) : 0, createdBy, isPreorder,
        input.source || null, !!input.isEcommerce, input.shopId || null, input.externalOrderCode || null,
      ]
    )).rows[0];

    for (const it of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, variant_id, name, qty, price_at_sale, cost_at_sale)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, it.productId, it.variantId, it.name, it.qty, it.priceAtSale, it.costAtSale]
      );
    }

    // Mọi đơn đều TỰ ĐỘNG có 1 phiếu vận chuyển riêng (số phiếu VC-xxxxxx), liên kết qua order_id —
    // để tab Vận chuyển luôn theo dõi được dù đơn chưa chọn ĐVVC/COD ngay từ đầu.
    const shipDocRow = await client.query(`SELECT 'VC-' || LPAD(nextval('shipment_seq')::text, 6, '0') AS code`);
    await client.query(
      `INSERT INTO shipments (doc_no, order_id, carrier)
       VALUES ($1,$2,$3)`,
      [shipDocRow.rows[0].code, order.id, order.carrier]
    );

    return getOrderById(order.id, client);
  });
}

// Sửa thông tin cơ bản của đơn (khách hàng, giảm giá, ship, thanh toán, ghi chú, VAT có/không).
// Chỉ cho sửa khi đơn còn "Chờ xác nhận" để tránh lệch dữ liệu với tồn/đã giao.
export async function updateOrder(orderId, input, actorId) {
  return withTransaction(async (client) => {
    const order = (await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId])).rows[0];
    if (!order) throw notFound("Đơn không tồn tại");
    if (order.status !== "Chờ xác nhận") throw badRequest("Chỉ sửa được đơn đang ở trạng thái Chờ xác nhận");

    const subtotal = Number(order.subtotal);
    const discount = input.discount != null ? Number(input.discount) || 0 : Number(order.discount);
    const shipping = input.shipping != null ? Number(input.shipping) || 0 : Number(order.shipping);
    const requiresVat = input.requiresVat != null ? !!input.requiresVat : order.requires_vat;
    const base = Math.max(subtotal - discount, 0);
    const vatRate = requiresVat ? DEFAULT_VAT_RATE : 0;
    const vatAmount = requiresVat ? Math.round(base - base / (1 + vatRate / 100)) : 0;
    const total = base + shipping;

    // Thu hộ COD phải luôn khớp phương thức thanh toán — nếu đổi sang/khỏi COD lúc sửa đơn,
    // is_cod tự đổi theo, không cần tick tay + Lưu riêng ở tab Vận chuyển.
    const effectivePayment = input.payment || order.payment;
    const isCod = effectivePayment === "COD";

    await client.query(
      `UPDATE orders SET
          customer_id = $1, discount = $2, shipping = $3, requires_vat = $4, vat_rate = $5, vat_amount = $6,
          vat_invoice_status = CASE WHEN $4 AND vat_invoice_status IS NULL THEN 'Chưa xuất' WHEN NOT $4 THEN NULL ELSE vat_invoice_status END,
          total = $7, payment = COALESCE($8, payment), note = $9, carrier = COALESCE($10, carrier),
          order_source = COALESCE($11, order_source), is_cod = $13
        WHERE id = $12`,
      [
        input.customerId !== undefined ? input.customerId : order.customer_id,
        discount, shipping, requiresVat, vatRate, vatAmount, total,
        input.payment || null, input.note !== undefined ? input.note : order.note,
        input.carrier !== undefined ? input.carrier : null, input.source || null, orderId, isCod,
      ]
    );

    // Đồng bộ ĐVVC với phiếu vận chuyển — shipments.carrier mới là nguồn hiển thị thật (xem
    // SHIPMENT_OVERRIDE_COLS), nên sửa carrier ở đây cũng phải cập nhật shipments, không chỉ orders.
    if (input.carrier) {
      await client.query(`UPDATE shipments SET carrier = $1 WHERE order_id = $2`, [input.carrier, orderId]);
    }

    return getOrderById(orderId, client);
  });
}

// Tạo phiếu thu/chi gắn với 1 đơn hàng. Thu → cộng vào orders.paid (giới hạn không vượt total).
export async function addOrderPayment(orderId, { type, amount, method, note, bankAccountId }, actorId) {
  if (!["Thu", "Chi"].includes(type)) throw badRequest("Loại phiếu không hợp lệ");
  if (!amount || Number(amount) <= 0) throw badRequest("Số tiền không hợp lệ");

  return withTransaction(async (client) => {
    const order = (await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId])).rows[0];
    if (!order) throw notFound("Đơn không tồn tại");

    const code = await nextDocNo(client, "transaction");
    const tx = (await client.query(
      `INSERT INTO transactions (code, type, category, amount, method, bank_account_id, party_type, party_id, party_name, ref_type, ref_id, note, created_by)
       VALUES ($1,$2,'Theo đơn hàng',$3,$4,$5,'Khách hàng',$6,NULL,'order',$7,$8,$9) RETURNING *`,
      [code, type, Number(amount), method || null, method === "Ngân hàng" ? (bankAccountId || null) : null,
       order.customer_id, orderId, note || null, actorId]
    )).rows[0];

    if (type === "Thu") {
      const newPaid = Math.min(Number(order.paid) + Number(amount), Number(order.total));
      await client.query(`UPDATE orders SET paid = $1 WHERE id = $2`, [newPaid, orderId]);
    }
    return { transaction: tx, order: await getOrderById(orderId, client) };
  });
}

// Thu COD: tiền COD luôn = số tiền còn lại cần thu (total - paid). Tạo phiếu Thu + đánh dấu đã đối chiếu.
export async function collectCod(orderId, actorId) {
  return withTransaction(async (client) => {
    const order = (await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId])).rows[0];
    if (!order) throw notFound("Đơn không tồn tại");
    if (!order.is_cod) throw badRequest("Đơn này không thu COD");
    const remaining = Number(order.total) - Number(order.paid);
    if (remaining <= 0) throw badRequest("Đơn đã thanh toán đủ, không còn tiền COD cần thu");

    const code = await nextDocNo(client, "transaction");
    const tx = (await client.query(
      `INSERT INTO transactions (code, type, category, amount, method, party_type, party_id, ref_type, ref_id, note, created_by)
       VALUES ($1,'Thu','Thu COD',$2,'Tiền mặt','Khách hàng',$3,'order',$4,$5,$6) RETURNING *`,
      [code, remaining, order.customer_id, orderId, `Thu COD đơn ${order.code} qua ${order.carrier || "ĐVVC"}`, actorId]
    )).rows[0];

    await client.query(`UPDATE orders SET paid = total WHERE id = $1`, [orderId]);
    await client.query(`UPDATE shipments SET cod_reconciled = true WHERE order_id = $1`, [orderId]);
    return { transaction: tx, order: await getOrderById(orderId, client) };
  });
}

// Trả phí ship cho đơn vị vận chuyển của 1 đơn — tạo phiếu Chi + đánh dấu đã trả trên phiếu vận chuyển.
export async function payShipCost(orderId, actorId) {
  return withTransaction(async (client) => {
    const order = (await client.query(`SELECT * FROM orders WHERE id = $1`, [orderId])).rows[0];
    if (!order) throw notFound("Đơn không tồn tại");
    const shipment = (await client.query(`SELECT * FROM shipments WHERE order_id = $1 FOR UPDATE`, [orderId])).rows[0];
    if (!shipment) throw notFound("Đơn chưa có phiếu vận chuyển");
    if (Number(shipment.ship_cost) <= 0) throw badRequest("Đơn này chưa có phí ship cần trả");
    if (shipment.ship_cost_paid) throw badRequest("Phí ship của đơn này đã được trả");

    const code = await nextDocNo(client, "transaction");
    const tx = (await client.query(
      `INSERT INTO transactions (code, type, category, amount, method, party_type, party_name, ref_type, ref_id, note, created_by)
       VALUES ($1,'Chi','Trả phí vận chuyển',$2,'Tiền mặt','Đơn vị vận chuyển',$3,'order',$4,$5,$6) RETURNING *`,
      [code, Number(shipment.ship_cost), shipment.carrier || null, orderId,
       `Trả phí ship đơn ${order.code} cho ${shipment.carrier || "ĐVVC"}`, actorId]
    )).rows[0];

    await client.query(`UPDATE shipments SET ship_cost_paid = true WHERE order_id = $1`, [orderId]);
    return { transaction: tx, order: await getOrderById(orderId, client) };
  });
}

// Chuyển trạng thái đơn + đồng bộ tồn (#8/#9). Idempotent qua cờ stock_applied.
// reason: lý do huỷ/trả hàng, chỉ áp dụng khi newStatus = "Đã huỷ".
export async function setOrderStatus(orderId, newStatus, actorId, reason = null) {
  return withTransaction(async (client) => {
    const order = (await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId])).rows[0];
    if (!order) throw notFound("Đơn không tồn tại");

    const items = (await client.query(`SELECT * FROM order_items WHERE order_id = $1`, [orderId])).rows;
    const willConsume = STOCK_CONSUMING.has(newStatus) && newStatus !== "Đã huỷ";
    const wasApplied = order.stock_applied;

    // Trừ tồn khi lần đầu chuyển sang trạng thái tiêu tồn (#8) — gộp tất cả dòng của đơn vào 1 số phiếu xuất.
    if (willConsume && !wasApplied) {
      await assertEnoughStock(
        client,
        order.warehouse_id,
        items.map((i) => ({ productId: i.product_id, variantId: i.variant_id, qty: i.qty, name: i.name }))
      );
      const saleDocNo = await nextDocNo(client, "saleout");
      for (const i of items) {
        await applyMovement(client, {
          productId: i.product_id, variantId: i.variant_id, warehouseId: order.warehouse_id,
          qtyChange: -i.qty, type: "sale", refType: "order", refId: order.id,
          reason: `Xuất bán đơn ${order.code}`, createdBy: actorId, docNo: saleDocNo,
        });
      }
      await client.query(`UPDATE orders SET stock_applied = true, sale_doc_no = $2 WHERE id = $1`, [orderId, saleDocNo]);
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
    await client.query(
      `UPDATE orders SET status = $1, delivery_status = $2,
          cancel_reason = CASE WHEN $1 = 'Đã huỷ' THEN COALESCE($4, cancel_reason) ELSE cancel_reason END
        WHERE id = $3`,
      [newStatus, deliveryStatus, orderId, reason]
    );
    // shipments.delivery_status mới là nguồn hiển thị thật ở tab Vận chuyển (xem SHIPMENT_OVERRIDE_COLS)
    // — phải đồng bộ ở đây, không chỉ orders, nếu không tab Vận chuyển sẽ không thấy "Đã giao".
    if (newStatus === "Hoàn thành") {
      await client.query(`UPDATE shipments SET delivery_status = 'Đã giao' WHERE order_id = $1`, [orderId]);
    }

    // Tự tạo phiếu bảo hành (nếu sản phẩm có khai báo bộ phận bảo hành) khi đơn hoàn thành lần đầu.
    if (newStatus === "Hoàn thành" && !(await hasWarrantiesForOrder(client, orderId))) {
      await createWarrantiesForOrder(client, order);
    }

    return getOrderById(orderId, client);
  });
}

// Xoá cứng đơn hàng — chỉ dành cho Admin (kiểm tra quyền ở controller). Không cho xoá nếu đã trừ tồn
// mà chưa hoàn tồn (tránh lệch số liệu kho); phải huỷ/trả hàng trước rồi mới xoá.
export async function deleteOrder(orderId) {
  return withTransaction(async (client) => {
    const order = (await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId])).rows[0];
    if (!order) throw notFound("Đơn không tồn tại");
    if (order.stock_applied) throw badRequest("Đơn đã trừ tồn — hãy huỷ/trả hàng trước khi xoá");
    await client.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
  });
}

// Cột carrier/tracking_no/cod_reconciled/delivery_status/ship_cost lấy từ bảng shipments
// (đặt SAU o.* để đè giá trị cũ trên orders — shipments là nguồn dữ liệu chính cho vận chuyển/COD).
// "Số tiền cần thu" (amount_due) KHÔNG lấy từ shipments.cod_amount (snapshot có thể lệch) —
// luôn tính trực tiếp = orders.total - orders.paid, áp dụng cho MỌI đơn (không chỉ đơn COD).
const SHIPMENT_OVERRIDE_COLS = `
  sh.doc_no AS shipment_doc_no, sh.carrier, sh.tracking_no,
  sh.cod_reconciled, sh.delivery_status, sh.ship_cost, sh.ship_cost_paid,
  GREATEST(o.total - o.paid, 0) AS amount_due`;

export async function getOrderById(id, client = { query }) {
  const order = (await client.query(
    `SELECT o.*, w.name AS warehouse_name, w.code AS warehouse_code, c.name AS customer_name, c.phone AS customer_phone,
            s.name AS shop_name, u.name AS created_by_name, ${SHIPMENT_OVERRIDE_COLS}
       FROM orders o
       LEFT JOIN warehouses w ON w.id = o.warehouse_id
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN shops s ON s.id = o.shop_id
       LEFT JOIN users u ON u.id = o.created_by
       LEFT JOIN shipments sh ON sh.order_id = o.id
      WHERE o.id = $1`,
    [id]
  )).rows[0];
  if (!order) return null;
  const items = (await client.query(`SELECT * FROM order_items WHERE order_id = $1`, [id])).rows;
  return { ...order, items };
}

// filters.sku: lọc đơn có chứa sản phẩm/biến thể khớp SKU (dùng EXISTS để không nhân dòng đơn).
export async function listOrders(filters = {}) {
  const { sku } = filters;
  const params = [];
  let where = "";
  if (sku) {
    params.push(`%${sku}%`);
    where = `WHERE EXISTS (
      SELECT 1 FROM order_items oi
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN product_variants v ON v.id = oi.variant_id
       WHERE oi.order_id = o.id AND (p.sku ILIKE $1 OR v.sku ILIKE $1 OR p.code ILIKE $1)
    )`;
  }
  const { rows } = await query(
    `SELECT o.*, c.name AS customer_name, c.payment_term_days AS customer_payment_term_days,
            s.name AS shop_name, u.name AS created_by_name, ${SHIPMENT_OVERRIDE_COLS}
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN shops s ON s.id = o.shop_id
       LEFT JOIN users u ON u.id = o.created_by
       LEFT JOIN shipments sh ON sh.order_id = o.id
       ${where}
      ORDER BY o.created_at DESC`,
    params
  );
  return rows;
}
