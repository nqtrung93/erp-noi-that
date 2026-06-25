import { useState, useEffect, createContext, useContext } from "react";
import * as authService from "../services/auth.service.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
