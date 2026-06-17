import { api, setToken } from "../api/client.js";

// Đăng nhập → backend trả token + user (kèm permissions). Lưu token, KHÔNG lưu mật khẩu.
export async function login(username, password) {
  const data = await api.post("/auth/login", { username, password });
  setToken(data.token);
  return data.user; // { id, name, role, warehouseId, permissions, ... }
}

export function logout() {
  setToken(null);
}

export async function me() {
  return api.get("/auth/me");
}
