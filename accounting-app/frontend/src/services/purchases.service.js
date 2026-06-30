import { api } from "../api/client.js";

export const listPurchases = () => api.get("/purchases");
export const getPurchase = (id) => api.get(`/purchases/${id}`);
export const createPurchase = (data) => api.post("/purchases", data);
export const updatePurchase = (id, data) => api.put(`/purchases/${id}`, data);
export const removePurchase = (id) => api.del(`/purchases/${id}`);
export const confirmPurchase = (id, data) => api.post(`/purchases/${id}/confirm`, data);
export const changePurchaseStatus = (id, status) => api.patch(`/purchases/${id}/status`, { status });
export const addPurchasePayment = (id, data) => api.post(`/purchases/${id}/payments`, data);
async function fetchInvoiceHtml(id) {
  const base = import.meta.env.VITE_API_URL || "http://localhost:4100/api";
  const token = localStorage.getItem("acc_token");
  const res = await fetch(`${base}/purchases/${id}/invoice`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
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

// Tải phiếu về máy dạng PDF khổ A4, đặt tên file dạng "Phiếu nhập kho mua hàng - <mã đơn>.pdf".
export async function downloadInvoice(id, code) {
  const base = import.meta.env.VITE_API_URL || "http://localhost:4100/api";
  const token = localStorage.getItem("acc_token");
  const res = await fetch(`${base}/purchases/${id}/invoice.pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Phiếu nhập kho mua hàng - ${code}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
