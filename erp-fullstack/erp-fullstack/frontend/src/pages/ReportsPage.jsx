import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as reportsService from "../services/reports.service.js";
import * as shopsService from "../services/shops.service.js";
import * as orderSourcesService from "../services/orderSources.service.js";
import * as transactionsService from "../services/transactions.service.js";
import * as bankService from "../services/bank.service.js";
import { fmt } from "../utils/format.js";
import StatCard from "../components/StatCard.jsx";

export default function ReportsPage() {
  const { can } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [shopId, setShopId] = useState("");
  const [source, setSource] = useState("");
  const [shops, setShops] = useState([]);
  const [sources, setSources] = useState([]);
  const [profit, setProfit] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [shopDebt, setShopDebt] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [cashFrom, setCashFrom] = useState("");
  const [cashTo, setCashTo] = useState("");
  const [error, setError] = useState("");

  async function loadProfit() {
    try {
      setProfit(await reportsService.profitReport({
        from: from || undefined, to: to || undefined,
        shopId: shopId || undefined, source: source || undefined,
      }));
    } catch (e) { setError(e.message); }
  }
  useEffect(() => {
    if (can("view_revenue")) {
      loadProfit();
      shopsService.listShops().then(setShops).catch((e) => setError(e.message));
      orderSourcesService.listOrderSources().then(setSources).catch((e) => setError(e.message));
      reportsService.shopDebtReport().then(setShopDebt).catch((e) => setError(e.message));
    }
    if (can("reports")) reportsService.inventoryReport().then(setInventory).catch((e) => setError(e.message));
    if (can("finance_view")) {
      transactionsService.listTransactions().then(setTransactions).catch((e) => setError(e.message));
      bankService.listBankAccounts().then(setBankAccounts).catch((e) => setError(e.message));
    }
  }, []);

  const cashRows = transactions.filter((t) => {
    const d = t.created_at.slice(0, 10);
    return (!cashFrom || d >= cashFrom) && (!cashTo || d <= cashTo);
  });
  const cashThu = cashRows.filter((t) => t.type === "Thu").reduce((s, t) => s + Number(t.amount), 0);
  const cashChi = cashRows.filter((t) => t.type === "Chi").reduce((s, t) => s + Number(t.amount), 0);
  const byMethod = {};
  for (const t of cashRows) {
    const key = t.method === "Ngân hàng" && t.bank_account_name ? t.bank_account_name : (t.method || "Khác");
    byMethod[key] ??= { thu: 0, chi: 0 };
    byMethod[key][t.type === "Thu" ? "thu" : "chi"] += Number(t.amount);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Báo cáo</h2>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      {can("view_revenue") && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
          <div className="font-bold text-slate-800">Báo cáo lợi nhuận</div>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[130px] sm:flex-none">
              <label className="text-xs text-slate-500">Từ ngày</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="w-full sm:w-auto border border-slate-200 rounded-lg px-3 py-2 text-sm block" />
            </div>
            <div className="flex-1 min-w-[130px] sm:flex-none">
              <label className="text-xs text-slate-500">Đến ngày</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="w-full sm:w-auto border border-slate-200 rounded-lg px-3 py-2 text-sm block" />
            </div>
            <div className="flex-1 min-w-[130px] sm:flex-none">
              <label className="text-xs text-slate-500">Shop TMĐT</label>
              <select value={shopId} onChange={(e) => setShopId(e.target.value)}
                className="w-full sm:w-auto border border-slate-200 rounded-lg px-3 py-2 text-sm block">
                <option value="">Tất cả</option>
                {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[130px] sm:flex-none">
              <label className="text-xs text-slate-500">Nguồn đơn</label>
              <select value={source} onChange={(e) => setSource(e.target.value)}
                className="w-full sm:w-auto border border-slate-200 rounded-lg px-3 py-2 text-sm block">
                <option value="">Tất cả</option>
                {sources.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <button onClick={loadProfit} className="w-full sm:w-auto bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl">Lọc</button>
          </div>
          {profit && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon="🧾" label="Số đơn" value={profit.orders} />
              <StatCard icon="💰" label="Doanh thu" value={fmt(profit.revenue)} color="bg-emerald-50" />
              <StatCard icon="📉" label="Giá vốn" value={fmt(profit.cogs)} color="bg-red-50" />
              <StatCard icon="📈" label="Lợi nhuận" value={fmt(profit.profit)} sub={`${profit.margin}%`} color="bg-teal-50" />
            </div>
          )}
        </div>
      )}

      {can("view_revenue") && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="font-bold text-slate-800 mb-2">Công nợ Shop TMĐT</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs">
                  <th className="py-1">Shop</th>
                  <th className="py-1 text-right">Số đơn</th>
                  <th className="py-1 text-right">Tổng giá trị</th>
                  <th className="py-1 text-right">Đã thu</th>
                  <th className="py-1 text-right">Còn phải thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shopDebt.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 whitespace-nowrap">{s.name}</td>
                    <td className="py-2 text-right">{s.orders}</td>
                    <td className="py-2 text-right whitespace-nowrap">{fmt(s.total)}</td>
                    <td className="py-2 text-right text-emerald-600 whitespace-nowrap">{fmt(s.paid)}</td>
                    <td className="py-2 text-right text-red-500 font-medium whitespace-nowrap">{fmt(s.debt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shopDebt.length === 0 && <p className="text-slate-400 text-sm">Chưa có shop TMĐT nào.</p>}
        </div>
      )}

      {can("finance_view") && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
          <div className="font-bold text-slate-800">Báo cáo sổ quỹ</div>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[130px] sm:flex-none">
              <label className="text-xs text-slate-500">Từ ngày</label>
              <input type="date" value={cashFrom} onChange={(e) => setCashFrom(e.target.value)}
                className="w-full sm:w-auto border border-slate-200 rounded-lg px-3 py-2 text-sm block" />
            </div>
            <div className="flex-1 min-w-[130px] sm:flex-none">
              <label className="text-xs text-slate-500">Đến ngày</label>
              <input type="date" value={cashTo} onChange={(e) => setCashTo(e.target.value)}
                className="w-full sm:w-auto border border-slate-200 rounded-lg px-3 py-2 text-sm block" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard icon="📥" label="Tổng thu" value={fmt(cashThu)} color="bg-emerald-50" />
            <StatCard icon="📤" label="Tổng chi" value={fmt(cashChi)} color="bg-red-50" />
            <StatCard icon="⚖️" label="Chênh lệch" value={fmt(cashThu - cashChi)} color="bg-teal-50" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs">
                  <th className="py-1">Phương thức / Tài khoản</th>
                  <th className="py-1 text-right">Thu</th>
                  <th className="py-1 text-right">Chi</th>
                  <th className="py-1 text-right">Chênh lệch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(byMethod).map(([key, v]) => (
                  <tr key={key}>
                    <td className="py-2 whitespace-nowrap">{key}</td>
                    <td className="py-2 text-right text-emerald-600 whitespace-nowrap">{fmt(v.thu)}</td>
                    <td className="py-2 text-right text-red-500 whitespace-nowrap">{fmt(v.chi)}</td>
                    <td className="py-2 text-right font-medium whitespace-nowrap">{fmt(v.thu - v.chi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Object.keys(byMethod).length === 0 && <p className="text-slate-400 text-sm">Không có giao dịch trong khoảng thời gian này.</p>}
          </div>

          {bankAccounts.length > 0 && (
            <>
              <div className="font-semibold text-slate-700 text-sm pt-2 border-t border-slate-100">Số dư tài khoản ngân hàng hiện tại</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {bankAccounts.map((b) => (
                  <div key={b.id} className="bg-slate-50 rounded-xl p-3">
                    <div className="text-xs text-slate-400">{b.name}</div>
                    <div className="text-base font-bold text-slate-800">{fmt(b.balance)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {can("reports") && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="font-bold text-slate-800 mb-2">Giá trị tồn kho theo sản phẩm</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs">
                  <th className="py-1">Sản phẩm</th>
                  <th className="py-1 text-right">Tồn</th>
                  <th className="py-1 text-right">Giá trị tồn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventory.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2 whitespace-nowrap">{i.name}</td>
                    <td className="py-2 text-right">{i.total_qty}</td>
                    <td className="py-2 text-right font-medium whitespace-nowrap">{fmt(i.stock_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {inventory.length === 0 && <p className="text-slate-400 text-sm">Chưa có dữ liệu tồn kho.</p>}
        </div>
      )}
    </div>
  );
}
