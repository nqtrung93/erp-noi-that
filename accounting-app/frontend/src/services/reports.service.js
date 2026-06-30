import { api } from "../api/client.js";

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return s ? `?${s}` : "";
};

export const getCashbookSummary = (params = {}) => api.get(`/reports/cashbook${qs(params)}`);
export const getProfitLoss = (params = {}) => api.get(`/reports/profit-loss${qs(params)}`);
export const getDebtReport = (type) => api.get(`/reports/debt${qs({ type })}`);
export const getInventoryReport = () => api.get(`/reports/inventory`);
export const getSalesReport = (params = {}) => api.get(`/reports/sales${qs(params)}`);
export const getPurchaseReport = (params = {}) => api.get(`/reports/purchases${qs(params)}`);
