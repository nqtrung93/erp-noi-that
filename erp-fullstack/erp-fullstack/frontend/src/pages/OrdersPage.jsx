import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as ordersService from "../services/orders.service.js";
import * as customersService from "../services/customers.service.js";
import * as productsService from "../services/products.service.js";
import * as warehousesService from "../services/warehouses.service.js";
import * as carriersService from "../services/carriers.service.js";
import * as orderSourcesService from "../services/orderSources.service.js";
import * as shopsService from "../services/shops.service.js";
import * as stockService from "../services/stock.service.js";
import * as bankService from "../services/bank.service.js";
import { fmt, fmtDate } from "../utils/format.js";
import Badge from "../components/Badge.jsx";
import Modal from "../components/Modal.jsx";
import MoneyInput from "../components/MoneyInput.jsx";
import ProductPicker from "../components/ProductPicker.jsx";
import { PAYMENT_METHODS } from "../utils/constants.js";
import { buildSellableOptions } from "../utils/sellable.js";
import { exportCsv } from "../utils/exportCsv.js";
import { readCsvFile } from "../utils/importCsv.js";

// Trang đơn hàng: tạo/sửa đơn, đổi trạng thái, theo dõi VAT, tạo phiếu thu/chi theo đơn.
// Mọi thao tác đổi trạng thái đều gọi backend (backend trừ/hoàn tồn + kiểm quyền).
const STATUS_COLOR = {
  "Chờ xác nhận": "bg-amber-100 text-amber-700",
  "Đang giao": "bg-blue-100 text-blue-700",
  "Hoàn thành": "bg-emerald-100 text-emerald-700",
  "Đã huỷ": "bg-red-100 text-red-700",
};
const VAT_COLOR = { "Chưa xuất": "bg-amber-100 text-amber-700", "Đã xuất": "bg-emerald-100 text-emerald-700" };

