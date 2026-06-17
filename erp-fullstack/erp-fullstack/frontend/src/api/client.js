// Lớp gọi API duy nhất. Token JWT lấy từ localStorage (do login set), KHÔNG hardcode
// bất kỳ user/password nào ở frontend (#4).
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function getToken() {
  return localStorage.getItem("erp_token") || null;
}

export function setToken(token) {
  if (token) localStorage.setItem("erp_token", token);
  else localStorage.removeItem("erp_token");
}

async function request(path, { method = "GET", body, raw = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    setToken(null); // token hết hạn → buộc đăng nhập lại
  }
  if (!res.ok) {
    let message = `Lỗi ${res.status}`;
    try { message = (await res.json()).error || message; } catch { /* ignore */ }
    throw new Error(message);
  }
  if (raw) return res.text();
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: "POST", body }),
  put: (p, body) => request(p, { method: "PUT", body }),
  patch: (p, body) => request(p, { method: "PATCH", body }),
  del: (p) => request(p, { method: "DELETE" }),
  getRaw: (p) => request(p, { raw: true }),
};
