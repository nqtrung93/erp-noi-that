import { api } from "../api/client.js";

export const getCompanyInfo = () => api.get("/settings/company");
export const updateCompanyInfo = (data) => api.put("/settings/company", data);

export const getDocFormats = () => api.get("/settings/doc-formats");
export const setDocFormat = (type, prefix, pad) => api.put("/settings/doc-formats", { type, prefix, pad });

export const getTemplates = () => api.get("/settings/templates");
export const setInvoiceTemplate = (html) => api.put("/settings/templates/invoice", { html });

export const resetData = (scope, confirm) => api.post("/admin/reset-data", { scope, confirm });
