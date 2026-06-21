import { api } from "../api/client.js";
export const listCategories = () => api.get("/categories");
export const createCategory = (name) => api.post("/categories", { name });
