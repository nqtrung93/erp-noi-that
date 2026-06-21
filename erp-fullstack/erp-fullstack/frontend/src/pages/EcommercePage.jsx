import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as ordersService from "../services/orders.service.js";
import * as shopsService from "../services/shops.service.js";
import { fmt, fmtDate } from "../utils/format.js";
import { PAYMENT_METHODS } from "../utils/constants.js";

// Tab "Đơn TMĐT": giống tab Khách hàng nhưng theo từng đơn TMĐT (shop, mã đơn, còn phải thu),
// có filter theo ngày + chọn nhiều đơn để thu tiền 1 lần (mỗi đơn 1 phiếu Thu riêng).
export default function EcommercePage() {
  const { can } = useAuth();
  const [orders, setOrders] = useState([]);
  const [shops, setShops] = useState([]);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterShop, setFilterShop] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [collecting, setCollecting] = useState(false);

  async function reload() {
    try {
      const [os, ss] = await Promise.all([ordersService.listOrders(), shopsService.listShops()]);
      setOrders(os.filter((o) => o.is_ecommerce));
      setShops(ss);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  const filtered = orders.filter((o) => {
    const d = o.created_at?.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (filterShop && o.shop_id !== filterShop) return false;
    return true;
  });

  const remainingOf = (o) => Math.max(Number(o.total) - Number(o.paid), 0);
  const totalRemaining = filtered.reduce((s, o) => s + remainingOf(o), 0);
  const selectedOrders = filtered.filter((o) => selected.has(o.id) && remainingOf(o) > 0);
  const selectedTotal = selectedOrders.reduce((s, o) => s + remainingOf(o), 0);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const collectible = filtered.filter((o) => remainingOf(o) > 0).map((o) => o.id);
    const allSelected = collectible.length > 0 && collectible.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(collectible));
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Đơn TMĐT</h2>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Từ ngày</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Đến ngày</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Shop TMĐT</label>
          <select value={filterShop} onChange={(e) => setFilterShop(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Tất cả</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <div className="text-xs text-slate-400">Tổng số tiền còn phải thu</div>
        <div className="text-lg font-bold text-red-500">{fmt(totalRemaining)}</div>
      </div>

      {can("finance_edit") && (
        <CollectBar
          count={selectedOrders.length}
          total={selectedTotal}
          collecting={collecting}
          onCollect={async (method) => {
            setCollecting(true);
            setError("");
            try {
              for (const o of selectedOrders) {
                await ordersService.addOrderPayment(o.id, {
                  type: "Thu", amount: remainingOf(o), method,
                  note: `Thu tiền đơn TMĐT ${o.code} (${o.shop_name || ""})`,
                });
              }
              setSelected(new Set());
              reload();
            } catch (e) {
              setError(e.message);
            } finally {
              setCollecting(false);
            }
          }}
        />
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs">
              <th className="py-2 px-3">
                <input type="checkbox"
                  checked={filtered.some((o) => remainingOf(o) > 0) && filtered.filter((o) => remainingOf(o) > 0).every((o) => selected.has(o.id))}
                  onChange={toggleAll} />
              </th>
              <th className="py-2 px-3">Shop</th>
              <th className="py-2 px-3">Mã đơn</th>
              <th className="py-2 px-3">Mã đơn sàn</th>
              <th className="py-2 px-3">Ngày tạo</th>
              <th className="py-2 px-3 text-right">Tổng tiền</th>
              <th className="py-2 px-3 text-right">Đã thu</th>
              <th className="py-2 px-3 text-right">Còn phải thu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((o) => {
              const remaining = remainingOf(o);
              return (
                <tr key={o.id}>
                  <td className="py-2 px-3">
                    {remaining > 0 && (
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                    )}
                  </td>
                  <td className="py-2 px-3">{o.shop_name || "—"}</td>
                  <td className="py-2 px-3 font-medium">{o.code}</td>
                  <td className="py-2 px-3">{o.external_order_code || "—"}</td>
                  <td className="py-2 px-3">{fmtDate(o.created_at)}</td>
                  <td className="py-2 px-3 text-right">{fmt(o.total)}</td>
                  <td className="py-2 px-3 text-right text-emerald-600">{fmt(o.paid)}</td>
                  <td className="py-2 px-3 text-right font-medium text-red-500">{remaining > 0 ? fmt(remaining) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có đơn TMĐT nào.</p>}
      </div>
    </div>
  );
}

// Thanh thu tiền hàng loạt: chọn phương thức rồi xác nhận thu cho các đơn đã tick.
function CollectBar({ count, total, collecting, onCollect }) {
  const [method, setMethod] = useState("Tiền mặt");
  if (count === 0) return null;
  return (
    <div className="bg-teal-50 border border-teal-200 rounded-2xl p-3 flex items-center justify-between flex-wrap gap-2">
      <div className="text-sm text-teal-800">
        Đã chọn <span className="font-bold">{count}</span> đơn · Tổng cần thu <span className="font-bold">{fmt(total)}</span>
      </div>
      <div className="flex items-center gap-2">
        <select value={method} onChange={(e) => setMethod(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
          {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <button
          onClick={() => {
            if (!confirm(`Xác nhận thu ${fmt(total)} cho ${count} đơn đã chọn?`)) return;
            onCollect(method);
          }}
          disabled={collecting}
          className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
          {collecting ? "Đang thu…" : "Thu tiền các đơn đã chọn"}
        </button>
      </div>
    </div>
  );
}
