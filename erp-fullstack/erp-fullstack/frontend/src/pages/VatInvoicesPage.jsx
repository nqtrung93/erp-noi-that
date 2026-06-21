import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as ordersService from "../services/orders.service.js";
import { fmt } from "../utils/format.js";
import Badge from "../components/Badge.jsx";

const STATUS_COLOR = {
  "Chưa xuất": "bg-amber-100 text-amber-700",
  "Đã xuất": "bg-emerald-100 text-emerald-700",
};
const ORDER_STATUSES = ["Chờ xác nhận", "Đang giao", "Hoàn thành", "Đã huỷ"];

export default function VatInvoicesPage() {
  const { can } = useAuth();
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [vatStatusFilter, setVatStatusFilter] = useState("");

  async function reload() {
    try { setOrders(await ordersService.listOrders()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  const vatOrders = orders
    .filter((o) => o.requires_vat)
    .filter((o) => !statusFilter || o.status === statusFilter)
    .filter((o) => !vatStatusFilter || (o.vat_invoice_status || "Chưa xuất") === vatStatusFilter);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Hoá đơn VAT</h2>
      <div className="flex gap-3 flex-wrap">
        <div>
          <label className="text-xs text-slate-500">Trạng thái đơn hàng</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm block">
            <option value="">— Tất cả —</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Trạng thái hoá đơn VAT</label>
          <select value={vatStatusFilter} onChange={(e) => setVatStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm block">
            <option value="">— Tất cả —</option>
            <option>Chưa xuất</option>
            <option>Đã xuất</option>
          </select>
        </div>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs">
              <th className="py-2 px-3">Đơn</th>
              <th className="py-2 px-3">Trạng thái đơn</th>
              <th className="py-2 px-3 text-right">Tổng tiền</th>
              <th className="py-2 px-3 text-right">VAT</th>
              <th className="py-2 px-3">Số hoá đơn (MISA)</th>
              <th className="py-2 px-3">Trạng thái VAT</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vatOrders.map((o) => (
              <VatRow key={o.id} order={o} canEdit={can("vatinvoice_edit")} onSaved={reload} />
            ))}
          </tbody>
        </table>
        {vatOrders.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có đơn yêu cầu hoá đơn VAT.</p>}
      </div>
    </div>
  );
}

// Mỗi đơn 1 dòng, sửa trực tiếp. Nhập số hoá đơn → tự chuyển trạng thái "Đã xuất".
function VatRow({ order, canEdit, onSaved }) {
  const [invoiceNo, setInvoiceNo] = useState(order.vat_invoice_no || "");
  const [status, setStatus] = useState(order.vat_invoice_status || "Chưa xuất");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function onInvoiceNoChange(v) {
    setInvoiceNo(v);
    setDirty(true);
    if (v.trim() && status === "Chưa xuất") setStatus("Đã xuất");
    if (!v.trim() && status === "Đã xuất") setStatus("Chưa xuất");
  }
  function onStatusChange(v) {
    setStatus(v);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await ordersService.updateVat(order.id, { vatInvoiceStatus: status, vatInvoiceNo: invoiceNo });
      setDirty(false);
      onSaved();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td className="py-2 px-3 font-medium whitespace-nowrap">{order.code}</td>
      <td className="py-2 px-3 text-slate-500">{order.status}</td>
      <td className="py-2 px-3 text-right whitespace-nowrap">{fmt(order.total)}</td>
      <td className="py-2 px-3 text-right whitespace-nowrap text-slate-500">{order.vat_rate}% ({fmt(order.vat_amount)})</td>
      <td className="py-2 px-3">
        <input value={invoiceNo} disabled={!canEdit} onChange={(e) => onInvoiceNoChange(e.target.value)}
          placeholder="VD: 1C24TAA-0001234"
          className="w-44 border border-slate-200 rounded-lg px-2 py-1 text-sm disabled:bg-slate-50" />
      </td>
      <td className="py-2 px-3">
        <select value={status} disabled={!canEdit} onChange={(e) => onStatusChange(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1 text-sm disabled:bg-slate-50">
          <option>Chưa xuất</option>
          <option>Đã xuất</option>
        </select>
        <div className="mt-1"><Badge label={status} colorClass={STATUS_COLOR[status]} /></div>
      </td>
      <td className="py-2 px-3">
        {canEdit && dirty && (
          <button onClick={save} disabled={saving}
            className="bg-teal-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">
            {saving ? "…" : "Lưu"}
          </button>
        )}
      </td>
    </tr>
  );
}
