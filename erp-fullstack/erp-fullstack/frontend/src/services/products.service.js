import { api } from "../api/client.js";

export const listProducts = () => api.get("/products");
export const getProduct = (id) => api.get(`/products/${id}`);
export const createProduct = (data) => api.post("/products", data);
export const updateProduct = (id, data) => api.put(`/products/${id}`, data);
export const deleteProduct = (id) => api.del(`/products/${id}`);

// Biến thể (variants)
export const createVariant = (productId, data) => api.post(`/products/${productId}/variants`, data);
export const updateVariant = (productId, variantId, data) => api.put(`/products/${productId}/variants/${variantId}`, data);
export const deleteVariant = (productId, variantId) => api.del(`/products/${productId}/variants/${variantId}`);
