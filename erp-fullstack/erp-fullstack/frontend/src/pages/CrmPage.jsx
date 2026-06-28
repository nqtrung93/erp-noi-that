import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as customersService from "../services/customers.service.js";
import { fmt, fmtDate } from "../utils/format.js";
import Modal from "../components/Modal.jsx";
import Badge from "../components/Badge.jsx";
import { PAYMENT_METHODS } from "../utils/constants.js";
import { exportCsv } from "../utils/exportCsv.js";
import * as ordersService from "../services/orders.service.js";

const STATUS_COLOR = {
  "Chờ xác nhận": "bg-amber-100 text-amber-700",
  "Đang giao": "bg-blue-100 text-blue-700",
  "Hoàn thành": "bg-emerald-100 text-emerald-700",
  "Đã huỷ": "bg-red-100 text-red-700",
};

export default function CrmPage() {
  const { can } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [filterGroup, setFilterGroup] = useState("");
  const [search, setSearch] = useState("");

  async function reload() {
    try {
      const [cs, gs] = await Promise.all([customersService.listCustomers(), customersService.listCustomerGroups()]);
      setCustomers(cs);
      setGroups(gs);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  async function remove(id) {
    if (!confirm("Xoá khách hàng này?")) return;
    try { await customersService.deleteCustomer(id); reload(); }
    catch (e) { alert(e.message); }
  }

  function exportCustomers() {
    exportCsv("khach_hang.csv", [
      { key: "code", label: "Mã KH" },
      { key: "name", label: "Tên" },
      { key: "phone", label: "Điện thoại" },
      { key: "email", label: "Email" },
      { key: "address", label: "Địa chỉ" },
      { key: "group_name", label: "Nhóm khách" },
      { key: "debt", label: "Công nợ" },
    ], customers);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Khách hàng</h2>
        <div className="flex gap-2">
          <button onClick={exportCustomers} className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl">
            Xuất CSV
          </button>
          {can("crm_edit") && (
            <button onClick={() => setEditing({})} className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl">
              + Thêm khách hàng
            </button>
          )}
        </div>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Tìm khách hàng</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc số điện thoại…"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Nhóm khách hàng</label>
          <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Tất cả</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100">
        {customers
          .filter((c) => !filterGroup || c.group_name === filterGroup)
          .filter((c) => {
            const q = search.trim().toLowerCase();
            if (!q) return true;
            return c.name.toLowerCase().includes(q) || (c.phone || "").toLowerCase().includes(q);
          })
          .map((c) => (
          <div key={c.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-bold text-slate-800">{c.name} <span className="text-xs font-normal text-slate-400">{c.code}</span></div>
              <div className="text-xs text-slate-400">
                {c.phone || "—"} · {c.group_name || "Chưa phân nhóm"}
                {Number(c.debt) > 0 && <span className="text-red-500"> · Nợ {fmt(c.debt)}</span>}
                {Number(c.overdue_days) > 0 && (
                  <span className="text-red-600 font-semibold"> · ⚠ Quá hạn {Math.floor(c.overdue_days)} ngày</span>
                )}
              </div>
            </div>
            <div className="flex gap-3 text-xs">
              <button onClick={() => setViewing(c)} className="text-teal-600 hover:underline font-medium">Chi tiết</button>
              {can("crm_edit") && Number(c.debt) > 0 && (
                <button onClick={() => setPaying(c)} className="text-emerald-600 hover:underline font-medium">Thu nợ</button>
              )}
              {can("crm_edit") && (
                <button onClick={() => setEditing(c)} className="text-teal-600 hover:underline">Sửa</button>
              )}
              {can("crm_delete") && (
                <button onClick={() => remove(c.id)} className="text-red-500 hover:underline">Xoá</button>
              )}
            </div>
          </div>
        ))}
        {customers.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có khách hàng.</p>}
      </div>

      {editing !== null && (
        <CustomerModal
          customer={editing}
          groups={groups}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
          onGroupCreated={(g) => setGroups((gs) => [...gs, g])}
        />
      )}
      {paying && (
        <PayDebtModal customer={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); reload(); }} />
      )}
      {viewing && (
        <CustomerDetailModal customer={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

const MS_PER_DAY = 86400000;

// Xem chi tiết khách hàng: lịch sử đơn hàng + báo cáo công nợ theo tuổi nợ (giống bảng đối chiếu công nợ kế toán).
function CustomerDetailModal({ customer, onClose }) {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [agingThreshold, setAgingThreshold] = useState(30); // mốc số ngày tách "quá hạn ít" / "quá hạn nhiều" — tự đổi được

  useEffect(() => {
    ordersService.listOrders()
      .then((all) => setOrders(all.filter((o) => o.customer_id === customer.id)))
      .catch((e) => setError(e.message));
  }, [customer.id]);

  const termDays = customer.payment_term_days ?? 30;
  const debtRows = orders
    .filter((o) => o.status !== "Đã huỷ" && Number(o.total) - Number(o.paid) > 0.01)
    .map((o) => {
      const dueDate = new Date(new Date(o.created_at).getTime() + termDays * MS_PER_DAY);
      const overdueDays = Math.floor((Date.now() - dueDate.getTime()) / MS_PER_DAY);
      const remaining = Number(o.total) - Number(o.paid);
      let bucket;
      if (overdueDays <= 0) bucket = "Trong hạn";
      else if (overdueDays <= agingThreshold) bucket = `Quá hạn 1–${agingThreshold} ngày`;
      else bucket = `Quá hạn ≥${agingThreshold} ngày`;
      return { ...o, dueDate, overdueDays, remaining, bucket };
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const totalDebt = debtRows.reduce((s, o) => s + o.remaining, 0);
  const inTerm = debtRows.filter((o) => o.bucket === "Trong hạn").reduce((s, o) => s + o.remaining, 0);
  const overdue = totalDebt - inTerm;

  const BUCKET_ORDER = [`Quá hạn ≥${agingThreshold} ngày`, `Quá hạn 1–${agingThreshold} ngày`, "Trong hạn"];
  const grouped = BUCKET_ORDER.map((b) => ({ bucket: b, rows: debtRows.filter((o) => o.bucket === b) })).filter((g) => g.rows.length);

  function exportDebt() {
    exportCsv(`cong_no_${customer.name}.csv`, [
      { key: (o) => fmtDate(o.created_at), label: "Ngày tạo" },
      { key: "code", label: "Mã đơn" },
      { key: (o) => fmtDate(o.dueDate), label: "Hạn TT" },
      { key: "total", label: "Giá trị đơn" },
      { key: "paid", label: "Đã thu" },
      { key: "remaining", label: "Còn phải thu" },
      { key: (o) => Math.max(o.overdueDays, 0), label: "Số ngày QH" },
      { key: "bucket", label: "Nhóm tuổi nợ" },
    ], debtRows);
  }

  return (
    <Modal title={`Chi tiết khách hàng — ${customer.code || ""} ${customer.name}`} onClose={onClose} wide>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-slate-400">Mã KH:</span> {customer.code || "—"}</div>
          <div><span className="text-slate-400">Điện thoại:</span> {customer.phone || "—"}</div>
          <div><span className="text-slate-400">Email:</span> {customer.email || "—"}</div>
          <div><span className="text-slate-400">Địa chỉ:</span> {customer.address || "—"}</div>
          <div><span className="text-slate-400">Nhóm:</span> {customer.group_name || "Chưa phân nhóm"}</div>
          <div><span className="text-slate-400">Hạn thanh toán:</span> {termDays} ngày</div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Mốc phân loại quá hạn (ngày):</label>
          <input type="number" min="1" value={agingThreshold} onChange={(e) => setAgingThreshold(Number(e.target.value) || 30)}
            className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm" />
          <span className="text-xs text-slate-400">VD: 30 → tách "quá hạn 1–30 ngày" và "quá hạn ≥30 ngày"</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="text-xs text-slate-400">Tổng nợ</div>
            <div className="text-lg font-bold text-slate-800">{fmt(totalDebt)}</div>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3">
            <div className="text-xs text-slate-400">Trong hạn</div>
            <div className="text-lg font-bold text-emerald-600">{fmt(inTerm)}</div>
          </div>
          <div className="bg-red-50 rounded-xl p-3">
            <div className="text-xs text-slate-400">Quá hạn</div>
            <div className="text-lg font-bold text-red-500">{fmt(overdue)}</div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="font-semibold text-slate-700">Chi tiết công nợ theo tuổi nợ</div>
          <button onClick={exportDebt} className="border border-slate-200 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg">
            Xuất CSV
          </button>
        </div>

        <div className="border border-slate-200 rounded-lg max-h-96 overflow-y-auto">
          {grouped.map((g) => {
            const groupTotal = g.rows.reduce((s, o) => s + o.remaining, 0);
            return (
              <div key={g.bucket}>
                <div className={`px-3 py-1.5 text-xs font-semibold ${g.bucket === "Trong hạn" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                  {g.bucket} — {g.rows.length} đơn — {fmt(groupTotal)}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 text-xs">
                      <th className="py-1.5 px-3">Ngày tạo</th>
                      <th className="py-1.5 px-3">Mã đơn</th>
                      <th className="py-1.5 px-3">Hạn TT</th>
                      <th className="py-1.5 px-3 text-right">Giá trị đơn</th>
                      <th className="py-1.5 px-3 text-right">Đã thu</th>
                      <th className="py-1.5 px-3 text-right">Còn phải thu</th>
                      <th className="py-1.5 px-3 text-right">Ngày QH</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {g.rows.map((o) => (
                      <tr key={o.id}>
                        <td className="py-1.5 px-3">{fmtDate(o.created_at)}</td>
                        <td className="py-1.5 px-3 font-medium">{o.code}</td>
                        <td className="py-1.5 px-3">{fmtDate(o.dueDate)}</td>
                        <td className="py-1.5 px-3 text-right">{fmt(o.total)}</td>
                        <td className="py-1.5 px-3 text-right">{fmt(o.paid)}</td>
                        <td className="py-1.5 px-3 text-right font-semibold">{fmt(o.remaining)}</td>
                        <td className={`py-1.5 px-3 text-right ${o.overdueDays > 0 ? "text-red-500" : "text-slate-400"}`}>
                          {o.overdueDays > 0 ? o.overdueDays : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          {debtRows.length === 0 && <p className="text-slate-400 text-sm p-4">Không còn công nợ.</p>}
        </div>

        <div className="font-semibold text-slate-700 pt-2">Lịch sử mua hàng</div>
        <div className="border border-slate-200 rounded-lg max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 text-xs">
                <th className="py-1.5 px-3">Ngày tạo</th>
                <th className="py-1.5 px-3">Mã đơn</th>
                <th className="py-1.5 px-3 text-right">Giá trị đơn</th>
                <th className="py-1.5 px-3 text-right">Đã thu</th>
                <th className="py-1.5 px-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((o) => (
                <tr key={o.id}>
                  <td className="py-1.5 px-3">{fmtDate(o.created_at)}</td>
                  <td className="py-1.5 px-3 font-medium">{o.code}</td>
                  <td className="py-1.5 px-3 text-right">{fmt(o.total)}</td>
                  <td className="py-1.5 px-3 text-right">{fmt(o.paid)}</td>
                  <td className="py-1.5 px-3"><Badge label={o.status} colorClass={STATUS_COLOR[o.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="text-slate-400 text-sm p-4">Khách hàng chưa có đơn hàng nào.</p>}
        </div>
      </div>
    </Modal>
  );
}

// Thu nợ nhanh: chỉ ghi nhận phiếu thu, không phân bổ vào đơn cụ thể (đơn giản hoá).
function PayDebtModal({ customer, onClose, onSaved }) {
  const [amount, setAmount] = useState(Number(customer.debt) || 0);
  const [method, setMethod] = useState("Tiền mặt");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!amount || Number(amount) <= 0) return setError("Số tiền không hợp lệ");
    setSaving(true);
    try {
      await customersService.payCustomerDebt(customer.id, { amount: Number(amount), method, note });
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Thu nợ — ${customer.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="text-xs text-slate-500">Công nợ hiện tại: <span className="font-semibold text-red-500">{fmt(customer.debt)}</span></div>
        <div>
          <label className="text-xs text-slate-500">Số tiền thu</label>
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
        <div>
          <label className="text-xs text-slate-500">Ghi chú</label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving}
            className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu…" : "Xác nhận thu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CustomerModal({ customer, groups, onClose, onSaved, onGroupCreated }) {
  const isNew = !customer.id;
  const [name, setName] = useState(customer.name || "");
  const [phone, setPhone] = useState(customer.phone || "");
  const [email, setEmail] = useState(customer.email || "");
  const [address, setAddress] = useState(customer.address || "");
  const [groupName, setGroupName] = useState(customer.group_name || "");
  const [newGroup, setNewGroup] = useState("");
  const [paymentTermDays, setPaymentTermDays] = useState(customer.payment_term_days ?? 30);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Thiếu tên khách hàng");
    setSaving(true);
    try {
      let group = groupName;
      if (!group && newGroup.trim()) {
        await customersService.createCustomerGroup(newGroup.trim());
        group = newGroup.trim();
        onGroupCreated(group);
      }
      const payload = {
        name: name.trim(), phone: phone || null, email: email || null, address: address || null,
        group_name: group || null, payment_term_days: Number(paymentTermDays) || 0,
      };
      if (isNew) await customersService.createCustomer(payload);
      else await customersService.updateCustomer(customer.id, payload);
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isNew ? "Thêm khách hàng" : "Sửa khách hàng"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="text-xs text-slate-500">Tên khách hàng</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
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
        <div>
          <label className="text-xs text-slate-500">Địa chỉ</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Nhóm khách</label>
            <select value={groupName} onChange={(e) => setGroupName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">— Chưa phân nhóm —</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Hoặc tạo nhóm mới</label>
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)}
              placeholder="Tên nhóm mới"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">Hạn thanh toán (số ngày kể từ ngày tạo đơn)</label>
          <input type="number" min="0" value={paymentTermDays} onChange={(e) => setPaymentTermDays(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
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
