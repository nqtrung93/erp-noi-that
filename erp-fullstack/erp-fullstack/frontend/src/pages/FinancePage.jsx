import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as transactionsService from "../services/transactions.service.js";
import * as bankService from "../services/bank.service.js";
import { fmt } from "../utils/format.js";
import { PAYMENT_METHODS } from "../utils/constants.js";
import Badge from "../components/Badge.jsx";
import Modal from "../components/Modal.jsx";
import { exportCsv } from "../utils/exportCsv.js";

const TYPE_COLOR = { Thu: "bg-emerald-100 text-emerald-700", Chi: "bg-red-100 text-red-700" };
const TRANSFER_CATEGORY = "Chuyển quỹ nội bộ";
const SUB_TABS = [
  { id: "ledger", label: "Sổ quỹ" },
  { id: "bank", label: "Ngân hàng" },
];

export default function FinancePage() {
  const [tab, setTab] = useState("ledger");
  const [bankAccounts, setBankAccounts] = useState([]);

  async function reloadBanks() {
    try { setBankAccounts(await bankService.listBankAccounts()); } catch { /* hiển thị lỗi ở từng tab */ }
  }
  useEffect(() => { reloadBanks(); }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Sổ quỹ</h2>
      <div className="flex gap-1 border-b border-slate-200">
        {SUB_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.id ? "border-teal-600 text-teal-600" : "border-transparent text-slate-500"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ledger"
        ? <LedgerTab bankAccounts={bankAccounts} onTransferred={reloadBanks} />
        : <BankTab bankAccounts={bankAccounts} onChanged={reloadBanks} />}
    </div>
  );
}

