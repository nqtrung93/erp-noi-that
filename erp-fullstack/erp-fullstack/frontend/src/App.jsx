import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./store/auth.store.jsx";
import * as settingsService from "./services/settings.service.js";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";
import ProductsPage from "./pages/ProductsPage.jsx";
import CrmPage from "./pages/CrmPage.jsx";
import EcommercePage from "./pages/EcommercePage.jsx";
import WarehousePage from "./pages/WarehousePage.jsx";
import SuppliersPage from "./pages/SuppliersPage.jsx";
import ShippingPage from "./pages/ShippingPage.jsx";
import VatInvoicesPage from "./pages/VatInvoicesPage.jsx";
import FinancePage from "./pages/FinancePage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import EmployeesPage from "./pages/EmployeesPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import WarrantyPage from "./pages/WarrantyPage.jsx";

const TABS = [
  { id: "dashboard", label: "Tổng quan", perm: "dashboard", el: <DashboardPage /> },
  { id: "orders", label: "Đơn hàng", perm: "orders_view", el: <OrdersPage /> },
  { id: "products", label: "Sản phẩm", perm: "products_view", el: <ProductsPage /> },
  { id: "crm", label: "Khách hàng", perm: "crm_view", el: <CrmPage /> },
  { id: "ecommerce", label: "Đơn TMĐT", perm: "orders_view", el: <EcommercePage /> },
  { id: "warehouse", label: "Kho hàng", perm: "warehouse_view", el: <WarehousePage /> },
  { id: "suppliers", label: "Nhà cung cấp", perm: "suppliers_view", el: <SuppliersPage /> },
  { id: "shipping", label: "Vận chuyển", perm: "shipping_view", el: <ShippingPage /> },
  { id: "vatinvoice", label: "Hoá đơn VAT", perm: "vatinvoice_view", el: <VatInvoicesPage /> },
  { id: "warranty", label: "Bảo hành", perm: "warranty_view", el: <WarrantyPage /> },
  { id: "finance", label: "Sổ quỹ", perm: "finance_view", el: <FinancePage /> },
  { id: "reports", label: "Báo cáo", perm: "reports", el: <ReportsPage /> },
  { id: "employees", label: "Nhân viên", perm: "employees_view", el: <EmployeesPage /> },
  { id: "settings", label: "Cài đặt", perm: "settings_view", el: <SettingsPage /> },
];

function Shell() {
  const { user, loading, logout, can } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const [logo, setLogo] = useState(null);

  useEffect(() => { settingsService.getLogo().then((r) => setLogo(r.logo)).catch(() => {}); }, []);

  if (loading) return <div className="p-8 text-slate-400">Đang tải…</div>;
  if (!user) return <LoginPage />;

  const visibleTabs = TABS.filter((t) => can(t.perm));
  const current = visibleTabs.find((t) => t.id === tab) || visibleTabs[0];

  const initial = (user.name || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-40">
        <header className="bg-white border-b border-slate-100 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between shadow-sm gap-2">
          {logo
            ? <img src={logo} alt="Logo" className="h-8 sm:h-9 object-contain flex-none" />
            : <div className="font-bold text-teal-600 text-base sm:text-lg tracking-tight flex-none">CTH-GAMI ERP</div>}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center flex-none">
                {initial}
              </div>
              <div className="text-sm leading-tight hidden sm:block">
                <div className="font-medium text-slate-700">{user.name}</div>
                <div className="text-slate-400 text-xs">{user.role}</div>
              </div>
            </div>
            <button onClick={logout}
              className="tap-target text-xs font-medium text-red-500 border border-red-200 rounded-lg px-3 hover:bg-red-50 active:bg-red-100 transition-colors flex-none">
              Đăng xuất
            </button>
          </div>
        </header>
        <nav className="scroll-touch bg-white border-b border-slate-100 px-2 sm:px-6 flex gap-1 overflow-x-auto">
          {visibleTabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`tap-target px-3 sm:px-4 py-2 mt-1.5 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors flex-none ${
                current?.id === t.id
                  ? "bg-teal-50 text-teal-700"
                  : "text-slate-500 hover:bg-slate-50 active:bg-slate-100 hover:text-slate-700"
              }`}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      <main className="max-w-6xl mx-auto p-3 sm:p-6">{current?.el}</main>
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
