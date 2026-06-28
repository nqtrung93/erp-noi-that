import { api } from "../api/client.js";

export const listWarranties = (q) => api.get(`/warranties${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const getWarranty = (id) => api.get(`/warranties/${id}`);
export const getWarrantyPrintHtml = (id) => api.getRaw(`/warranties/${id}/print`);
export const downloadWarrantyPdf = (id) => api.downloadFile(`/warranties/${id}/print/pdf`);
