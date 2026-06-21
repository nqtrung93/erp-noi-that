import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as reportsService from "../services/reports.service.js";
import * as ordersService from "../services/orders.service.js";
import { fmt, fmtShort } from "../utils/format.js";
import StatCard from "../components/StatCard.jsx";

export default function DashboardPage() {
  const { can } = useAuth();
  const [profit, setProfit] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      can("view_revenue") ? reportsService.profitReport() : Promise.resolve(null),
      can("reports") ? reportsService.inventoryReport() : Promise.resolve([]),
      ordersService.listOrders(),
    ])
      .then(([p, inv, os]) => { setProfit(p); setInventory(inv); setOrders(os); })
      .catch((e) => setError(e.message));
  }, []);

  const stockValue = inventory.reduce((s, i) => s + Number(i.stock_value || 0), 0);
  const pendingOrders = orders.filter((o) => o.status === "Chờ xác nhận").length;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Tổng quan</h2>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon="🧾" label="Tổng đơn hàng" value={orders.length} color="bg-blue-50" />
        <StatCard icon="⏳" label="Chờ xác nhận" value={pendingOrders} color="bg-amber-50" />
        {profit && (
          <>
            <StatCard icon="💰" label="Doanh thu (hoàn thành)" value={fmtShort(profit.revenue)} sub={`${profit.orders} đơn`} color="bg-emerald-50" />
            <StatCard icon="📈" label="Lợi nhuận" value={fmtShort(profit.profit)} sub={`${profit.margin}% margin`} color="bg-teal-50" />
          </>
        )}
        {can("reports") && (
          <StatCard icon="📦" label="Giá trị tồn kho" value={fmtShort(stockValue)} color="bg-purple-50" />
        )}
      </div>

      {orders.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="font-bold text-slate-800 mb-2">Đơn hàng gần đây</div>
          <div className="divide-y divide-slate-100">
            {orders.slice(0, 5).map((o) => (
              <div key={o.id} className="flex justify-between py-2 text-sm">
                <span className="text-slate-600">{o.code}</span>
                <span className="font-medium text-slate-800">{fmt(o.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
