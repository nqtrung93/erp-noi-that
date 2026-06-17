import { api } from "../api/client.js";
export const profitReport = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return api.get(`/reports/profit${q ? `?${q}` : ""}`);
};
export const inventoryReport = () => api.get("/reports/inventory");
