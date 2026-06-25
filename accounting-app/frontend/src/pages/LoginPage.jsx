import { useState } from "react";
import { useAuth } from "../store/auth.store.jsx";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || "Đăng nhập thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-slate-100 p-4">
      <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-lg border border-slate-100 p-7 w-full max-w-sm space-y-4">
        <div className="flex flex-col items-center gap-2 mb-2">
          <div className="text-2xl font-bold text-indigo-600 tracking-tight">Kế toán nội bộ</div>
          <h1 className="text-sm text-slate-400">Đăng nhập để tiếp tục</h1>
        </div>
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Tài khoản</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Mật khẩu</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <button disabled={busy} className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-60 transition">
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}
