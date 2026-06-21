import { api } from "../api/client.js";
export const listOrderSources = () => api.get("/order-sources");
export const createOrderSource = (name) => api.post("/order-sources", { name });
export const deleteOrderSource = (id) => api.del(`/order-sources/${id}`);
