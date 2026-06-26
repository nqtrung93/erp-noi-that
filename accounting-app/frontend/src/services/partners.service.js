import { api } from "../api/client.js";

export const listPartners = () => api.get("/partners");
export const createPartner = (data) => api.post("/partners", data);
export const updatePartner = (id, data) => api.put(`/partners/${id}`, data);
export const removePartner = (id) => api.del(`/partners/${id}`);
export const adjustDebt = (id, data) => api.post(`/partners/${id}/debt`, data);
export const debtHistory = (id) => api.get(`/partners/${id}/debt-entries`);
export const importDebt = (rows) => api.post("/partners/import", { rows });
