import { api } from "../api/client.js";

export const listPurchases = () => api.get("/purchases");
export const getPurchase = (id) => api.get(`/purchases/${id}`);
export const createPurchase = (data) => api.post("/purchases", data);
export const updatePurchase = (id, data) => api.put(`/purchases/${id}`, data);
export const confirmPurchase = (id, data) => api.post(`/purchases/${id}/confirm`, data);
export const changePurchaseStatus = (id, status) => api.patch(`/purchases/${id}/status`, { status });
export const addPurchasePayment = (id, data) => api.post(`/purchases/${id}/payments`, data);
