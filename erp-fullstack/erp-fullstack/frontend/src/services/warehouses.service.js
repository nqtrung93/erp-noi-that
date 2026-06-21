import { api } from "../api/client.js";
export const listWarehouses = () => api.get("/warehouses");
export const createWarehouse = (data) => api.post("/warehouses", data);
export const updateWarehouse = (id, data) => api.put(`/warehouses/${id}`, data);
export const deleteWarehouse = (id) => api.del(`/warehouses/${id}`);
