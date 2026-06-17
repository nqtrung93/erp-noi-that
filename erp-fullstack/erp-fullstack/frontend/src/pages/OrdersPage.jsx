import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.js";
import * as ordersService from "../services/orders.service.js";
import { fmt, fmtDate } from "../utils/format.js";
import Badge from "../components/Badge.jsx";

// Trang đơn hàng mẫu: minh hoạ gọi service + enforce quyền hiển thị.
// Mọi thao tác đổi trạng thái đều gọi backend (backend trừ/hoàn tồn + kiểm quyền).
const STATUS_COLOR = {
  "Chờ xác nhận": "bg-amber-100 text-amber-700",
  "Đang giao": "bg-blue-100 text-blue-700",
  "Hoàn thành": "bg-emerald-100 text-emerald-700",
  "Đã huỷ": "bg-red-100 text-red-700",
};

export default function OrdersPage() {
  const { can } = useAuth();
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");

  async function reload() {
    try { setOrders(await ordersService.listOrders()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  async function changeStatus(id, status) {
    try {
      await ordersService.setOrderStatus(id, status); // backend tự trừ/hoàn tồn
      reload();
    } catch (e) {
      alert(e.message); // vd: "Không đủ tồn..." hoặc 403 nếu thiếu quyền orders_edit
    }
  }

  async function printInvoice(id) {
    const html = await ordersService.getInvoiceHtml(id); // HTML đã escape ở backend
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Đơn hàng</h2>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      <div className="space-y-2">
        {orders.map((o) => (
          <div key={o.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-800">{o.code}</div>
              <div className="text-xs text-slate-400">{fmtDate(o.created_at)} · {fmt(o.total)}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge label={o.status} colorClass={STATUS_COLOR[o.status]} />
              <button onClick={() => printInvoice(o.id)} className="text-xs text-slate-600 hover:underline">In</button>
              {can("orders_edit") && o.status !== "Hoàn thành" && o.status !== "Đã huỷ" && (
                <button onClick={() => changeStatus(o.id, "Hoàn thành")}
                  className="text-xs bg-emerald-600 text-white px-2 py-1 rounded-lg">Hoàn thành</button>
              )}
            </div>
          </div>
        ))}
        {orders.length === 0 && <p className="text-slate-400 text-sm">Chưa có đơn hàng.</p>}
      </div>
    </div>
  );
}
