import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as transactionsService from "../services/transactions.service.js";
import * as categoriesService from "../services/categories.service.js";
import * as bankService from "../services/bank.service.js";
import { fmt } from "../utils/format.js";
import Modal from "../components/Modal.jsx";
import Toolbar, { ToolbarButton } from "../components/Toolbar.jsx";

export default function CashbookPage() {
  const { can } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function reload() {
    try { setTransactions(await transactionsService.listTransactions({ type: typeFilter, from, to })); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, [typeFilter, from, to]);
  useEffect(() => { categoriesService.listCategories().then(setCategories).catch(() => {}); }, []);
  useEffect(() => { bankService.listBankAccounts().then(setBankAccounts).catch(() => {}); }, []);

  const totalThu = transactions.filter((t) => t.type === "Thu").reduce((s, t) => s + Number(t.amount), 0);
  const totalChi = transactions.filter((t) => t.type === "Chi").reduce((s, t) => s + Number(t.amount), 0);

  async function remove(id) {
    if (!confirm("Xoá phiếu này?")) return;
    try { await transactionsService.removeTransaction(id); reload(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="space-y-3">
      <Toolbar
        title="Sổ quỹ thu/chi"
        filters={
          <>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
              <option value="">— Loại —</option>
              <option>Thu</option>
              <option>Chi</option>
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
          </>
        }
        actions={can("cashbook_edit") && (
          <ToolbarButton variant="primary" onClick={() => setCreating(true)}>+ Tạo phiếu</ToolbarButton>
        )}
      />
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

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
              <th className="py-2 px-3">Danh mục</th>
              <th className="py-2 px-3">Đối tượng</th>
              <th className="py-2 px-3">Ghi chú</th>
              <th className="py-2 px-3">Ngày</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.map((t) => (
              <tr key={t.id}>
                <td className="py-2 px-3 font-medium whitespace-nowrap">{t.code}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.type === "Thu" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {t.type}
                  </span>
                </td>
                <td className={`py-2 px-3 text-right font-medium whitespace-nowrap ${t.type === "Thu" ? "text-emerald-600" : "text-red-500"}`}>
                  {t.type === "Thu" ? "+" : "-"}{fmt(t.amount)}
                </td>
                <td className="py-2 px-3 text-slate-500">{t.category_label || t.category_name || "—"}</td>
                <td className="py-2 px-3 text-slate-500">{t.partner_name || "—"}</td>
                <td className="py-2 px-3 text-slate-500">{t.note || "—"}</td>
                <td className="py-2 px-3 whitespace-nowrap text-slate-400">{new Date(t.date).toLocaleDateString("vi-VN")}</td>
                <td className="py-2 px-3">
                  {can("cashbook_delete") && (
                    <button onClick={() => remove(t.id)} className="text-red-500 text-xs hover:underline">Xoá</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {transactions.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có phiếu thu/chi nào.</p>}
      </div>

      {creating && (
        <CreateTransactionModal categories={categories} bankAccounts={bankAccounts} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />
      )}
    </div>
  );
}

function CreateTransactionModal({ categories, bankAccounts, onClose, onSaved }) {
  const [type, setType] = useState("Thu");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("Tiền mặt");
  const [bankAccountId, setBankAccountId] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredCategories = categories.filter((c) => c.type === type);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!amount || Number(amount) <= 0) return setError("Số tiền không hợp lệ");
    setSaving(true);
    try {
      await transactionsService.createTransaction({
        type, amount: Number(amount), categoryId: categoryId || null, date, method,
        bankAccountId: method === "Chuyển khoản" ? (bankAccountId || null) : null,
        partnerName: partnerName || null, note: note || null,
      });
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Tạo phiếu thu/chi" onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Loại phiếu</label>
            <select value={type} onChange={(e) => { setType(e.target.value); setCategoryId(""); }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="Thu">Thu</option>
              <option value="Chi">Chi</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Ngày</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">Số tiền</label>
          <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Danh mục</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">— Không chọn —</option>
            {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Phương thức</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option>Tiền mặt</option>
            <option>Chuyển khoản</option>
            <option>Khác</option>
          </select>
        </div>
        {method === "Chuyển khoản" && (
          <div>
            <label className="text-xs text-slate-500">Tài khoản ngân hàng</label>
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">— Không chọn —</option>
              {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-slate-500">Đối tượng (tuỳ chọn)</label>
          <input value={partnerName} onChange={(e) => setPartnerName(e.target.value)}
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
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu…" : "Tạo phiếu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
