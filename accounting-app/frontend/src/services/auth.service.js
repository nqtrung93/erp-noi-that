import { api, setToken } from "../api/client.js";

export async function login(username, password) {
  const { token } = await api.post("/auth/login", { username, password });
  setToken(token);
  return me();
}

export const me = () => api.get("/auth/me");

export function logout() {
  setToken(null);
}
