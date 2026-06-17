import { useState } from "react";
import { AuthProvider, useAuth } from "./store/auth.store.js";
import LoginPage from "./pages/LoginPage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";

// Khung app tối giản. Các trang khác (Dashboard, Products, CRM, Warehouse,
// Shipping, VatInvoices, Reports, Employees) được port từ bản single-file cũ
// sang thư mục pages/ theo cùng mẫu OrdersPage (dùng services + store).
const TABS = [
  { id: "orders", label: "Đơn hàng", perm: "orders", el: <OrdersPage /> },
  // { id: "products", label: "Sản phẩm", perm: "products", el: <ProductsPage /> },
  // ...thêm dần
];

function Shell() {
  const { user, loading, logout, can } = useAuth();
  const [tab, setTab] = useState("orders");

  if (loading) return <div className="p-8 text-slate-400">Đang tải…</div>;
  if (!user) return <LoginPage />;

  const visibleTabs = TABS.filter((t) => can(t.perm));
  const current = visibleTabs.find((t) => t.id === tab) || visibleTabs[0];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <div className="font-bold text-teal-600">ErgoERP</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">{user.name} · {user.role}</span>
          <button onClick={logout} className="text-red-500 hover:underline">Đăng xuất</button>
        </div>
      </header>
      <nav className="bg-white border-b border-slate-100 px-4 flex gap-1 overflow-x-auto">
        {visibleTabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 ${current?.id === t.id ? "border-teal-600 text-teal-600" : "border-transparent text-slate-500"}`}>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="max-w-6xl mx-auto p-4">{current?.el}</main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