export default function OrdersPage() {
  const { can, user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [payingOrder, setPayingOrder] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [showCreateEcommerce, setShowCreateEcommerce] = useState(false);
  const [showImportHaravan, setShowImportHaravan] = useState(false);
  const [filterSource, setFilterSource] = useState("");
  const [filterShop, setFilterShop] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [sources, setSources] = useState([]);
  const [shops, setShops] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  async function reload(sku = filterSku) {
    try { setOrders(await ordersService.listOrders(sku ? { sku } : {})); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => {
    reload();
    orderSourcesService.listOrderSources().then(setSources).catch(() => {});
    shopsService.listShops().then(setShops).catch(() => {});
    bankService.listBankAccounts().then(setBankAccounts).catch(() => {});
  }, []);

  // Lọc theo SKU gọi lại API (backend tìm trong order_items) — debounce nhẹ để tránh gọi liên tục khi gõ.
  useEffect(() => {
    const t = setTimeout(() => reload(filterSku), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSku]);

  const filteredOrders = orders.filter((o) => {
    const d = o.created_at?.slice(0, 10);
    return (!filterSource || o.order_source === filterSource) &&
      (!filterShop || o.shop_id === filterShop) &&
      (!filterFrom || d >= filterFrom) &&
      (!filterTo || d <= filterTo);
  });

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const completableIds = filteredOrders
    .filter((o) => o.status !== "Hoàn thành" && o.status !== "Đã huỷ")
    .map((o) => o.id);
  const payableOrders = filteredOrders.filter((o) => Number(o.paid) < Number(o.total));

  function toggleSelectAll() {
    const ids = filteredOrders.map((o) => o.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(ids));
  }

  async function bulkComplete() {
    const ids = completableIds.filter((id) => selected.has(id));
    if (ids.length === 0) return;
    if (!confirm(`Xác nhận chuyển ${ids.length} đơn đã chọn sang "Hoàn thành"?`)) return;
    setBulkBusy(true);
    try {
      for (const id of ids) await ordersService.setOrderStatus(id, "Hoàn thành");
      setSelected(new Set());
      reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkCollect() {
    const list = payableOrders.filter((o) => selected.has(o.id));
    if (list.length === 0) return;
    const total = list.reduce((s, o) => s + (Number(o.total) - Number(o.paid)), 0);
    if (!confirm(`Xác nhận thu ${fmt(total)} cho ${list.length} đơn đã chọn?`)) return;
    setBulkBusy(true);
    try {
      for (const o of list) {
        await ordersService.addOrderPayment(o.id, {
          type: "Thu", amount: Number(o.total) - Number(o.paid), method: "Tiền mặt",
          note: `Thu tiền hàng loạt đơn ${o.code}`,
        });
      }
      setSelected(new Set());
      reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function changeStatus(id, status, reason) {
    try {
      await ordersService.setOrderStatus(id, status, reason); // backend tự trừ/hoàn tồn
      reload();
    } catch (e) {
      alert(e.message); // vd: "Không đủ tồn..." hoặc 403 nếu thiếu quyền orders_edit
    }
  }

  function cancelOrder(o) {
    const reason = prompt("Lý do huỷ đơn:");
    if (reason === null) return; // bấm Cancel trên prompt
    changeStatus(o.id, "Đã huỷ", reason);
  }

  function returnOrder(o) {
    const reason = prompt("Lý do trả hàng (sẽ cộng lại tồn kho):");
    if (reason === null) return;
    changeStatus(o.id, "Đã huỷ", reason);
  }

  async function removeOrder(id) {
    if (!confirm("Xoá vĩnh viễn đơn hàng này? Chỉ Admin được phép và không thể hoàn tác.")) return;
    try { await ordersService.deleteOrder(id); reload(); }
    catch (e) { alert(e.message); }
  }

  async function printInvoice(id) {
    const html = await ordersService.getInvoiceHtml(id); // HTML đã escape ở backend
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print(); // mở luôn hộp thoại in của máy (trình duyệt người dùng) thay vì chỉ hiện trang xem trước
  }

  async function downloadInvoicePdf(id) {
    try { await ordersService.downloadInvoicePdf(id); }
    catch (e) { alert(e.message); }
  }

  function exportOrders() {
    exportCsv("don_hang.csv", [
      { key: "code", label: "Mã đơn" },
      { key: "customer_name", label: "Khách hàng" },
      { key: "order_source", label: "Nguồn đơn" },
      { key: (o) => (o.is_ecommerce ? "TMĐT" : ""), label: "TMĐT" },
      { key: "shop_name", label: "Shop" },
      { key: "external_order_code", label: "Mã đơn sàn" },
      { key: "status", label: "Trạng thái" },
      { key: (o) => fmtDate(o.created_at), label: "Ngày tạo" },
      { key: "total", label: "Tổng tiền" },
      { key: "paid", label: "Đã thu" },
      { key: (o) => Number(o.total) - Number(o.paid), label: "Còn lại" },
      { key: "payment", label: "Thanh toán" },
      { key: "carrier", label: "ĐVVC" },
      { key: "tracking_no", label: "Mã vận đơn" },
      { key: "delivery_status", label: "Trạng thái giao" },
      { key: "vat_invoice_status", label: "Trạng thái VAT" },
      { key: "vat_invoice_no", label: "Số HĐ VAT" },
      { key: "cancel_reason", label: "Lý do huỷ" },
      { key: "note", label: "Ghi chú" },
    ], filteredOrders);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Đơn hàng</h2>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <button onClick={exportOrders} className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl">
            Xuất CSV
          </button>
          {can("orders_edit") && (
            <>
              <button onClick={() => setShowImportHaravan(true)}
                className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl">
                Nhập Haravan
              </button>
              <button onClick={() => setShowCreateEcommerce(true)}
                className="border border-teal-600 text-teal-600 text-sm font-medium px-4 py-2 rounded-xl">
                + Tạo đơn TMĐT
              </button>
              <button onClick={() => setShowCreate(true)}
                className="col-span-2 sm:col-span-1 bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl">
                + Tạo đơn hàng
              </button>
            </>
          )}
        </div>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex gap-3 items-end flex-wrap">
        <div className="flex-1 min-w-[140px] sm:flex-none">
          <label className="text-xs text-slate-500 block mb-1">Nguồn đơn</label>
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}
            className="w-full sm:w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Tất cả</option>
            {sources.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[140px] sm:flex-none">
          <label className="text-xs text-slate-500 block mb-1">Shop TMĐT</label>
          <select value={filterShop} onChange={(e) => setFilterShop(e.target.value)}
            className="w-full sm:w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Tất cả</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[140px] sm:flex-none">
          <label className="text-xs text-slate-500 block mb-1">SKU sản phẩm</label>
          <input value={filterSku} onChange={(e) => setFilterSku(e.target.value)} placeholder="VD: SP-000001"
            className="w-full sm:w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex-1 min-w-[140px] sm:flex-none">
          <label className="text-xs text-slate-500 block mb-1">Từ ngày</label>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
            className="w-full sm:w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex-1 min-w-[140px] sm:flex-none">
          <label className="text-xs text-slate-500 block mb-1">Đến ngày</label>
          <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
            className="w-full sm:w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      {showCreate && (
        <OrderFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); reload(); }}
        />
      )}
      {showCreateEcommerce && (
        <OrderFormModal
          ecommerce
          onClose={() => setShowCreateEcommerce(false)}
          onSaved={() => { setShowCreateEcommerce(false); reload(); }}
        />
      )}
      {showImportHaravan && (
        <HaravanImportModal onClose={() => setShowImportHaravan(false)} onDone={() => reload()} />
      )}
      {editingOrder && (
        <OrderFormModal
          order={editingOrder}
          ecommerce={!!editingOrder.is_ecommerce}
          onClose={() => setEditingOrder(null)}
          onSaved={() => { setEditingOrder(null); reload(); }}
        />
      )}
      {payingOrder && (
        <PaymentModal order={payingOrder} bankAccounts={bankAccounts} onClose={() => setPayingOrder(null)} onSaved={() => { setPayingOrder(null); reload(); }} />
      )}
      {viewingOrder && (
        <OrderDetailModal order={viewingOrder} onClose={() => setViewingOrder(null)} />
      )}

      {can("orders_edit") && filteredOrders.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox"
              checked={filteredOrders.length > 0 && filteredOrders.every((o) => selected.has(o.id))}
              onChange={toggleSelectAll} />
            Chọn tất cả ({selected.size})
          </label>
          {selected.size > 0 && (
            <>
              <button onClick={bulkComplete} disabled={bulkBusy}
                className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                Hoàn thành các đơn đã chọn
              </button>
              {can("finance_edit") && (
                <button onClick={bulkCollect} disabled={bulkBusy}
                  className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                  Thu tiền các đơn đã chọn
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Bảng — chỉ hiện từ md trở lên. Dưới md dùng dạng card (xem bên dưới) cho dễ đọc trên điện thoại. */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs border-b border-slate-100">
              {can("orders_edit") && <th className="py-2 px-3 w-8"></th>}
              <th className="py-2 px-3">Mã đơn</th>
              <th className="py-2 px-3">Khách hàng / Nguồn</th>
              <th className="py-2 px-3">Ngày tạo</th>
              <th className="py-2 px-3 text-right">Tổng tiền</th>
              <th className="py-2 px-3 text-right">Đã thu</th>
              <th className="py-2 px-3 text-right">Còn lại</th>
              <th className="py-2 px-3">Trạng thái</th>
              <th className="py-2 px-3">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredOrders.map((o) => {
              const remaining = Number(o.total) - Number(o.paid);
              const overdueDays = o.customer_payment_term_days != null
                ? Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000) - o.customer_payment_term_days
                : -1;
              return (
                <tr key={o.id} className="align-top">
                  {can("orders_edit") && (
                    <td className="py-3 px-3">
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
                    </td>
                  )}
                  <td className="py-3 px-3 font-bold text-slate-800 whitespace-nowrap">
                    {o.code}
                    {o.cancel_reason && <div className="text-xs font-normal text-red-400 mt-0.5">Lý do: {o.cancel_reason}</div>}
                  </td>
                  <td className="py-3 px-3 text-xs text-slate-500">
                    {o.is_ecommerce
                      ? <span className="text-purple-600">TMĐT · {o.shop_name || "—"}{o.external_order_code ? ` · ${o.external_order_code}` : ""}</span>
                      : <span>{o.customer_name || "Khách lẻ"}</span>}
                    {o.order_source && <div>Nguồn: {o.order_source}</div>}
                    {remaining > 0 && overdueDays > 0 && (
                      <div className="text-red-600 font-semibold">⚠ Quá hạn {overdueDays} ngày</div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(o.created_at)}</td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">{fmt(o.total)}</td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">{fmt(o.paid)}</td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    {remaining > 0 ? <span className="text-red-500 font-medium">{fmt(remaining)}</span> : "—"}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex flex-col gap-1 items-start">
                      <Badge label={o.status} colorClass={STATUS_COLOR[o.status]} />
                      {o.is_preorder && o.status === "Chờ xác nhận" && (
                        <Badge label="Đặt hàng (thiếu tồn)" colorClass="bg-purple-100 text-purple-700" />
                      )}
                      {o.requires_vat && (
                        <Badge label={`VAT: ${o.vat_invoice_status || "Chưa xuất"}`} colorClass={VAT_COLOR[o.vat_invoice_status] || VAT_COLOR["Chưa xuất"]} />
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 max-w-[220px]">
                      <button onClick={() => setViewingOrder(o)} className="text-xs text-teal-600 hover:underline font-medium">Chi tiết</button>
                      <button onClick={() => printInvoice(o.id)} className="text-xs text-slate-600 hover:underline">In đơn</button>
                      <button onClick={() => downloadInvoicePdf(o.id)} className="text-xs text-slate-600 hover:underline">Tải PDF</button>
                      {can("finance_edit") && (
                        <button onClick={() => setPayingOrder(o)} className="text-xs text-slate-600 hover:underline">Thu/Chi</button>
                      )}
                      {can("orders_edit") && o.status === "Chờ xác nhận" && (
                        <button onClick={() => setEditingOrder(o)} className="text-xs text-slate-600 hover:underline">Sửa đơn</button>
                      )}
                      {can("orders_edit") && o.status !== "Hoàn thành" && o.status !== "Đã huỷ" && (
                        <button onClick={() => changeStatus(o.id, "Hoàn thành")}
                          className="text-xs bg-emerald-600 text-white px-2 py-1 rounded-lg">Hoàn thành</button>
                      )}
                      {can("orders_edit") && o.status !== "Đã huỷ" && o.status !== "Hoàn thành" && (
                        <button onClick={() => cancelOrder(o)} className="text-xs text-red-500 hover:underline">Huỷ đơn</button>
                      )}
                      {can("orders_edit") && o.status === "Hoàn thành" && (
                        <button onClick={() => returnOrder(o)} className="text-xs text-red-500 hover:underline">Trả hàng</button>
                      )}
                      {user?.role === "Admin" && can("orders_delete") && (
                        <button onClick={() => removeOrder(o.id)} className="text-xs text-red-700 hover:underline">Xoá</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredOrders.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có đơn hàng.</p>}
      </div>

      {/* Card — chỉ hiện dưới md (điện thoại/tablet hẹp), thay cho bảng. */}
      <div className="md:hidden space-y-2">
        {filteredOrders.map((o) => {
          const remaining = Number(o.total) - Number(o.paid);
          const overdueDays = o.customer_payment_term_days != null
            ? Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000) - o.customer_payment_term_days
            : -1;
          return (
            <div key={o.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-start gap-2">
                  {can("orders_edit") && (
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} className="mt-1.5" />
                  )}
                  <div>
                    <div className="font-bold text-slate-800">{o.code}</div>
                    <div className="text-xs text-slate-500">
                      {o.is_ecommerce
                        ? <span className="text-purple-600">TMĐT · {o.shop_name || "—"}{o.external_order_code ? ` · ${o.external_order_code}` : ""}</span>
                        : <span>{o.customer_name || "Khách lẻ"}</span>}
                    </div>
                    <div className="text-xs text-slate-400">{fmtDate(o.created_at)}</div>
                  </div>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <Badge label={o.status} colorClass={STATUS_COLOR[o.status]} />
                  {o.requires_vat && (
                    <Badge label={`VAT: ${o.vat_invoice_status || "Chưa xuất"}`} colorClass={VAT_COLOR[o.vat_invoice_status] || VAT_COLOR["Chưa xuất"]} />
                  )}
                </div>
              </div>

              {o.order_source && <div className="text-xs text-slate-500 mb-1">Nguồn: {o.order_source}</div>}
              {o.cancel_reason && <div className="text-xs text-red-400 mb-1">Lý do huỷ: {o.cancel_reason}</div>}
              {remaining > 0 && overdueDays > 0 && (
                <div className="text-xs text-red-600 font-semibold mb-1">⚠ Quá hạn {overdueDays} ngày</div>
              )}
              {o.is_preorder && o.status === "Chờ xác nhận" && (
                <Badge label="Đặt hàng (thiếu tồn)" colorClass="bg-purple-100 text-purple-700" />
              )}

              <div className="grid grid-cols-3 gap-2 text-sm border-t border-slate-100 mt-2 pt-2">
                <div>
                  <div className="text-xs text-slate-400">Tổng tiền</div>
                  <div className="font-medium">{fmt(o.total)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Đã thu</div>
                  <div className="font-medium">{fmt(o.paid)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Còn lại</div>
                  <div className={`font-medium ${remaining > 0 ? "text-red-500" : ""}`}>{remaining > 0 ? fmt(remaining) : "—"}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 pt-2 border-t border-slate-100">
                <button onClick={() => setViewingOrder(o)} className="text-xs text-teal-600 font-medium">Chi tiết</button>
                <button onClick={() => printInvoice(o.id)} className="text-xs text-slate-600">In đơn</button>
                <button onClick={() => downloadInvoicePdf(o.id)} className="text-xs text-slate-600">Tải PDF</button>
                {can("finance_edit") && (
                  <button onClick={() => setPayingOrder(o)} className="text-xs text-slate-600">Thu/Chi</button>
                )}
                {can("orders_edit") && o.status === "Chờ xác nhận" && (
                  <button onClick={() => setEditingOrder(o)} className="text-xs text-slate-600">Sửa đơn</button>
                )}
                {can("orders_edit") && o.status !== "Hoàn thành" && o.status !== "Đã huỷ" && (
                  <button onClick={() => changeStatus(o.id, "Hoàn thành")}
                    className="text-xs bg-emerald-600 text-white px-2 py-1 rounded-lg">Hoàn thành</button>
                )}
                {can("orders_edit") && o.status !== "Đã huỷ" && o.status !== "Hoàn thành" && (
                  <button onClick={() => cancelOrder(o)} className="text-xs text-red-500">Huỷ đơn</button>
                )}
                {can("orders_edit") && o.status === "Hoàn thành" && (
                  <button onClick={() => returnOrder(o)} className="text-xs text-red-500">Trả hàng</button>
                )}
                {user?.role === "Admin" && can("orders_delete") && (
                  <button onClick={() => removeOrder(o.id)} className="text-xs text-red-700">Xoá</button>
                )}
              </div>
            </div>
          );
        })}
        {filteredOrders.length === 0 && (
          <p className="text-slate-400 text-sm bg-white rounded-2xl p-6 text-center border border-slate-100">Chưa có đơn hàng.</p>
        )}
      </div>
    </div>
  );
}

// Xem chi tiết đầy đủ 1 đơn: danh sách sản phẩm, vận chuyển, VAT, thanh toán.
function OrderDetailModal({ order: orderSummary, onClose }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    ordersService.getOrder(orderSummary.id).then(setOrder).catch((e) => setError(e.message));
  }, [orderSummary.id]);

  return (
    <Modal title={`Chi tiết đơn ${orderSummary.code}`} onClose={onClose} wide>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      {!order ? (
        <p className="text-slate-400 text-sm">Đang tải…</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-slate-400">Trạng thái:</span> <Badge label={order.status} colorClass={STATUS_COLOR[order.status]} /></div>
            <div><span className="text-slate-400">Ngày tạo:</span> {fmtDate(order.created_at)}</div>
            {order.is_ecommerce ? (
              <div><span className="text-slate-400">Shop / Mã đơn sàn:</span> {order.shop_name || "—"} {order.external_order_code ? `· ${order.external_order_code}` : ""}</div>
            ) : (
              <div><span className="text-slate-400">Khách hàng:</span> {order.customer_name || "Khách lẻ"} {order.customer_phone ? `· ${order.customer_phone}` : ""}</div>
            )}
            <div><span className="text-slate-400">Kho xuất:</span> {order.warehouse_name ? `${order.warehouse_name} (${order.warehouse_code})` : "—"}</div>
            <div><span className="text-slate-400">Số phiếu xuất:</span> {order.sale_doc_no || "—"}</div>
            <div><span className="text-slate-400">Nguồn đơn:</span> {order.order_source || "—"}</div>
            <div><span className="text-slate-400">Phương thức TT:</span> {order.payment || "—"}</div>
            <div><span className="text-slate-400">ĐVVC:</span> {order.carrier || "—"} {order.tracking_no ? `· ${order.tracking_no}` : ""}</div>
            <div><span className="text-slate-400">Người tạo:</span> {order.created_by_name || "—"}</div>
          </div>

          <div>
            <div className="font-semibold text-slate-700 mb-1">Sản phẩm</div>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {order.items?.map((it) => (
                <div key={it.id} className="flex justify-between px-3 py-2">
                  <span>{it.name} × {it.qty} <span className="text-slate-400">(giá {fmt(it.price_at_sale)}, vốn {fmt(it.cost_at_sale)})</span></span>
                  <span className="font-medium">{fmt(it.price_at_sale * it.qty)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 border-t border-slate-100 pt-3">
            <div className="text-slate-400">Tạm tính</div><div className="text-right">{fmt(order.subtotal)}</div>
            <div className="text-slate-400">Giảm giá</div><div className="text-right">-{fmt(order.discount)}</div>
            <div className="text-slate-400">Phí ship</div><div className="text-right">{fmt(order.shipping)}</div>
            <div className="font-semibold">Tổng cộng</div><div className="text-right font-semibold">{fmt(order.total)}</div>
            <div className="text-slate-400">Đã thu</div><div className="text-right">{fmt(order.paid)}</div>
            <div className="text-red-500">Còn lại</div><div className="text-right text-red-500">{fmt(order.total - order.paid)}</div>
          </div>

          {order.requires_vat && (
            <div className="border-t border-slate-100 pt-3">
              <span className="text-slate-400">VAT:</span> {order.vat_rate}% ({fmt(order.vat_amount)}) ·
              <Badge label={order.vat_invoice_status || "Chưa xuất"} colorClass={VAT_COLOR[order.vat_invoice_status] || VAT_COLOR["Chưa xuất"]} />
              {order.vat_invoice_no && <span> · Số HĐ: {order.vat_invoice_no}</span>}
            </div>
          )}

          {order.is_cod && (
            <div className="border-t border-slate-100 pt-3">
              <span className="text-slate-400">COD:</span> {fmt(Math.max(order.total - order.paid, 0))}
              {order.cod_reconciled && <Badge label="Đã thu COD" colorClass="bg-emerald-100 text-emerald-700" />}
            </div>
          )}

          {order.cancel_reason && (
            <div className="border-t border-slate-100 pt-3 text-red-500">Lý do huỷ/trả: {order.cancel_reason}</div>
          )}

          {order.note && <div className="border-t border-slate-100 pt-3"><span className="text-slate-400">Ghi chú:</span> {order.note}</div>}
        </div>
      )}
    </Modal>
  );
}

// Form tạo/sửa đơn hàng. Khi sửa (order có id), chỉ cho sửa khách/giảm giá/ship/thanh toán/ghi chú/VAT/ĐVVC —
// KHÔNG cho đổi danh sách sản phẩm (để khỏi lệch snapshot giá/vốn đã chốt lúc tạo đơn).
function OrderFormModal({ order, onClose, onSaved, ecommerce = false }) {
  const isEdit = !!order;
  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [sources, setSources] = useState([]);
  const [shops, setShops] = useState([]);
  const [stock, setStock] = useState([]);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [customerId, setCustomerId] = useState(order?.customer_id || "");
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", email: "", address: "" });
  const [warehouseId, setWarehouseId] = useState(order?.warehouse_id || "");
  const [carrier, setCarrier] = useState(order?.carrier || "");
  const [source, setSource] = useState(order?.order_source || "");
  const [shopId, setShopId] = useState(order?.shop_id || "");
  const [externalOrderCode, setExternalOrderCode] = useState(order?.external_order_code || "");
  const [lines, setLines] = useState([{ key: "", qty: 1, price: 0 }]);
  const [discount, setDiscount] = useState(order?.discount || 0);
  const [shipping, setShipping] = useState(order?.shipping || 0);
  const [paidNow, setPaidNow] = useState(order?.paid || 0);
  const [payment, setPayment] = useState(order?.payment || "Tiền mặt");
  const requiresVat = true; // mọi đơn đều xuất hoá đơn VAT, không còn tick chọn
  const [note, setNote] = useState(order?.note || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      customersService.listCustomers(), warehousesService.listWarehouses(),
      productsService.listProducts(), carriersService.listCarriers(),
      orderSourcesService.listOrderSources(), shopsService.listShops(),
    ])
      .then(([cs, ws, ps, crs, srcs, shps]) => {
        setCustomers(cs);
        setWarehouses(ws);
        setProducts(ps);
        setCarriers(crs);
        setSources(srcs);
        setShops(shps);
        if (!isEdit && ws[0]) setWarehouseId(ws[0].id);
        if (!isEdit && ecommerce && shps[0]) setShopId(shps[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!warehouseId) return;
    stockService.listStock(warehouseId).then(setStock).catch((e) => setError(e.message));
  }, [warehouseId]);

  const stockMap = {};
  for (const s of stock) stockMap[`${s.product_id}:${s.variant_id || ""}`] = s.qty;
  const sellable = buildSellableOptions(products, stockMap);

  function setLine(idx, patch) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function onPickProduct(idx, key) {
    const opt = sellable.find((o) => o.key === key);
    setLine(idx, { key, price: opt ? opt.price : 0 });
  }
  function addLine() {
    setLines((ls) => [...ls, { key: "", qty: 1, price: 0 }]);
  }
  function removeLine(idx) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }

  const subtotal = isEdit
    ? Number(order.subtotal)
    : lines.reduce((s, l) => s + Number(l.price || 0) * Number(l.qty || 0), 0);
  // Tổng giảm theo dòng (giá gốc - giá đã sửa) × số lượng, chỉ tính khi giá sửa thấp hơn giá gốc.
  const lineDiscount = isEdit ? 0 : lines.reduce((s, l) => {
    const opt = sellable.find((o) => o.key === l.key);
    if (!opt) return s;
    const diff = (opt.price - Number(l.price || 0)) * Number(l.qty || 0);
    return s + Math.max(diff, 0);
  }, 0);
  const total = Math.max(subtotal - Number(discount || 0), 0) + Number(shipping || 0);
  const remaining = Math.max(total - Number(paidNow || 0), 0);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!warehouseId) return setError("Chọn kho xuất hàng");
    if (ecommerce && !shopId) return setError("Chọn shop bán hàng");

    setSaving(true);
    try {
      let finalCustomerId = customerId || null;
      if (!ecommerce && isNewCustomer) {
        if (!newCustomer.name.trim()) { setError("Thiếu tên khách hàng mới"); setSaving(false); return; }
        const created = await customersService.createCustomer({
          name: newCustomer.name.trim(), phone: newCustomer.phone || null,
          email: newCustomer.email || null, address: newCustomer.address || null,
        });
        finalCustomerId = created.id;
      }

      if (isEdit) {
        await ordersService.updateOrder(order.id, {
          customerId: finalCustomerId, discount: Number(discount) || 0, shipping: Number(shipping) || 0,
          payment, requiresVat, note, carrier: carrier || null, source: source || null,
        });
      } else {
        const items = lines.filter((l) => l.key && Number(l.qty) > 0).map((l) => {
          const opt = sellable.find((o) => o.key === l.key);
          return { productId: opt.productId, variantId: opt.variantId, qty: Number(l.qty), priceOverride: Number(l.price) };
        });
        if (!items.length) { setError("Thêm ít nhất 1 sản phẩm"); setSaving(false); return; }
        await ordersService.createOrder({
          customerId: ecommerce ? null : finalCustomerId, warehouseId, items,
          discount: Number(discount) || 0, shipping: Number(shipping) || 0,
          paidNow: Number(paidNow) || 0,
          payment, requiresVat, note, carrier: carrier || null, source: source || null,
          isEcommerce: ecommerce, shopId: ecommerce ? shopId : null,
          externalOrderCode: ecommerce ? externalOrderCode || null : null,
        });
      }
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? `Sửa đơn ${order.code}` : (ecommerce ? "Tạo đơn TMĐT" : "Tạo đơn hàng")} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          {ecommerce ? (
            <div>
              <label className="text-xs text-slate-500">Shop bán hàng</label>
              <select value={shopId} onChange={(e) => setShopId(e.target.value)} disabled={isEdit}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50">
                <option value="">— Chọn shop —</option>
                {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {shops.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Chưa có shop nào — vào tab "Cài đặt" để thêm.</p>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-500">Khách hàng</label>
                {!isNewCustomer ? (
                  <button type="button" onClick={() => setIsNewCustomer(true)} className="text-xs text-teal-600 hover:underline">+ Khách mới</button>
                ) : (
                  <button type="button" onClick={() => setIsNewCustomer(false)} className="text-xs text-slate-400 hover:underline">Chọn khách có sẵn</button>
                )}
              </div>
              {!isNewCustomer ? (
                <ProductPicker
                  options={[{ key: "", label: "— Khách lẻ —" }, ...customers.map((c) => ({ key: c.id, label: c.name, sku: c.phone }))]}
                  value={customerId}
                  onSelect={(o) => setCustomerId(o.key)}
                  placeholder="Tìm theo tên hoặc số điện thoại…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              ) : (
                <div className="space-y-2 border border-slate-200 rounded-lg p-2">
                  <input placeholder="Tên khách hàng" value={newCustomer.name}
                    onChange={(e) => setNewCustomer((c) => ({ ...c, name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                  <input placeholder="Số điện thoại" value={newCustomer.phone}
                    onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                  <input placeholder="Email" value={newCustomer.email}
                    onChange={(e) => setNewCustomer((c) => ({ ...c, email: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                  <input placeholder="Địa chỉ" value={newCustomer.address}
                    onChange={(e) => setNewCustomer((c) => ({ ...c, address: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              )}
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500">Kho xuất hàng</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={isEdit}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        {ecommerce && (
          <div>
            <label className="text-xs text-slate-500">Mã đơn hàng (trên sàn TMĐT)</label>
            <input value={externalOrderCode} onChange={(e) => setExternalOrderCode(e.target.value)} disabled={isEdit}
              placeholder="VD: mã đơn Shopee/Lazada/TikTok Shop"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
          </div>
        )}

        {!ecommerce && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Đơn vị vận chuyển (tuỳ chọn)</label>
            <input list="carrier-list" value={carrier} onChange={(e) => setCarrier(e.target.value)}
              placeholder="Chọn hoặc nhập tên ĐVVC"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <datalist id="carrier-list">
              {carriers.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>
          <div>
            <label className="text-xs text-slate-500">Nguồn đơn (tuỳ chọn)</label>
            <input list="source-list" value={source} onChange={(e) => setSource(e.target.value)}
              placeholder="VD: Hotline, Facebook, Tự gọi điện..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <datalist id="source-list">
              {sources.map((s) => <option key={s.id} value={s.name} />)}
            </datalist>
          </div>
        </div>
        )}

        <div className="space-y-2">
          <label className="text-xs text-slate-500">Sản phẩm</label>
          {isEdit ? (
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {order.items?.map((it) => (
                <div key={it.id} className="flex justify-between px-3 py-2 text-sm">
                  <span>{it.name} × {it.qty}</span>
                  <span className="font-medium">{fmt(it.price_at_sale * it.qty)}</span>
                </div>
              ))}
              <div className="px-3 py-1.5 text-xs text-slate-400">Không thể đổi sản phẩm sau khi tạo đơn — hãy huỷ và tạo đơn mới nếu cần.</div>
            </div>
          ) : (
            <>
              {lines.map((l, idx) => {
                const opt = sellable.find((o) => o.key === l.key);
                const notEnough = opt && Number(l.qty) > opt.stock;
                return (
                  <div key={idx}>
                    <div className="flex flex-wrap gap-2 items-center">
                      <div className="w-full sm:flex-1 sm:min-w-[160px]">
                        <ProductPicker options={sellable} value={l.key} onSelect={(o) => onPickProduct(idx, o.key)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <input type="number" min="1" value={l.qty} onChange={(e) => setLine(idx, { qty: e.target.value })}
                        className="w-16 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                      <MoneyInput value={l.price} onChange={(v) => setLine(idx, { price: v })}
                        title="Giá bán (có thể sửa)"
                        className="w-24 sm:w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm text-right" />
                      <span className="w-24 sm:w-28 text-right text-sm text-slate-500">{opt ? fmt(Number(l.price || 0) * (Number(l.qty) || 0)) : "—"}</span>
                      <button type="button" onClick={() => removeLine(idx)} className="text-red-500 px-2 text-sm">✕</button>
                    </div>
                    {opt && (
                      <p className={`text-xs mt-0.5 ${notEnough ? "text-purple-600" : "text-slate-400"}`}>
                        Tồn tại kho: {opt.stock}{notEnough ? " — không đủ, đơn sẽ là phiếu đặt hàng" : ""}
                      </p>
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={addLine} className="text-teal-600 text-sm font-medium">+ Thêm dòng</button>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-500">Khuyến mãi toàn đơn (giảm thêm)</label>
            <input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            {!isEdit && lineDiscount > 0 && (
              <p className="text-xs text-teal-600 mt-1">+ Đã giảm theo giá sản phẩm: {fmt(lineDiscount)}</p>
            )}
            {!isEdit && (
              <p className="text-xs text-slate-400 mt-1">Tổng giảm: {fmt(lineDiscount + (Number(discount) || 0))}</p>
            )}
          </div>
          <div>
            <label className="text-xs text-slate-500">Phí ship (thu khách)</label>
            <input type="number" min="0" value={shipping} onChange={(e) => setShipping(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Thanh toán</label>
            <select value={payment} onChange={(e) => setPayment(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option>Tiền mặt</option>
              <option>Ngân hàng</option>
              <option>Thẻ</option>
              <option>COD</option>
            </select>
          </div>
        </div>

        <p className="text-xs text-slate-400">Mọi đơn đều tự xuất hoá đơn VAT (giá bán đã gồm VAT) — theo dõi tiếp ở tab "Hoá đơn VAT".</p>

        <div>
          <label className="text-xs text-slate-500">Ghi chú đơn hàng</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>

        {!isEdit && (
          <div>
            <label className="text-xs text-slate-500">Khách thanh toán trước (cọc)</label>
            <MoneyInput value={paidNow} onChange={setPaidNow}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="text-sm text-slate-500">
            Tổng: <span className="font-bold text-slate-800">{fmt(total)}</span>
            {!isEdit && Number(paidNow) > 0 && (
              <span> · Còn lại: <span className="font-bold text-red-500">{fmt(remaining)}</span></span>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
            <button type="submit" disabled={saving}
              className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
              {saving ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Tạo đơn"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// Tạo phiếu Thu/Chi gắn với 1 đơn hàng. Thu sẽ tự cộng vào "đã thu" của đơn (giới hạn theo tổng tiền).
// Nhập hàng loạt đơn lịch sử từ file CSV xuất ra của Haravan — chỉ để lưu lại theo dõi doanh thu/
// lịch sử bán hàng, KHÔNG trừ tồn kho ERP. Gom các dòng cùng "Mã đơn hàng" thành 1 đơn nhiều sản phẩm,
// gửi lên backend theo từng lô (tránh 1 request quá lớn/quá lâu khi file có hàng nghìn đơn).
const HARAVAN_BATCH_SIZE = 200;

function groupHaravanRows(rows) {
  const groups = new Map();
  for (const r of rows) {
    const rawCode = (r["Mã đơn hàng"] || "").trim();
    if (!rawCode) continue;
    if (!groups.has(rawCode)) {
      groups.set(rawCode, {
        externalCode: rawCode.replace(/^#/, ""),
        customerName: r["Tên người nhận"] || r["Tên người thanh toán"] || "",
        phone: (r["Số điện thoại"] || r["Số điện thoại thanh toán"] || "").trim(),
        address: r["Địa chỉ nhận hàng"] || "",
        paymentMethod: r["Phương thức thanh toán"] || "",
        createdAt: r["Ngày đặt hàng"] || "",
        items: [],
      });
    }
    const g = groups.get(rawCode);
    const sku = (r["Mã sản phẩm"] || "").trim();
    const qty = Number(r["Số lượng sản phẩm"]) || 0;
    const price = Number(r["Giá sản phẩm"]) || 0;
    if (!sku || qty <= 0) continue;
    const attr = r["Giá trị thuộc tính 1"] ? ` (${r["Giá trị thuộc tính 1"]})` : "";
    g.items.push({ sku, qty, price, name: `${r["Tên sản phẩm"] || sku}${attr}` });
  }
  return Array.from(groups.values());
}

function HaravanImportModal({ onClose, onDone }) {
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    warehousesService.listWarehouses().then((ws) => { setWarehouses(ws); if (ws[0]) setWarehouseId(ws[0].id); }).catch((e) => setError(e.message));
  }, []);

  async function run() {
    if (!file) return setError("Chọn file CSV xuất từ Haravan");
    if (!warehouseId) return setError("Chọn kho");
    setError(""); setResult(null); setBusy(true);
    try {
      const rows = await readCsvFile(file);
      const orders = groupHaravanRows(rows);
      if (!orders.length) { setError("Không đọc được đơn nào từ file — kiểm tra lại cột \"Mã đơn hàng\"."); setBusy(false); return; }

      const agg = { ordersImported: 0, ordersSkipped: 0, ordersDuplicate: 0, linesSkipped: 0, productsCreated: 0, customersCreated: 0, errors: [] };
      for (let i = 0; i < orders.length; i += HARAVAN_BATCH_SIZE) {
        const batch = orders.slice(i, i + HARAVAN_BATCH_SIZE);
        setProgress(`Đang nhập ${Math.min(i + HARAVAN_BATCH_SIZE, orders.length)}/${orders.length} đơn…`);
        const res = await ordersService.importHaravanOrders({ warehouseId, orders: batch });
        agg.ordersImported += res.ordersImported;
        agg.ordersSkipped += res.ordersSkipped;
        agg.ordersDuplicate += res.ordersDuplicate || 0;
        agg.linesSkipped += res.linesSkipped;
        agg.productsCreated += res.productsCreated;
        agg.customersCreated += res.customersCreated;
        agg.errors.push(...res.errors);
      }
      setResult(agg);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <Modal title="Nhập đơn từ Haravan (CSV)" onClose={onClose} wide>
      <div className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <p className="text-xs text-slate-500">
          Đơn nhập từ Haravan chỉ để lưu lại theo dõi doanh thu/lịch sử bán hàng — <b>không trừ tồn kho</b> ERP.
          Sản phẩm khớp theo Mã sản phẩm (SKU); SKU chưa có trong ERP sẽ tự tạo sản phẩm mới (giá vốn = 0, sửa lại sau).
        </p>
        <div>
          <label className="text-xs text-slate-500">Kho (chỉ để ghi nhận, không trừ tồn)</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={busy}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">File CSV xuất từ Haravan</label>
          <input type="file" accept=".csv" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        {progress && <p className="text-sm text-teal-600">{progress}</p>}
        {result && (
          <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg px-3 py-2 space-y-1">
            <div>Đã nhập {result.ordersImported} đơn. Bỏ qua {result.ordersSkipped} đơn (không có dòng nào khớp được).</div>
            {result.ordersDuplicate > 0 && (
              <div>Bỏ qua {result.ordersDuplicate} đơn đã nhập trước đó (trùng mã đơn Haravan).</div>
            )}
            <div>Bỏ qua {result.linesSkipped} dòng sản phẩm thiếu SKU/số lượng. Tự tạo {result.productsCreated} sản phẩm mới, {result.customersCreated} khách hàng mới.</div>
            {result.errors.length > 0 && (
              <div className="text-amber-700">{result.errors.length} đơn lỗi: {result.errors.slice(0, 5).map((e) => `${e.externalCode} (${e.error})`).join("; ")}{result.errors.length > 5 ? "…" : ""}</div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">{result ? "Đóng" : "Hủy"}</button>
          <button type="button" onClick={run} disabled={busy || !file}
            className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {busy ? "Đang nhập…" : "Nhập"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PaymentModal({ order, bankAccounts, onClose, onSaved }) {
  const [type, setType] = useState("Thu");
  const [amount, setAmount] = useState(Math.max(Number(order.total) - Number(order.paid), 0));
  const [method, setMethod] = useState("Tiền mặt");
  const [bankAccountId, setBankAccountId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!amount || Number(amount) <= 0) return setError("Số tiền không hợp lệ");
    if (method === "Ngân hàng" && !bankAccountId) return setError("Chọn tài khoản ngân hàng");
    setSaving(true);
    try {
      await ordersService.addOrderPayment(order.id, { type, amount: Number(amount), method, bankAccountId: method === "Ngân hàng" ? bankAccountId : null, note });
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Phiếu thu/chi — ${order.code}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="text-xs text-slate-500">
          Tổng đơn {fmt(order.total)} · Đã thu {fmt(order.paid)} · Còn lại {fmt(order.total - order.paid)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Loại phiếu</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="Thu">Thu tiền khách</option>
              <option value="Chi">Chi (hoàn tiền/khác)</option>
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
              {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-slate-500">Số tiền</label>
          <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
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
