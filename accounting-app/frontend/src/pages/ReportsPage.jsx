import { useEffect, useState } from "react";
import * as reportsService from "../services/reports.service.js";
import { fmt } from "../utils/format.js";

const TABS = [
  ["overview", "Tổng quan"],
  ["inventory", "Tồn kho"],
  ["sales", "Bán hàng"],
  ["purchases", "Mua hàng"],
  ["debt", "Công nợ"],
];

export default function ReportsPage() {
  const [tab, setTab] = useState("overview");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Báo cáo</h2>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium ${tab === id ? "text-indigo-600 border-b-2 border-indigo-600" : "text-slate-500"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab !== "inventory" && tab !== "debt" && (
        <div className="flex gap-3">
          <div>
            <label className="text-xs text-slate-500">Từ ngày</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm block" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Đến ngày</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm block" />
          </div>
        </div>
      )}

      {tab === "overview" && <OverviewTab from={from} to={to} />}
      {tab === "inventory" && <InventoryTab />}
      {tab === "sales" && <SalesTab from={from} to={to} />}
      {tab === "purchases" && <PurchaseTab from={from} to={to} />}
      {tab === "debt" && <DebtTab />}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

function OverviewTab({ from, to }) {
  const [cashbook, setCashbook] = useState(null);
  const [profitLoss, setProfitLoss] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([reportsService.getCashbookSummary({ from, to }), reportsService.getProfitLoss({ from, to })])
      .then(([cb, pl]) => { setCashbook(cb); setProfitLoss(pl); })
      .catch((e) => setError(e.message));
  }, [from, to]);

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      {cashbook && profitLoss && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Tổng thu" value={fmt(cashbook.totalIn)} color="text-emerald-600" />
          <Stat label="Tổng chi" value={fmt(cashbook.totalOut)} color="text-red-500" />
          <Stat label="Số dư quỹ" value={fmt(cashbook.balance)} color="text-slate-800" />
          <Stat label="Lãi / lỗ" value={fmt(profitLoss.profit)} color={profitLoss.profit >= 0 ? "text-emerald-600" : "text-red-500"} />
        </div>
      )}
      {profitLoss && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CategoryTable title="Thu theo danh mục" rows={profitLoss.income} />
          <CategoryTable title="Chi theo danh mục" rows={profitLoss.expense} />
        </div>
      )}
    </div>
  );
}

function CategoryTable({ title, rows }) {
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
      <h3 className="font-semibold text-slate-700 mb-2">{title}</h3>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.category}>
              <td className="py-2">{r.category}</td>
              <td className="py-2 text-right font-medium">{fmt(r.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-semibold">
            <td className="py-2">Tổng</td>
            <td className="py-2 text-right">{fmt(total)}</td>
          </tr>
        </tfoot>
      </table>
      {rows.length === 0 && <p className="text-slate-400 text-sm py-2">Không có dữ liệu.</p>}
    </div>
  );
}

function InventoryTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => { reportsService.getInventoryReport().then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>;
  if (!data) return <p className="text-slate-400 text-sm">Đang tải…</p>;

  const filtered = data.items.filter((it) => !search ||
    it.product_name.toLowerCase().includes(search.toLowerCase()) ||
    (it.sku || it.variant_sku || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <Stat label="Tổng số lượng tồn" value={data.totalQty.toLocaleString("vi-VN")} color="text-slate-800" />
        <Stat label="Tổng giá trị tồn kho" value={fmt(data.totalValue)} color="text-slate-800" />
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên hoặc mã SKU…"
        className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full max-w-xs" />
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-400 text-xs">
            <th className="py-2 px-3">Mã SP</th><th className="py-2 px-3">Sản phẩm</th><th className="py-2 px-3">Kho</th>
            <th className="py-2 px-3 text-right">Tồn</th><th className="py-2 px-3">ĐVT</th>
            <th className="py-2 px-3 text-right">Giá vốn</th><th className="py-2 px-3 text-right">Giá trị</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((it) => (
              <tr key={it.id}>
                <td className="py-2 px-3">{it.variant_sku || it.sku || "—"}</td>
                <td className="py-2 px-3">{it.product_name}{it.variant_attrs && <span className="text-slate-400"> ({Object.values(it.variant_attrs).join(" / ")})</span>}</td>
                <td className="py-2 px-3 text-slate-500">{it.warehouse_name}</td>
                <td className="py-2 px-3 text-right font-medium">{it.qty}</td>
                <td className="py-2 px-3 text-slate-500">{it.unit}</td>
                <td className="py-2 px-3 text-right">{fmt(it.cost)}</td>
                <td className="py-2 px-3 text-right font-medium">{fmt(it.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-slate-400 text-sm p-4">Không có tồn kho.</p>}
      </div>
    </div>
  );
}

const STATUS_LABEL = { "Mới": "Mới", "Hoàn thành": "Hoàn thành", "Đã hủy": "Đã hủy" };

function SalesTab({ from, to }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { reportsService.getSalesReport({ from, to }).then(setData).catch((e) => setError(e.message)); }, [from, to]);

  if (error) return <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>;
  if (!data) return <p className="text-slate-400 text-sm">Đang tải…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Số đơn hàng" value={data.totalOrders} color="text-slate-800" />
        <Stat label="Tổng doanh thu" value={fmt(data.totalRevenue)} color="text-emerald-600" />
        <Stat label="Đã thu" value={fmt(data.totalPaid)} color="text-emerald-600" />
        <Stat label="Còn phải thu" value={fmt(data.totalDue)} color="text-red-500" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-semibold text-slate-700 mb-2">Theo trạng thái</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-400 text-xs">
            <th className="py-2">Trạng thái</th><th className="py-2 text-right">Số đơn</th>
            <th className="py-2 text-right">Tổng tiền</th><th className="py-2 text-right">Đã thu</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.byStatus.map((s) => (
              <tr key={s.status}>
                <td className="py-2">{STATUS_LABEL[s.status] || s.status}</td>
                <td className="py-2 text-right">{s.count}</td>
                <td className="py-2 text-right font-medium">{fmt(s.total)}</td>
                <td className="py-2 text-right text-emerald-600">{fmt(s.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.byStatus.length === 0 && <p className="text-slate-400 text-sm py-2">Không có dữ liệu.</p>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-semibold text-slate-700 mb-2">Sản phẩm bán chạy</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-400 text-xs">
            <th className="py-2">Sản phẩm</th><th className="py-2 text-right">SL bán</th><th className="py-2 text-right">Doanh thu</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.topProducts.map((p) => (
              <tr key={p.id}>
                <td className="py-2">{p.name}</td>
                <td className="py-2 text-right">{p.qty}</td>
                <td className="py-2 text-right font-medium">{fmt(p.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.topProducts.length === 0 && <p className="text-slate-400 text-sm py-2">Không có dữ liệu.</p>}
      </div>
    </div>
  );
}

function PurchaseTab({ from, to }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { reportsService.getPurchaseReport({ from, to }).then(setData).catch((e) => setError(e.message)); }, [from, to]);

  if (error) return <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>;
  if (!data) return <p className="text-slate-400 text-sm">Đang tải…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Số đơn mua" value={data.totalOrders} color="text-slate-800" />
        <Stat label="Tổng chi mua hàng" value={fmt(data.totalSpent)} color="text-red-500" />
        <Stat label="Đã trả" value={fmt(data.totalPaid)} color="text-emerald-600" />
        <Stat label="Còn phải trả" value={fmt(data.totalDue)} color="text-red-500" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-semibold text-slate-700 mb-2">Theo trạng thái</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-400 text-xs">
            <th className="py-2">Trạng thái</th><th className="py-2 text-right">Số đơn</th>
            <th className="py-2 text-right">Tổng tiền</th><th className="py-2 text-right">Đã trả</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.byStatus.map((s) => (
              <tr key={s.status}>
                <td className="py-2">{STATUS_LABEL[s.status] || s.status}</td>
                <td className="py-2 text-right">{s.count}</td>
                <td className="py-2 text-right font-medium">{fmt(s.total)}</td>
                <td className="py-2 text-right text-emerald-600">{fmt(s.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.byStatus.length === 0 && <p className="text-slate-400 text-sm py-2">Không có dữ liệu.</p>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-semibold text-slate-700 mb-2">Sản phẩm nhập nhiều</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-400 text-xs">
            <th className="py-2">Sản phẩm</th><th className="py-2 text-right">SL nhập</th><th className="py-2 text-right">Chi phí</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.topProducts.map((p) => (
              <tr key={p.id}>
                <td className="py-2">{p.name}</td>
                <td className="py-2 text-right">{p.qty}</td>
                <td className="py-2 text-right font-medium">{fmt(p.spent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.topProducts.length === 0 && <p className="text-slate-400 text-sm py-2">Không có dữ liệu.</p>}
      </div>
    </div>
  );
}

function DebtTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { reportsService.getDebtReport().then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>;
  if (!data) return <p className="text-slate-400 text-sm">Đang tải…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <Stat label="Tổng phải thu (khách nợ)" value={fmt(data.totalReceivable)} color="text-red-500" />
        <Stat label="Tổng phải trả (mình nợ)" value={fmt(data.totalPayable)} color="text-amber-600" />
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-semibold text-slate-700 mb-2">Chi tiết công nợ</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs">
              <th className="py-2">Mã</th>
              <th className="py-2">Tên</th>
              <th className="py-2">Loại</th>
              <th className="py-2 text-right">Công nợ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((d) => (
              <tr key={d.id}>
                <td className="py-2">{d.code}</td>
                <td className="py-2">{d.name}</td>
                <td className="py-2 text-slate-500">{d.type === "customer" ? "Khách hàng" : d.type === "supplier" ? "Nhà cung cấp" : "Khác"}</td>
                <td className={`py-2 text-right font-medium ${Number(d.debt) > 0 ? "text-red-500" : "text-amber-600"}`}>{fmt(d.debt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 && <p className="text-slate-400 text-sm py-2">Không có công nợ tồn đọng.</p>}
      </div>
    </div>
  );
}
