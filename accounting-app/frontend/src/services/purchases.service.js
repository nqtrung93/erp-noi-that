import { api } from "../api/client.js";

export const listPurchases = () => api.get("/purchases");
export const getPurchase = (id) => api.get(`/purchases/${id}`);
export const createPurchase = (data) => api.post("/purchases", data);
export const changePurchaseStatus = (id, status) => api.patch(`/purchases/${id}/status`, { status });
export const addPurchasePayment = (id, data) => api.post(`/purchases/${id}/payments`, data);
