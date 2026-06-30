import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as suppliersService from "../services/suppliers.service.js";
import { fmt } from "../utils/format.js";
import Modal from "../components/Modal.jsx";
import { PAYMENT_METHODS } from "../utils/constants.js";
import { exportCsv } from "../utils/exportCsv.js";
import * as bankService from "../services/bank.service.js";

export default function SuppliersPage() {
  const { can } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [viewing, setViewing] = useState(null);

  async function reload() {
    try { setSuppliers(await suppliersService.listSuppliers()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  function exportSuppliers() {
    exportCsv("nha_cung_cap.csv", [
      { key: "name", label: "Tên" }, { key: "contact", label: "Người liên hệ" },
      { key: "phone", label: "Điện thoại" }, { key: "email", label: "Email" }, { key: "debt", label: "Công nợ" },
    ], suppliers);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Nhà cung cấp</h2>
        <div className="flex gap-2">
          <button onClick={exportSuppliers} className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl">
            Xuất CSV
          </button>
          {can("suppliers_edit") && (
            <button onClick={() => setEditing({})} className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl">
              + Thêm nhà cung cấp
            </button>
          )}
        </div>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100">
        {suppliers.map((s) => (
          <div key={s.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-bold text-slate-800">{s.name}</div>
              <div className="text-xs text-slate-400">
                {s.phone || "—"} · {s.contact || "—"}
                {Number(s.debt) > 0 && <span className="text-red-500"> · Nợ {fmt(s.debt)}</span>}
              </div>
            </div>
            <div className="flex gap-3 text-xs">
              <button onClick={() => setViewing(s)} className="text-teal-600 hover:underline font-medium">Chi tiết</button>
              {can("suppliers_edit") && Number(s.debt) > 0 && (
                <button onClick={() => setPaying(s)} className="text-emerald-600 hover:underline font-medium">Thanh toán nợ</button>
              )}
              {can("suppliers_edit") && (
                <button onClick={() => setEditing(s)} className="text-teal-600 hover:underline">Sửa</button>
              )}
            </div>
          </div>
        ))}
        {suppliers.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có nhà cung cấp.</p>}
      </div>

      {editing !== null && (
        <SupplierModal supplier={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
      {paying && (
        <PayDebtModal supplier={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); reload(); }} />
      )}
      {viewing && (
        <Modal title={`Chi tiết nhà cung cấp — ${viewing.name}`} onClose={() => setViewing(null)}>
          <div className="space-y-2 text-sm">
            <div><span className="text-slate-400">Người liên hệ:</span> {viewing.contact || "—"}</div>
            <div><span className="text-slate-400">Điện thoại:</span> {viewing.phone || "—"}</div>
            <div><span className="text-slate-400">Email:</span> {viewing.email || "—"}</div>
            <div><span className="text-slate-400">Công nợ hiện tại:</span> <span className="text-red-500 font-semibold">{fmt(viewing.debt)}</span></div>
            <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">Xem lịch sử nhập hàng/thanh toán đầy đủ tại tab "Kho hàng → Phiếu nhập xuất" và "Thu chi".</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SupplierModal({ supplier, onClose, onSaved }) {
  const isNew = !supplier.id;
  const [name, setName] = useState(supplier.name || "");
  const [contact, setContact] = useState(supplier.contact || "");
  const [phone, setPhone] = useState(supplier.phone || "");
  const [email, setEmail] = useState(supplier.email || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Thiếu tên nhà cung cấp");
    setSaving(true);
    try {
      const payload = { name: name.trim(), contact: contact || null, phone: phone || null, email: email || null };
      if (isNew) await suppliersService.createSupplier(payload);
      else await suppliersService.updateSupplier(supplier.id, payload);
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isNew ? "Thêm nhà cung cấp" : "Sửa nhà cung cấp"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="text-xs text-slate-500">Tên nhà cung cấp</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Người liên hệ</label>
          <input value={contact} onChange={(e) => setContact(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Điện thoại</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
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

function PayDebtModal({ supplier, onClose, onSaved }) {
  const [amount, setAmount] = useState(Number(supplier.debt) || 0);
  const [method, setMethod] = useState("Tiền mặt");
  const [bankAccountId, setBankAccountId] = useState("");
  const [bankAccounts, setBankAccounts] = useState([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { bankService.listBankAccounts().then(setBankAccounts).catch(() => {}); }, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!amount || Number(amount) <= 0) return setError("Số tiền không hợp lệ");
    if (method === "Ngân hàng" && !bankAccountId) return setError("Chọn tài khoản ngân hàng");
    setSaving(true);
    try {
      await suppliersService.paySupplierDebt(supplier.id, { amount: Number(amount), method, bankAccountId: method === "Ngân hàng" ? bankAccountId : null, note });
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Thanh toán nợ — ${supplier.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="text-xs text-slate-500">Công nợ hiện tại: <span className="font-semibold text-red-500">{fmt(supplier.debt)}</span></div>
        <div>
          <label className="text-xs text-slate-500">Số tiền trả</label>
          <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Phương thức</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        {method === "Ngân hàng" && (
          <div>
            <label className="text-xs text-slate-500">Tài khoản ngân hàng</label>
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">— Chọn tài khoản —</option>
              {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-slate-500">Ghi chú</label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving}
            className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu…" : "Xác nhận trả"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
