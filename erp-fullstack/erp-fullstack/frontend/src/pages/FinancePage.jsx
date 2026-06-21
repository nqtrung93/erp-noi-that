import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as transactionsService from "../services/transactions.service.js";
import { fmt } from "../utils/format.js";
import { PAYMENT_METHODS } from "../utils/constants.js";
import Badge from "../components/Badge.jsx";
import Modal from "../components/Modal.jsx";
import { exportCsv } from "../utils/exportCsv.js";

const TYPE_COLOR = { Thu: "bg-emerald-100 text-emerald-700", Chi: "bg-red-100 text-red-700" };

export default function FinancePage() {
  const { can } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [search, setSearch] = useState(""); // tìm theo mã phiếu hoặc mã đơn hàng liên quan

  async function reload() {
    try { setTransactions(await transactionsService.listTransactions()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  const filtered = transactions
    .filter((t) => !typeFilter || t.type === typeFilter)
    .filter((t) => !methodFilter || t.method === methodFilter)
    .filter((t) => !search ||
      t.code.toLowerCase().includes(search.toLowerCase()) ||
      (t.order_code || "").toLowerCase().includes(search.toLowerCase()));

  const totalThu = filtered.filter((t) => t.type === "Thu").reduce((s, t) => s + Number(t.amount), 0);
  const totalChi = filtered.filter((t) => t.type === "Chi").reduce((s, t) => s + Number(t.amount), 0);

  function exportTransactions() {
    exportCsv("thu_chi.csv", [
      { key: "code", label: "Mã phiếu" }, { key: "type", label: "Loại" }, { key: "amount", label: "Số tiền" },
      { key: "method", label: "Phương thức" }, { key: "party_name", label: "Đối tượng" },
      { key: "order_code", label: "Đơn liên quan" }, { key: "category", label: "Lý do" }, { key: "note", label: "Ghi chú" },
      { key: (t) => new Date(t.created_at).toLocaleString("vi-VN"), label: "Ngày" },
    ], filtered);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Thu chi</h2>
        <div className="flex gap-2">
          <button onClick={exportTransactions} className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl">
            Xuất CSV
          </button>
          {can("finance_edit") && (
            <button onClick={() => setCreating(true)} className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl">
              + Tạo phiếu
            </button>
          )}
        </div>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="flex gap-3 flex-wrap">
        <div>
          <label className="text-xs text-slate-500">Loại phiếu</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm block">
            <option value="">— Tất cả —</option>
            <option>Thu</option>
            <option>Chi</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Phương thức</label>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm block">
            <option value="">— Tất cả —</option>
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Tìm theo mã phiếu / mã đơn</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="VD: TX-000001 hoặc ORD-000001"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm block" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="text-xs text-slate-400">Tổng thu</div>
          <div className="text-lg font-bold text-emerald-600">{fmt(totalThu)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="text-xs text-slate-400">Tổng chi</div>
          <div className="text-lg font-bold text-red-500">{fmt(totalChi)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="text-xs text-slate-400">Chênh lệch</div>
          <div className="text-lg font-bold text-slate-800">{fmt(totalThu - totalChi)}</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs">
              <th className="py-2 px-3">Mã phiếu</th>
              <th className="py-2 px-3">Loại</th>
              <th className="py-2 px-3 text-right">Số tiền</th>
              <th className="py-2 px-3">Phương thức</th>
              <th className="py-2 px-3">Đối tượng</th>
              <th className="py-2 px-3">Liên quan</th>
              <th className="py-2 px-3">Lý do / Ghi chú</th>
              <th className="py-2 px-3">Ngày</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((t) => (
              <tr key={t.id}>
                <td className="py-2 px-3 font-medium whitespace-nowrap">{t.code}</td>
                <td className="py-2 px-3"><Badge label={t.type} colorClass={TYPE_COLOR[t.type]} /></td>
                <td className={`py-2 px-3 text-right font-medium whitespace-nowrap ${t.type === "Thu" ? "text-emerald-600" : "text-red-500"}`}>
                  {t.type === "Thu" ? "+" : "-"}{fmt(t.amount)}
                </td>
                <td className="py-2 px-3 text-slate-500">{t.method || "—"}</td>
                <td className="py-2 px-3 text-slate-500">{t.party_name || t.party_type || "—"}</td>
                <td className="py-2 px-3 text-slate-500">{t.order_code || (t.ref_type === "supplier" ? "Nhà cung cấp" : t.ref_type === "customer" ? "Khách hàng" : "—")}</td>
                <td className="py-2 px-3 text-slate-500">{t.category}{t.note ? ` — ${t.note}` : ""}</td>
                <td className="py-2 px-3 whitespace-nowrap text-slate-400">{new Date(t.created_at).toLocaleString("vi-VN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có phiếu thu/chi nào.</p>}
      </div>

      {creating && (
        <CreateTransactionModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />
      )}
    </div>
  );
}

// Tạo phiếu thu/chi độc lập, không gắn đơn hàng cụ thể (VD: chi phí văn phòng, thu khác...).
function CreateTransactionModal({ onClose, onSaved }) {
  const [type, setType] = useState("Thu");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("Tiền mặt");
  const [category, setCategory] = useState("");
  const [partyName, setPartyName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!amount || Number(amount) <= 0) return setError("Số tiền không hợp lệ");
    setSaving(true);
    try {
      await transactionsService.createTransaction({
        type, amount: Number(amount), method, category: category || (type === "Thu" ? "Thu khác" : "Chi khác"),
        partyType: "Khác", partyName: partyName || null, note: note || null,
      });
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Tạo phiếu thu/chi" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Loại phiếu</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="Thu">Thu</option>
              <option value="Chi">Chi</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Phương thức</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">Số tiền</label>
          <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Lý do</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="VD: Chi phí văn phòng, Thu khác..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Đối tượng (tuỳ chọn)</label>
          <input value={partyName} onChange={(e) => setPartyName(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Ghi chú</label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving}
            className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu…" : "Tạo phiếu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
