import { useEffect, useState } from "react";
import * as reportsService from "../services/reports.service.js";
import { fmt } from "../utils/format.js";

export default function ReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cashbook, setCashbook] = useState(null);
  const [profitLoss, setProfitLoss] = useState(null);
  const [debts, setDebts] = useState([]);
  const [error, setError] = useState("");

  async function reload() {
    try {
      const [cb, pl, d] = await Promise.all([
        reportsService.getCashbookSummary({ from, to }),
        reportsService.getProfitLoss({ from, to }),
        reportsService.getDebtReport(),
      ]);
      setCashbook(cb); setProfitLoss(pl); setDebts(d);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { reload(); }, [from, to]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Báo cáo</h2>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

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
          <ReportTable title="Thu theo danh mục" rows={profitLoss.income} />
          <ReportTable title="Chi theo danh mục" rows={profitLoss.expense} />
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-semibold text-slate-700 mb-2">Công nợ đang còn (giảm dần)</h3>
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
            {debts.map((d) => (
              <tr key={d.id}>
                <td className="py-2">{d.code}</td>
                <td className="py-2">{d.name}</td>
                <td className="py-2 text-slate-500">{d.type === "customer" ? "Khách hàng" : d.type === "supplier" ? "Nhà cung cấp" : "Khác"}</td>
                <td className="py-2 text-right font-medium">{fmt(d.debt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {debts.length === 0 && <p className="text-slate-400 text-sm py-2">Không có công nợ tồn đọng.</p>}
      </div>
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

function ReportTable({ title, rows }) {
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
