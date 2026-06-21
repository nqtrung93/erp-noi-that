import { api } from "../api/client.js";

export const listOrders = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return api.get(`/orders${q ? `?${q}` : ""}`);
};
export const getOrder = (id) => api.get(`/orders/${id}`);
export const createOrder = (data) => api.post("/orders", data);
export const updateOrder = (id, data) => api.put(`/orders/${id}`, data);
export const addOrderPayment = (id, data) => api.post(`/orders/${id}/payments`, data);

// Đổi trạng thái: backend tự kiểm tồn, trừ tồn (xác nhận/hoàn thành) hoặc hoàn tồn (huỷ/trả hàng)
export const setOrderStatus = (id, status, reason) => api.patch(`/orders/${id}/status`, { status, reason });

export const deleteOrder = (id) => api.del(`/orders/${id}`);
export const collectCod = (id) => api.post(`/orders/${id}/collect-cod`, {});
export const payShipCost = (id) => api.post(`/orders/${id}/pay-ship-cost`, {});

// Lấy HTML hoá đơn (đã escape XSS ở backend) để in
export const getInvoiceHtml = (id) => api.getRaw(`/orders/${id}/invoice`);

// Lấy HTML phiếu vận chuyển (đã escape XSS ở backend) để in
export const getShipmentPrintHtml = (id) => api.getRaw(`/orders/${id}/shipment-print`);

// Cập nhật thông tin vận chuyển (hãng ship, mã vận đơn, trạng thái giao)
export const updateShipping = (id, data) => api.patch(`/orders/${id}/shipping`, data);

// Cập nhật trạng thái/mã hoá đơn VAT
export const updateVat = (id, data) => api.patch(`/orders/${id}/vat`, data);