// ---------- Tab "Sổ quỹ" — danh sách phiếu thu/chi, liên kết với đơn hàng/đối tượng/tài khoản NH ----------
function LedgerTab({ bankAccounts, onTransferred }) {
  const { can } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [search, setSearch] = useState(""); // tìm theo mã phiếu hoặc mã đơn hàng liên quan

  async function reload() {
    try { setTransactions(await transactionsService.listTransactions()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  const filtered = transactions
    .filter((t) => !typeFilter || t.type === typeFilter)
    .filter((t) => !methodFilter || t.method === methodFilter)
    .filter((t) => !bankFilter || t.bank_account_id === bankFilter)
    .filter((t) => !search ||
      t.code.toLowerCase().includes(search.toLowerCase()) ||
      (t.order_code || "").toLowerCase().includes(search.toLowerCase()));

  const totalThu = filtered.filter((t) => t.type === "Thu" && t.category !== TRANSFER_CATEGORY).reduce((s, t) => s + Number(t.amount), 0);
  const totalChi = filtered.filter((t) => t.type === "Chi" && t.category !== TRANSFER_CATEGORY).reduce((s, t) => s + Number(t.amount), 0);

  function exportTransactions() {
    exportCsv("so_quy.csv", [
      { key: "code", label: "Mã phiếu" }, { key: "type", label: "Loại" }, { key: "amount", label: "Số tiền" },
      { key: "method", label: "Phương thức" }, { key: "bank_account_name", label: "Tài khoản NH" },
      { key: "party_name", label: "Đối tượng" },
      { key: "order_code", label: "Đơn liên quan" }, { key: "category", label: "Lý do" }, { key: "note", label: "Ghi chú" },
      { key: (t) => new Date(t.created_at).toLocaleString("vi-VN"), label: "Ngày" },
    ], filtered);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <div className="flex gap-2">
          <button onClick={exportTransactions} className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl">
            Xuất CSV
          </button>
          {can("finance_edit") && (
            <>
              <button onClick={() => setTransferring(true)} className="border border-teal-600 text-teal-600 text-sm font-medium px-4 py-2 rounded-xl">
                Chuyển quỹ
              </button>
              <button onClick={() => setCreating(true)} className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl">
                + Tạo phiếu
              </button>
            </>
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
          <label className="text-xs text-slate-500">Tài khoản ngân hàng</label>
          <select value={bankFilter} onChange={(e) => setBankFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm block">
            <option value="">— Tất cả —</option>
            {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
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
                <td className="py-2 px-3 text-slate-500">{t.method || "—"}{t.bank_account_name ? ` · ${t.bank_account_name}` : ""}</td>
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
        <CreateTransactionModal bankAccounts={bankAccounts} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />
      )}
      {transferring && (
        <TransferFundsModal bankAccounts={bankAccounts} onClose={() => setTransferring(false)} onSaved={() => { setTransferring(false); reload(); onTransferred?.(); }} />
      )}
    </div>
  );
}

// Tạo phiếu thu/chi độc lập, không gắn đơn hàng cụ thể (VD: chi phí văn phòng, thu khác...).
function CreateTransactionModal({ bankAccounts, onClose, onSaved }) {
  const [type, setType] = useState("Thu");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("Tiền mặt");
  const [bankAccountId, setBankAccountId] = useState("");
  const [category, setCategory] = useState("");
  const [partyName, setPartyName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!amount || Number(amount) <= 0) return setError("Số tiền không hợp lệ");
    if (method === "Ngân hàng" && !bankAccountId) return setError("Chọn tài khoản ngân hàng nhận/chi tiền");
    setSaving(true);
    try {
      await transactionsService.createTransaction({
        type, amount: Number(amount), method, bankAccountId: method === "Ngân hàng" ? bankAccountId : null,
        category: category || (type === "Thu" ? "Thu khác" : "Chi khác"),
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
        {method === "Ngân hàng" && (
          <div>
            <label className="text-xs text-slate-500">Tài khoản ngân hàng</label>
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">— Chọn tài khoản —</option>
              {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}{b.bank_name ? ` (${b.bank_name})` : ""}</option>)}
            </select>
            {bankAccounts.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Chưa có tài khoản nào — sang tab "Ngân hàng" để thêm.</p>
            )}
          </div>
        )}
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

// ---------- Tab "Ngân hàng" — quản lý tài khoản, số dư tính trực tiếp từ sổ quỹ ----------
function BankTab({ bankAccounts, onChanged }) {
  const { can } = useAuth();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [cashBalance, setCashBalance] = useState(null);
  const [editingCashOpening, setEditingCashOpening] = useState(false);
  const [cashOpeningInput, setCashOpeningInput] = useState(0);
  const [savingCash, setSavingCash] = useState(false);

  async function reloadCash() {
    try { setCashBalance(await bankService.getCashBalance()); } catch { /* ignore */ }
  }
  useEffect(() => { reloadCash(); }, []);

  async function saveCashOpening(e) {
    e.preventDefault();
    setSavingCash(true);
    try {
      await bankService.setCashOpeningBalance(Number(cashOpeningInput) || 0);
      await reloadCash();
      setEditingCashOpening(false);
    } catch (err) { alert(err.message); }
    finally { setSavingCash(false); }
  }

  async function remove(id) {
    if (!confirm("Xoá tài khoản ngân hàng này?")) return;
    try { await bankService.deleteBankAccount(id); onChanged(); }
    catch (e) { alert(e.message); }
  }

  const totalBalance = bankAccounts.reduce((s, b) => s + Number(b.balance), 0) + (cashBalance ? Number(cashBalance.balance) : 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 inline-block">
          <div className="text-xs text-slate-400">Tổng số dư các tài khoản</div>
          <div className="text-lg font-bold text-slate-800">{fmt(totalBalance)}</div>
        </div>
        {can("finance_edit") && (
          <button onClick={() => setCreating(true)} className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl">
            + Thêm tài khoản
          </button>
        )}
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Tiền mặt — quỹ ảo, số dư tính từ transactions method='Tiền mặt' */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-teal-100">
          <div className="font-bold text-slate-800">Tiền mặt</div>
          <div className="text-xs text-slate-400">Quỹ tiền mặt</div>
          <div className="text-xl font-bold text-teal-600 mt-2">{cashBalance ? fmt(cashBalance.balance) : "—"}</div>
          {editingCashOpening ? (
            <form onSubmit={saveCashOpening} className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
              <input type="number" min="0" value={cashOpeningInput} onChange={(e) => setCashOpeningInput(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs w-28" />
              <button type="submit" disabled={savingCash} className="text-xs text-teal-600 font-medium">{savingCash ? "…" : "Lưu"}</button>
              <button type="button" onClick={() => setEditingCashOpening(false)} className="text-xs text-slate-400">Huỷ</button>
            </form>
          ) : (
            <div className="flex gap-3 text-xs mt-3 pt-2 border-t border-slate-100">
              {can("finance_edit") && (
                <button onClick={() => { setCashOpeningInput(cashBalance?.openingBalance ?? 0); setEditingCashOpening(true); }}
                  className="text-slate-600 hover:underline">Sửa số dư đầu kỳ</button>
              )}
            </div>
          )}
        </div>
        {bankAccounts.map((b) => (
          <div key={b.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="font-bold text-slate-800">{b.name}</div>
            <div className="text-xs text-slate-400">{b.bank_name || "—"}{b.account_number ? ` · ${b.account_number}` : ""}</div>
            <div className="text-xl font-bold text-teal-600 mt-2">{fmt(b.balance)}</div>
            <div className="flex gap-3 text-xs mt-3 pt-2 border-t border-slate-100">
              <button onClick={() => setViewing(b)} className="text-teal-600 hover:underline font-medium">Xem giao dịch</button>
              {can("finance_edit") && <button onClick={() => setEditing(b)} className="text-slate-600 hover:underline">Sửa</button>}
              {can("finance_delete") && <button onClick={() => remove(b.id)} className="text-red-500 hover:underline">Xoá</button>}
            </div>
          </div>
        ))}
        {bankAccounts.length === 0 && <p className="text-slate-400 text-sm">Chưa có tài khoản ngân hàng nào.</p>}
      </div>

      {(creating || editing) && (
        <BankAccountModal account={editing} onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); onChanged(); }} />
      )}
      {viewing && <BankTransactionsModal account={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function BankAccountModal({ account, onClose, onSaved }) {
  const isNew = !account;
  const [name, setName] = useState(account?.name || "");
  const [bankName, setBankName] = useState(account?.bank_name || "");
  const [accountNumber, setAccountNumber] = useState(account?.account_number || "");
  const [openingBalance, setOpeningBalance] = useState(account?.opening_balance || 0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Thiếu tên tài khoản");
    setSaving(true);
    try {
      const payload = { name: name.trim(), bankName: bankName || null, accountNumber: accountNumber || null, openingBalance: Number(openingBalance) || 0 };
      if (isNew) await bankService.createBankAccount(payload);
      else await bankService.updateBankAccount(account.id, payload);
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isNew ? "Thêm tài khoản ngân hàng" : "Sửa tài khoản ngân hàng"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="text-xs text-slate-500">Tên gợi nhớ</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Vietcombank chính"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Tên ngân hàng</label>
            <input value={bankName} onChange={(e) => setBankName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Số tài khoản</label>
            <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">Số dư đầu kỳ</label>
          <input type="number" min="0" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <p className="text-xs text-slate-400 mt-1">Số dư hiển thị sau này = số dư đầu kỳ + tổng Thu − tổng Chi qua tài khoản này.</p>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving}
            className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TransferFundsModal({ bankAccounts, onClose, onSaved }) {
  const CASH_VALUE = "__cash__";
  const [from, setFrom] = useState(CASH_VALUE);
  const [to, setTo] = useState(bankAccounts[0]?.id || CASH_VALUE);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const accountOptions = [
    { value: CASH_VALUE, label: "Tiền mặt" },
    ...bankAccounts.map((b) => ({ value: b.id, label: b.name + (b.bank_name ? ` (${b.bank_name})` : "") })),
  ];

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (from === to) return setError("Nơi đi và nơi đến phải khác nhau");
    if (!amount || Number(amount) <= 0) return setError("Số tiền không hợp lệ");
    setSaving(true);
    try {
      await bankService.transferFunds({
        fromBankAccountId: from === CASH_VALUE ? null : from,
        toBankAccountId: to === CASH_VALUE ? null : to,
        amount: Number(amount),
        note: note || null,
      });
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Chuyển quỹ" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Từ</label>
            <select value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Đến</label>
            <select value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">Số tiền</label>
          <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Ghi chú (tuỳ chọn)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Rút tiền mặt nộp ngân hàng"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving}
            className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu…" : "Xác nhận chuyển"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BankTransactionsModal({ account, onClose }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    bankService.getBankAccountTransactions(account.id).then(setRows).catch((e) => setError(e.message));
  }, [account.id]);

  return (
    <Modal title={`Giao dịch — ${account.name}`} onClose={onClose} wide>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      <div className="border border-slate-200 rounded-lg max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs">
              <th className="py-1.5 px-3">Mã phiếu</th>
              <th className="py-1.5 px-3">Loại</th>
              <th className="py-1.5 px-3 text-right">Số tiền</th>
              <th className="py-1.5 px-3">Liên quan</th>
              <th className="py-1.5 px-3">Ngày</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="py-1.5 px-3 font-medium">{t.code}</td>
                <td className="py-1.5 px-3"><Badge label={t.type} colorClass={TYPE_COLOR[t.type]} /></td>
                <td className={`py-1.5 px-3 text-right font-medium ${t.type === "Thu" ? "text-emerald-600" : "text-red-500"}`}>
                  {t.type === "Thu" ? "+" : "-"}{fmt(t.amount)}
                </td>
                <td className="py-1.5 px-3 text-slate-500">{t.order_code || t.party_name || "—"}</td>
                <td className="py-1.5 px-3 text-slate-400">{new Date(t.created_at).toLocaleString("vi-VN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-slate-400 text-sm p-4">Tài khoản này chưa có giao dịch nào.</p>}
      </div>
    </Modal>
  );
}
