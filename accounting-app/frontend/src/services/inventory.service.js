import { api } from "../api/client.js";

export const listProducts = () => api.get("/products");
export const getProduct = (id) => api.get(`/products/${id}`);
export const createProduct = (data) => api.post("/products", data);
export const updateProduct = (id, data) => api.put(`/products/${id}`, data);
export const removeProduct = (id) => api.del(`/products/${id}`);

export const listVariants = (productId) => api.get(`/products/${productId}/variants`);
export const createVariant = (productId, data) => api.post(`/products/${productId}/variants`, data);
export const updateVariant = (productId, variantId, data) => api.put(`/products/${productId}/variants/${variantId}`, data);
export const removeVariant = (productId, variantId) => api.del(`/products/${productId}/variants/${variantId}`);

export const listWarehouses = () => api.get("/warehouses");
export const createWarehouse = (data) => api.post("/warehouses", data);
export const updateWarehouse = (id, data) => api.put(`/warehouses/${id}`, data);
export const removeWarehouse = (id) => api.del(`/warehouses/${id}`);

export const listStock = () => api.get("/stock");
export const listMovements = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return api.get(`/stock/movements${qs ? `?${qs}` : ""}`);
};
export const inbound = (data) => api.post("/stock/inbound", data);
export const outbound = (data) => api.post("/stock/outbound", data);
export const adjust = (data) => api.post("/stock/adjust", data);
export const transfer = (data) => api.post("/stock/transfer", data);
