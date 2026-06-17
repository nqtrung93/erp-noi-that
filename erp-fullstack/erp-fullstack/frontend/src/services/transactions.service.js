import { api } from "../api/client.js";
export const listTransactions = () => api.get("/transactions");
export const createTransaction = (data) => api.post("/transactions", data);
