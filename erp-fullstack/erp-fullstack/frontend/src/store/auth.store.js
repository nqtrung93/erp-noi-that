import { useState, useEffect, createContext, useContext } from "react";
import * as authService from "../services/auth.service.js";

// Store xác thực đơn giản bằng Context (không cần thư viện ngoài).
// Lưu currentUser + permissions lấy TỪ BACKEND (không hardcode ở frontend).
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Nếu đã có token, lấy lại thông tin user
    authService.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const u = await authService.login(username, password);
    setUser(u);
    return u;
  }

  function logout() {
    authService.logout();
    setUser(null);
  }

  // Kiểm tra quyền ở client chỉ để ẩn/hiện UI; backend vẫn là nơi enforce thật sự.
  const can = (perm) => !!user?.permissions?.includes(perm);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải dùng trong <AuthProvider>");
  return ctx;
}
