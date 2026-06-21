import { api } from "../api/client.js";
export const listShops = () => api.get("/shops");
export const createShop = (name) => api.post("/shops", { name });
export const deleteShop = (id) => api.del(`/shops/${id}`);
