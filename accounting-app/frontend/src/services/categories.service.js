import { api } from "../api/client.js";

export const listCategories = () => api.get("/categories");
export const createCategory = (data) => api.post("/categories", data);
export const removeCategory = (id) => api.del(`/categories/${id}`);
