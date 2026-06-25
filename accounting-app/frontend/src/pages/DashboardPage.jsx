import { useEffect, useState } from "react";
import * as reportsService from "../services/reports.service.js";
import { fmt } from "../utils/format.js";

export default function DashboardPage() {
  const [cashbook, setCashbook] = useState(null);
  const [profitLoss, setProfitLoss] = useState(null);
  const [error, setError] = useState("");

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  useEffect(() => {
    Promise.all([
      reportsService.getCashbookSummary({ from: monthStart }),
      reportsService.getProfitLoss({ from: monthStart }),
    ]).then(([cb, pl]) => { setCashbook(cb); setProfitLoss(pl); })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Tổng quan (tháng này)</h2>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      {cashbook && profitLoss && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="text-xs text-slate-400">Thu trong tháng</div>
            <div className="text-lg font-bold text-emerald-600">{fmt(cashbook.totalIn)}</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="text-xs text-slate-400">Chi trong tháng</div>
            <div className="text-lg font-bold text-red-500">{fmt(cashbook.totalOut)}</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="text-xs text-slate-400">Số dư quỹ</div>
            <div className="text-lg font-bold text-slate-800">{fmt(cashbook.balance)}</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="text-xs text-slate-400">Lãi / lỗ tháng này</div>
            <div className={`text-lg font-bold ${profitLoss.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmt(profitLoss.profit)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
