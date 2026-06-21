import { api } from "../api/client.js";
export const listSuppliers = () => api.get("/suppliers");
export const createSupplier = (data) => api.post("/suppliers", data);
export const updateSupplier = (id, data) => api.put(`/suppliers/${id}`, data);
export const paySupplierDebt = (id, data) => api.post(`/suppliers/${id}/pay`, data);
