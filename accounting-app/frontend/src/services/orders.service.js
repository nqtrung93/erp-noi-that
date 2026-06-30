import { api } from "../api/client.js";

export const listOrders = () => api.get("/orders");
export const getOrder = (id) => api.get(`/orders/${id}`);
export const createOrder = (data) => api.post("/orders", data);
export const updateOrder = (id, data) => api.put(`/orders/${id}`, data);
export const removeOrder = (id) => api.del(`/orders/${id}`);
export const confirmOrder = (id, data) => api.post(`/orders/${id}/confirm`, data);
export const changeOrderStatus = (id, status) => api.patch(`/orders/${id}/status`, { status });
export const addOrderPayment = (id, data) => api.post(`/orders/${id}/payments`, data);
async function fetchInvoiceHtml(id) {
  const base = import.meta.env.VITE_API_URL || "http://localhost:4100/api";
  const token = localStorage.getItem("acc_token");
  const res = await fetch(`${base}/orders/${id}/invoice`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return res.text();
}

// Mở phiếu trong tab mới và tự gọi hộp thoại in của trình duyệt (đợi tải xong, kể cả logo).
export async function openInvoice(id) {
  const html = await fetchInvoiceHtml(id);
  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.onload = () => win.print();
}

// Tải phiếu về máy dạng PDF khổ A4, đặt tên file dạng "Phiếu xuất kho bán hàng - <mã đơn>.pdf".
export async function downloadInvoice(id, code) {
  const base = import.meta.env.VITE_API_URL || "http://localhost:4100/api";
  const token = localStorage.getItem("acc_token");
  const res = await fetch(`${base}/orders/${id}/invoice.pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Phiếu xuất kho bán hàng - ${code}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
