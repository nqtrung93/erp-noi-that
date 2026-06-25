import { api } from "../api/client.js";

export const listTransactions = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return api.get(`/transactions${qs ? `?${qs}` : ""}`);
};
export const createTransaction = (data) => api.post("/transactions", data);
export const removeTransaction = (id) => api.del(`/transactions/${id}`);
