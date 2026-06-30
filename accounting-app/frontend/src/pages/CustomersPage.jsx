import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as partnersService from "../services/partners.service.js";
import * as ordersService from "../services/orders.service.js";
import { fmt } from "../utils/format.js";
import Modal from "../components/Modal.jsx";
import Toolbar, { ToolbarButton } from "../components/Toolbar.jsx";
import MoneyInput from "../components/MoneyInput.jsx";

const ORDER_STATUS_COLOR = {
  "Nháp": "bg-slate-100 text-slate-600",
  "Mới": "bg-amber-100 text-amber-700",
  "Hoàn thành": "bg-emerald-100 text-emerald-700",
  "Đã hủy": "bg-red-100 text-red-700",
};

// Trang Khách hàng riêng (khác trang Công nợ chung KH+NCC) — chỉ liệt kê khách hàng,
// click vào xem chi tiết: thông tin + lịch sử mua hàng + lịch sử công nợ, giống ERP.
export default function CustomersPage() {
  const { can } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [debtTarget, setDebtTarget] = useState(null);
  const [viewing, setViewing] = useState(null);

  async function reload() {
    try {
      const all = await partnersService.listPartners();
      setCustomers(all.filter((p) => p.type === "customer"));
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  const filtered = customers.filter((c) => !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || "").includes(search) ||
    c.code.toLowerCase().includes(search.toLowerCase()));
  const totalDebt = filtered.reduce((s, c) => s + Number(c.debt), 0);

  async function remove(id) {
    if (!confirm("Xoá khách hàng này?")) return;
    try { await partnersService.removePartner(id); reload(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="space-y-3">
      <Toolbar
        title="Khách hàng"
        search={search} onSearchChange={setSearch} searchPlaceholder="Tìm theo tên, SĐT hoặc mã…"
        actions={can("partners_edit") && (
          <ToolbarButton variant="primary" onClick={() => setCreating(true)}>+ Thêm khách hàng</ToolbarButton>
        )}
      />
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-xl px-4 py-2 shadow-sm border border-slate-100 text-sm inline-block">
        Tổng công nợ khách hàng: <span className="font-bold text-slate-800">{fmt(totalDebt)}</span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs">
              <th className="py-2 px-3">Mã</th>
              <th className="py-2 px-3">Tên khách hàng</th>
              <th className="py-2 px-3">Điện thoại</th>
              <th className="py-2 px-3">Địa chỉ</th>
              <th className="py-2 px-3 text-right">Công nợ</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((c) => (
              <tr key={c.id}>
                <td className="py-2 px-3 font-medium whitespace-nowrap">{c.code}</td>
                <td className="py-2 px-3">
                  <button onClick={() => setViewing(c)} className="text-indigo-600 hover:underline font-medium">{c.name}</button>
                </td>
                <td className="py-2 px-3 text-slate-500">{c.phone || "—"}</td>
                <td className="py-2 px-3 text-slate-500">{c.address || "—"}</td>
                <td className="py-2 px-3 text-right font-medium">{fmt(c.debt)}</td>
                <td className="py-2 px-3">
                  <div className="flex gap-2 justify-end text-xs flex-wrap">
                    <button onClick={() => setViewing(c)} className="text-slate-600 hover:underline">Xem</button>
                    {can("partners_edit") && (
                      <>
                        <button onClick={() => setEditing(c)} className="text-sky-600 hover:underline">Sửa</button>
                        <button onClick={() => setDebtTarget(c)} className="text-indigo-600 hover:underline">Ghi/thu nợ</button>
                      </>
                    )}
                    {can("partners_delete") && (
                      <button onClick={() => remove(c.id)} className="text-red-500 hover:underline">Xoá</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có khách hàng nào.</p>}
      </div>

      {creating && <CustomerFormModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {editing && <CustomerFormModal customer={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {debtTarget && <DebtModal customer={debtTarget} onClose={() => setDebtTarget(null)} onSaved={() => { setDebtTarget(null); reload(); }} />}
      {viewing && <CustomerDetailModal customer={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function CustomerFormModal({ customer, onClose, onSaved }) {
  const [name, setName] = useState(customer?.name || "");
  const [phone, setPhone] = useState(customer?.phone || "");
  const [contact, setContact] = useState(customer?.contact || "");
  const [address, setAddress] = useState(customer?.address || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Thiếu tên khách hàng");
    setSaving(true);
    try {
      const payload = { name: name.trim(), type: "customer", phone: phone || null, contact: contact || null, address: address || null };
      if (customer) await partnersService.updatePartner(customer.id, payload);
      else await partnersService.createPartner(payload);
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={customer ? `Sửa khách hàng — ${customer.code}` : "Thêm khách hàng"} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="text-xs text-slate-500">Tên khách hàng</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Số điện thoại</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Người liên hệ</label>
          <input value={contact} onChange={(e) => setContact(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Địa chỉ</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving}
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu…" : customer ? "Lưu thay đổi" : "Thêm"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DebtModal({ customer, onClose, onSaved }) {
  const [direction, setDirection] = useState("decrease");
  const [amount, setAmount] = useState(Number(customer.debt) > 0 ? String(customer.debt) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!amount || Number(amount) <= 0) return setError("Số tiền không hợp lệ");
    setSaving(true);
    try {
      await partnersService.adjustDebt(customer.id, { amount: Number(amount), direction, note: note || null });
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Ghi/thu nợ — ${customer.name}`} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="text-sm text-slate-500">Công nợ hiện tại: <span className="font-semibold text-slate-800">{fmt(customer.debt)}</span></div>
        <div>
          <label className="text-xs text-slate-500">Loại điều chỉnh</label>
          <select value={direction} onChange={(e) => setDirection(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="increase">Ghi tăng nợ (không có dòng tiền)</option>
            <option value="decrease">Thu nợ (tạo phiếu Thu)</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Số tiền</label>
          <MoneyInput value={amount} onChange={setAmount}
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
            {saving ? "Đang lưu…" : "Xác nhận"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Chi tiết khách hàng: thông tin + lịch sử mua hàng + lịch sử công nợ (giống trang khách hàng trong ERP).
function CustomerDetailModal({ customer, onClose }) {
  const [tab, setTab] = useState("orders"); // orders | debt
  const [orders, setOrders] = useState(null);
  const [debtEntries, setDebtEntries] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    ordersService.listOrders()
      .then((all) => setOrders(all.filter((o) => String(o.customer_id) === String(customer.id))))
      .catch((e) => setError(e.message));
    partnersService.debtHistory(customer.id).then(setDebtEntries).catch((e) => setError(e.message));
  }, [customer.id]);

  const totalOrders = (orders || []).length;
  const totalSpent = (orders || []).reduce((s, o) => s + Number(o.total), 0);

  return (
    <Modal title={`Khách hàng — ${customer.name}`} onClose={onClose} size="xl">
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><span className="text-slate-400">Mã</span><div className="font-medium">{customer.code}</div></div>
          <div><span className="text-slate-400">Điện thoại</span><div className="font-medium">{customer.phone || "—"}</div></div>
          <div><span className="text-slate-400">Địa chỉ</span><div className="font-medium">{customer.address || "—"}</div></div>
          <div><span className="text-slate-400">Công nợ hiện tại</span><div className="font-semibold text-red-500">{fmt(customer.debt)}</div></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl px-4 py-2 text-sm">Số đơn đã mua: <span className="font-semibold">{totalOrders}</span></div>
          <div className="bg-slate-50 rounded-xl px-4 py-2 text-sm">Tổng giá trị đã mua: <span className="font-semibold">{fmt(totalSpent)}</span></div>
        </div>

        <div className="flex gap-1 border-b border-slate-100">
          {[["orders", "Lịch sử mua hàng"], ["debt", "Lịch sử công nợ"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 py-1.5 text-sm font-medium ${tab === id ? "text-indigo-600 border-b-2 border-indigo-600" : "text-slate-400"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "orders" && (
          orders === null ? <p className="text-sm text-slate-400 py-6 text-center">Đang tải…</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-400 text-xs border-b border-slate-100">
                <th className="py-1.5">Mã đơn</th><th className="py-1.5 text-right">Tổng tiền</th>
                <th className="py-1.5 text-right">Đã thu</th><th className="py-1.5">Trạng thái</th><th className="py-1.5">Ngày</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-1.5 font-medium">{o.code}</td>
                    <td className="py-1.5 text-right">{fmt(o.total)}</td>
                    <td className="py-1.5 text-right text-emerald-600">{fmt(o.paid)}</td>
                    <td className="py-1.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ORDER_STATUS_COLOR[o.status]}`}>{o.status}</span></td>
                    <td className="py-1.5 text-slate-400 whitespace-nowrap">{new Date(o.created_at).toLocaleDateString("vi-VN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
        {tab === "orders" && orders?.length === 0 && <p className="text-slate-400 text-sm py-4 text-center">Chưa mua hàng lần nào.</p>}

        {tab === "debt" && (
          debtEntries === null ? <p className="text-sm text-slate-400 py-6 text-center">Đang tải…</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-400 text-xs border-b border-slate-100">
                <th className="py-1.5">Mã phiếu</th><th className="py-1.5">Loại</th>
                <th className="py-1.5 text-right">Số tiền</th><th className="py-1.5">Ghi chú</th><th className="py-1.5">Ngày</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {debtEntries.map((d) => (
                  <tr key={d.id}>
                    <td className="py-1.5 font-medium">{d.code}</td>
                    <td className="py-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.direction === "increase" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {d.direction === "increase" ? "Ghi tăng nợ" : "Giảm nợ"}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">{fmt(d.amount)}</td>
                    <td className="py-1.5 text-slate-500">{d.note || "—"}</td>
                    <td className="py-1.5 text-slate-400 whitespace-nowrap">{new Date(d.created_at).toLocaleDateString("vi-VN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
        {tab === "debt" && debtEntries?.length === 0 && <p className="text-slate-400 text-sm py-4 text-center">Chưa có biến động công nợ.</p>}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Đóng</button>
        </div>
      </div>
    </Modal>
  );
}
