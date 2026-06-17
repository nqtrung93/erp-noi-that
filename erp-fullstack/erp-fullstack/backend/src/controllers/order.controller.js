import * as orderService from "../services/order.service.js";
import { renderInvoiceHtml } from "../services/invoice.service.js";
import { asyncHandler, badRequest, notFound } from "../utils/http.js";

export const list = asyncHandler(async (req, res) => {
  res.json(await orderService.listOrders());
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

// PATCH /api/orders/:id/status  { status }
export const changeStatus = asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  const allowed = ["Chờ xác nhận", "Đang giao", "Hoàn thành", "Đã huỷ"];
  if (!allowed.includes(status)) throw badRequest("Trạng thái không hợp lệ");
  const order = await orderService.setOrderStatus(req.params.id, status, req.user.sub);
  res.json(order);
});

// GET /api/orders/:id/invoice → HTML đã escape (chống XSS)
export const invoice = asyncHandler(async (req, res) => {
  const html = await renderInvoiceHtml(req.params.id);
  res.type("html").send(html);
});
