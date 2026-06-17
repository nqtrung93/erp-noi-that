import { api } from "../api/client.js";
export const listWarehouses = () => api.get("/warehouses");
export const createWarehouse = (data) => api.post("/warehouses", data);
