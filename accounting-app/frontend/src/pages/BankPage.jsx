import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as bankService from "../services/bank.service.js";
import { fmt } from "../utils/format.js";
import Modal from "../components/Modal.jsx";
import Toolbar, { ToolbarButton } from "../components/Toolbar.jsx";

export default function BankPage() {
  const { can } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);

  async function reload() {
    try { setAccounts(await bankService.listBankAccounts()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  async function remove(id) {
    if (!confirm("Xoá tài khoản này?")) return;
    try { await bankService.removeBankAccount(id); reload(); }
    catch (e) { setError(e.message); }
  }

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);

  return (
    <div className="space-y-3">
      <Toolbar
        title="Tài khoản ngân hàng"
        actions={can("bank_edit") && (
          <ToolbarButton variant="primary" onClick={() => setCreating(true)}>+ Thêm tài khoản</ToolbarButton>
        )}
      />
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-xl px-4 py-2 shadow-sm border border-slate-100 text-sm inline-block">
        Tổng số dư các tài khoản: <span className="font-bold text-slate-800">{fmt(totalBalance)}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map((a) => (
          <div key={a.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-slate-800">{a.name}</div>
                <div className="text-xs text-slate-400">{a.bank_name || "—"} · {a.account_number || "—"}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Số dư</div>
                <div className="font-bold text-indigo-600">{fmt(a.balance)}</div>
              </div>
            </div>
            <div className="flex gap-3 mt-3 text-xs">
              <button onClick={() => setViewing(a)} className="text-indigo-600 hover:underline">Xem giao dịch</button>
              {can("bank_edit") && <button onClick={() => remove(a.id)} className="text-red-500 hover:underline">Xoá</button>}
            </div>
          </div>
        ))}
        {accounts.length === 0 && <p className="text-slate-400 text-sm">Chưa có tài khoản ngân hàng nào.</p>}
      </div>

      {creating && <CreateBankModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {viewing && <BankTransactionsModal account={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function CreateBankModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name) return setError("Thiếu tên tài khoản");
    setSaving(true);
    try {
      await bankService.createBankAccount({
        name, bankName: bankName || null, accountNumber: accountNumber || null,
        openingBalance: Number(openingBalance) || 0,
      });
      onSaved();
    } catch (e2) { setError(e2.message); } finally { setSaving(false); }
  }

  return (
    <Modal title="Thêm tài khoản ngân hàng" onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div><label className="text-xs text-slate-500">Tên gợi nhớ</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: TK chính Vietcombank"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Tên ngân hàng</label>
          <input value={bankName} onChange={(e) => setBankName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Số tài khoản</label>
          <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Số dư ban đầu</label>
          <input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">{saving ? "Đang lưu…" : "Thêm"}</button>
        </div>
      </form>
    </Modal>
  );
}

function BankTransactionsModal({ account, onClose }) {
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    bankService.getBankTransactions(account.id).then(setTransactions).catch((e) => setError(e.message));
  }, [account.id]);

  return (
    <Modal title={`Giao dịch — ${account.name}`} onClose={onClose} size="lg">
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2 mb-2">{error}</div>}
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-400 text-xs">
            <th className="py-2">Mã</th><th className="py-2">Loại</th><th className="py-2 text-right">Số tiền</th><th className="py-2">Ngày</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.map((t) => (
              <tr key={t.id}>
                <td className="py-2">{t.code}</td>
                <td className="py-2">{t.type}</td>
                <td className={`py-2 text-right font-medium ${t.type === "Thu" ? "text-emerald-600" : "text-red-500"}`}>
                  {t.type === "Thu" ? "+" : "-"}{fmt(t.amount)}
                </td>
                <td className="py-2 text-slate-400">{new Date(t.date).toLocaleDateString("vi-VN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {transactions.length === 0 && <p className="text-slate-400 text-sm py-2">Chưa có giao dịch nào.</p>}
      </div>
    </Modal>
  );
}
