import { api } from "../api/client.js";

export const listBankAccounts = () => api.get("/bank-accounts");
export const createBankAccount = (data) => api.post("/bank-accounts", data);
export const updateBankAccount = (id, data) => api.put(`/bank-accounts/${id}`, data);
export const removeBankAccount = (id) => api.del(`/bank-accounts/${id}`);
export const getBankTransactions = (id) => api.get(`/bank-accounts/${id}/transactions`);
