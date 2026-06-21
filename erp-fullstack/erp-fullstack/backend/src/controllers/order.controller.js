import * as orderService from "../services/order.service.js";
import { renderInvoiceHtml } from "../services/invoice.service.js";
import { query } from "../config/db.js";
import { asyncHandler, badRequest, notFound, forbidden } from "../utils/http.js";

export const list = asyncHandler(async (req, res) => {
  res.json(await orderService.listOrders({ sku: req.query.sku }));
});

export const getOne = asyncHandler(async (req, res) => {
  const o = await orderService.getOrderById(req.params.id);
  if (!o) throw notFound();
  res.json(o);
});

// POST /api/orders → tạo đơn (kiểm tồn + snapshot price/cost)
export const create = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder(req.body || {}, req.user.sub);
  res.status(201).json(order);
});

// PATCH /api/orders/:id/status  { status, reason } → reason dùng khi huỷ đơn / trả hàng
export const changeStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body || {};
  const allowed = ["Chờ xác nhận", "Đang giao", "Hoàn thành", "Đã huỷ"];
  if (!allowed.includes(status)) throw badRequest("Trạng thái không hợp lệ");
  const order = await orderService.setOrderStatus(req.params.id, status, req.user.sub, reason || null);
  res.json(order);
});

// DELETE /api/orders/:id → xoá cứng, CHỈ Admin được phép
export const remove = asyncHandler(async (req, res) => {
  if (req.user.role !== "Admin") throw forbidden("Chỉ Admin được xoá đơn hàng");
  await orderService.deleteOrder(req.params.id);
  res.status(204).end();
});

// POST /api/orders/:id/collect-cod → thu tiền COD, tự tạo phiếu thu
export const collectCod = asyncHandler(async (req, res) => {
  const result = await orderService.collectCod(req.params.id, req.user.sub);
  res.status(201).json(result);
});

// POST /api/orders/:id/pay-ship-cost → trả phí ship cho ĐVVC, tự tạo phiếu chi
export const payShipCost = asyncHandler(async (req, res) => {
  const result = await orderService.payShipCost(req.params.id, req.user.sub);
  res.status(201).json(result);
});

// PATCH /api/orders/:id/shipping  { carrier, trackingNo, deliveryStatus, isCod, shipCost, codReconciled }
// Ghi vào phiếu vận chuyển (bảng shipments) liên kết với đơn — KHÔNG còn ghi trực tiếp lên orders.
// Khi đánh dấu "Đã giao", tự động chuyển đơn sang "Hoàn thành" ở tab bán hàng (đồng bộ 2 tab).
// "Số tiền cần thu" KHÔNG còn lưu snapshot riêng — luôn tính = orders.total - orders.paid tại thời điểm
// xem (1 nguồn dữ liệu duy nhất, tránh lệch giữa đơn hàng và phiếu vận chuyển).
export const updateShipping = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const allowed = ["Chưa giao", "Đang giao", "Đã giao", "Giao thất bại"];
  if (b.deliveryStatus && !allowed.includes(b.deliveryStatus)) throw badRequest("Trạng thái giao hàng không hợp lệ");

  const orderRow = (await query(`SELECT * FROM orders WHERE id = $1`, [req.params.id])).rows[0];
  if (!orderRow) throw notFound();

  if (b.isCod !== undefined) {
    await query(`UPDATE orders SET is_cod = $1 WHERE id = $2`, [!!b.isCod, req.params.id]);
  }

  await query(
    `UPDATE shipments SET carrier = COALESCE($1, carrier), tracking_no = COALESCE($2, tracking_no),
        delivery_status = COALESCE($3, delivery_status), ship_cost = COALESCE($4, ship_cost),
        cod_reconciled = COALESCE($5, cod_reconciled)
      WHERE order_id = $6`,
    [b.carrier || null, b.trackingNo || null, b.deliveryStatus || null, b.shipCost, b.codReconciled, req.params.id]
  );

  let order = await orderService.getOrderById(req.params.id);
  if (b.deliveryStatus === "Đã giao" && order.status !== "Hoàn thành" && order.status !== "Đã huỷ") {
    order = await orderService.setOrderStatus(order.id, "Hoàn thành", req.user.sub);
  }
  res.json(order);
});

// PUT /api/orders/:id → sửa thông tin cơ bản (chỉ khi đơn còn "Chờ xác nhận")
export const update = asyncHandler(async (req, res) => {
  const order = await orderService.updateOrder(req.params.id, req.body || {}, req.user.sub);
  res.json(order);
});

// POST /api/orders/:id/payments  { type, amount, method, note } → phiếu thu/chi gắn với đơn
export const addPayment = asyncHandler(async (req, res) => {
  const result = await orderService.addOrderPayment(req.params.id, req.body || {}, req.user.sub);
  res.status(201).json(result);
});

// PATCH /api/orders/:id/vat  { vatInvoiceStatus, vatInvoiceNo } → cập nhật hoá đơn VAT
export const updateVat = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const order = (await query(`SELECT requires_vat FROM orders WHERE id = $1`, [req.params.id])).rows[0];
  if (!order) throw notFound();
  if (!order.requires_vat) throw badRequest("Đơn này không yêu cầu hoá đơn VAT");
  const { rows } = await query(
    `UPDATE orders SET vat_invoice_status = COALESCE($1, vat_invoice_status), vat_invoice_no = COALESCE($2, vat_invoice_no)
      WHERE id = $3 RETURNING *`,
    [b.vatInvoiceStatus || null, b.vatInvoiceNo || null, req.params.id]
  );
  res.json(rows[0]);
});

// GET /api/orders/:id/invoice → HTML đã escape (chống XSS)
export const invoice = asyncHandler(async (req, res) => {
  const html = await renderInvoiceHtml(req.params.id);
  res.type("html").send(html);
});
