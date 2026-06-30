import { api } from "../api/client.js";

export const listPurchases = () => api.get("/purchases");
export const getPurchase = (id) => api.get(`/purchases/${id}`);
export const createPurchase = (data) => api.post("/purchases", data);
export const updatePurchase = (id, data) => api.put(`/purchases/${id}`, data);
export const removePurchase = (id) => api.del(`/purchases/${id}`);
export const confirmPurchase = (id, data) => api.post(`/purchases/${id}/confirm`, data);
export const changePurchaseStatus = (id, status) => api.patch(`/purchases/${id}/status`, { status });
export const addPurchasePayment = (id, data) => api.post(`/purchases/${id}/payments`, data);
export async function openInvoice(id) {
  const base = import.meta.env.VITE_API_URL || "http://localhost:4100/api";
  const token = localStorage.getItem("acc_token");
  const res = await fetch(`${base}/purchases/${id}/invoice`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const html = await res.text();
  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
}
