import { api } from "../api/client.js";
export const listCarriers = () => api.get("/carriers");
export const createCarrier = (name) => api.post("/carriers", { name });
