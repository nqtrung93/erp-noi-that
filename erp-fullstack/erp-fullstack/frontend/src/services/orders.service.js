import { api } from "../api/client.js";

export const listOrders = () => api.get("/orders");
export const getOrder = (id) => api.get(`/orders/${id}`);
export const createOrder = (data) => api.post("/orders", data);

// Đổi trạng thái: backend tự kiểm tồn, trừ tồn (xác nhận/hoàn thành) hoặc hoàn tồn (huỷ)
export const setOrderStatus = (id, status) => api.patch(`/orders/${id}/status`, { status });

// Lấy HTML hoá đơn (đã escape XSS ở backend) để in
export const getInvoiceHtml = (id) => api.getRaw(`/orders/${id}/invoice`);
