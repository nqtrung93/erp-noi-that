import { api } from "../api/client.js";
export const profitReport = (params = {}) => {
  // URLSearchParams stringify undefined thành chữ "undefined" — phải lọc bỏ trước khi build query.
  const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
  return api.get(`/reports/profit${q ? `?${q}` : ""}`);
};
export const inventoryReport = () => api.get("/reports/inventory");
export const shopDebtReport = () => api.get("/reports/shop-debt");
