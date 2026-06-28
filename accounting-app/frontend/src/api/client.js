// Lớp gọi API duy nhất. Token JWT lấy từ localStorage (do login set).
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4100/api";

function getToken() {
  return localStorage.getItem("acc_token") || null;
}

export function setToken(token) {
  if (token) localStorage.setItem("acc_token", token);
  else localStorage.removeItem("acc_token");
}

async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) setToken(null);
  if (!res.ok) {
    let message = `Lỗi ${res.status}`;
    try { message = (await res.json()).error || message; } catch { /* ignore */ }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: "POST", body }),
  put: (p, body) => request(p, { method: "PUT", body }),
  patch: (p, body) => request(p, { method: "PATCH", body }),
  del: (p) => request(p, { method: "DELETE" }),
};
