import { api } from "../api/client.js";

export const listOrders = () => api.get("/orders");
export const getOrder = (id) => api.get(`/orders/${id}`);
export const createOrder = (data) => api.post("/orders", data);
export const updateOrder = (id, data) => api.put(`/orders/${id}`, data);
export const removeOrder = (id) => api.del(`/orders/${id}`);
export const confirmOrder = (id, data) => api.post(`/orders/${id}/confirm`, data);
export const changeOrderStatus = (id, status) => api.patch(`/orders/${id}/status`, { status });
export const addOrderPayment = (id, data) => api.post(`/orders/${id}/payments`, data);
export async function openInvoice(id) {
  const base = import.meta.env.VITE_API_URL || "http://localhost:4100/api";
  const token = localStorage.getItem("acc_token");
  const res = await fetch(`${base}/orders/${id}/invoice`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const html = await res.text();
  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
}
