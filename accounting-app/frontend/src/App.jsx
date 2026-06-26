import { useState } from "react";
import { AuthProvider, useAuth } from "./store/auth.store.jsx";
import Sidebar from "./components/Sidebar.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import CashbookPage from "./pages/CashbookPage.jsx";
import PartnersPage from "./pages/PartnersPage.jsx";
import CategoriesPage from "./pages/CategoriesPage.jsx";
import InventoryPage from "./pages/InventoryPage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";
import PurchasesPage from "./pages/PurchasesPage.jsx";
import PayrollPage from "./pages/PayrollPage.jsx";
import BankPage from "./pages/BankPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import UsersPage from "./pages/UsersPage.jsx";

// Nhóm module theo phong cách MISA: Tổng quan / Quỹ-Ngân hàng / Mua-bán-kho / Nhân sự / Báo cáo / Hệ thống.
const GROUPS = [
  { label: "Tổng quan", items: [
    { id: "dashboard", label: "Tổng quan", perm: "dashboard", icon: "🏠", el: <DashboardPage /> },
  ]},
  { label: "Quỹ & Ngân hàng", items: [
    { id: "cashbook", label: "Sổ quỹ", perm: "cashbook_view", icon: "💰", el: <CashbookPage /> },
    { id: "bank", label: "Ngân hàng", perm: "bank_view", icon: "🏦", el: <BankPage /> },
  ]},
  { label: "Mua bán & Kho", items: [
    { id: "orders", label: "Bán hàng", perm: "orders_view", icon: "🛒", el: <OrdersPage /> },
    { id: "purchases", label: "Mua hàng", perm: "purchases_view", icon: "🧾", el: <PurchasesPage /> },
    { id: "inventory", label: "Nhập-Xuất-Tồn", perm: "inventory_view", icon: "📦", el: <InventoryPage /> },
    { id: "partners", label: "Công nợ", perm: "partners_view", icon: "🤝", el: <PartnersPage /> },
  ]},
  { label: "Nhân sự", items: [
    { id: "payroll", label: "Lương & BHXH", perm: "payroll_view", icon: "🧑‍💼", el: <PayrollPage /> },
  ]},
  { label: "Báo cáo & Hệ thống", items: [
    { id: "reports", label: "Báo cáo", perm: "reports", icon: "📊", el: <ReportsPage /> },
    { id: "categories", label: "Danh mục", perm: "categories_view", icon: "🏷️", el: <CategoriesPage /> },
    { id: "users", label: "Tài khoản & Phân quyền", perm: "users_view", icon: "👤", el: <UsersPage /> },
    { id: "settings", label: "Cài đặt", perm: "settings_view", icon: "⚙️", el: <SettingsPage /> },
  ]},
];

function Shell() {
  const { user, loading, logout, can } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);

  if (loading) return <div className="p-8 text-slate-400">Đang tải…</div>;
  if (!user) return <LoginPage />;

  const visibleGroups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm)) }))
    .filter((g) => g.items.length > 0);
  const allItems = visibleGroups.flatMap((g) => g.items);
  const current = allItems.find((i) => i.id === tab) || allItems[0];
  const initial = (user.name || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar groups={visibleGroups} activeId={current?.id} onSelect={setTab} collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shadow-sm sticky top-0 z-30">
          <div className="font-semibold text-slate-700 text-sm">{current?.label}</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-sky-600 text-white text-xs font-bold flex items-center justify-center flex-none">
                {initial}
              </div>
              <div className="text-xs leading-tight hidden sm:block">
                <div className="font-medium text-slate-700">{user.name}</div>
                <div className="text-slate-400">{user.role}</div>
              </div>
            </div>
            <button onClick={logout}
              className="text-xs font-medium text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors flex-none">
              Đăng xuất
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{current?.el}</main>
      </div>
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
