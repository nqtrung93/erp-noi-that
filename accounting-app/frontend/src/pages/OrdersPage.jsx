import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as ordersService from "../services/orders.service.js";
import * as inventoryService from "../services/inventory.service.js";
import * as partnersService from "../services/partners.service.js";
import { fmt } from "../utils/format.js";
import Modal from "../components/Modal.jsx";
import Toolbar, { ToolbarButton } from "../components/Toolbar.jsx";

const STATUS_COLOR = {
  "Mới": "bg-amber-100 text-amber-700",
  "Hoàn thành": "bg-emerald-100 text-emerald-700",
  "Đã hủy": "bg-red-100 text-red-700",
};

export default function OrdersPage() {
  const { can } = useAuth();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

  async function reload() {
    try { setOrders(await ordersService.listOrders()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => {
    reload();
    inventoryService.listProducts().then(setProducts).catch(() => {});
    inventoryService.listWarehouses().then(setWarehouses).catch(() => {});
    partnersService.listPartners().then((ps) => setCustomers(ps.filter((p) => p.type === "customer"))).catch(() => {});
  }, []);

  const filtered = orders.filter((o) => !statusFilter || o.status === statusFilter);

  async function setStatus(id, status) {
    if (status === "Đã hủy" && !confirm("Hủy đơn này? Hàng sẽ được hoàn lại kho.")) return;
    try { await ordersService.changeOrderStatus(id, status); reload(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="space-y-3">
      <Toolbar
        title="Bán hàng — Đơn hàng"
        filters={
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
            <option value="">— Trạng thái —</option>
            <option>Mới</option>
            <option>Hoàn thành</option>
            <option>Đã hủy</option>
          </select>
        }
        actions={can("orders_edit") && (
          <ToolbarButton variant="primary" onClick={() => setCreating(true)}>+ Tạo đơn hàng</ToolbarButton>
        )}
      />
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-400 text-xs">
            <th className="py-2 px-3">Mã đơn</th><th className="py-2 px-3">Khách hàng</th><th className="py-2 px-3 text-right">Tổng tiền</th>
            <th className="py-2 px-3 text-right">Đã thu</th><th className="py-2 px-3 text-right">Còn lại</th>
            <th className="py-2 px-3">Trạng thái</th><th className="py-2 px-3">Ngày</th><th className="py-2 px-3"></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((o) => {
              const remaining = Number(o.total) - Number(o.paid);
              return (
                <tr key={o.id}>
                  <td className="py-2 px-3 font-medium">{o.code}</td>
                  <td className="py-2 px-3">{o.customer_name || "Khách lẻ"}</td>
                  <td className="py-2 px-3 text-right font-medium">{fmt(o.total)}</td>
                  <td className="py-2 px-3 text-right text-emerald-600">{fmt(o.paid)}</td>
                  <td className="py-2 px-3 text-right text-red-500">{fmt(remaining)}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status]}`}>{o.status}</span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap text-slate-400">{new Date(o.created_at).toLocaleDateString("vi-VN")}</td>
                  <td className="py-2 px-3">
                    <div className="flex gap-2 justify-end text-xs">
                      <button onClick={() => ordersService.openInvoice(o.id)} className="text-indigo-600 hover:underline">In</button>
                      {can("orders_edit") && o.status === "Mới" && remaining > 0 && (
                        <button onClick={() => setPaying(o)} className="text-emerald-600 hover:underline">Thu tiền</button>
                      )}
                      {can("orders_edit") && o.status === "Mới" && (
                        <>
                          <button onClick={() => setStatus(o.id, "Hoàn thành")} className="text-slate-500 hover:underline">Hoàn thành</button>
                          <button onClick={() => setStatus(o.id, "Đã hủy")} className="text-red-500 hover:underline">Hủy</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có đơn hàng nào.</p>}
      </div>

      {creating && (
        <CreateOrderModal products={products} warehouses={warehouses} customers={customers}
          onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />
      )}
      {paying && (
        <PayOrderModal order={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); reload(); }} />
      )}
    </div>
  );
}

function CreateOrderModal({ products, warehouses, customers, onClose, onSaved }) {
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const [items, setItems] = useState([{ productId: "", variantId: "", qty: 1, price: 0 }]);
  const [discount, setDiscount] = useState("");
  const [paidNow, setPaidNow] = useState("");
  const [method, setMethod] = useState("Tiền mặt");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const total = Math.max(subtotal - (Number(discount) || 0), 0);

  function updateItem(idx, field, value) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: value };
      if (field === "productId") {
        const p = products.find((pp) => String(pp.id) === String(value));
        next.variantId = "";
        if (p && !p.has_variants) next.price = p.price || 0;
      }
      if (field === "variantId") {
        const p = products.find((pp) => String(pp.id) === String(it.productId));
        const v = p?.variants?.find((vv) => String(vv.id) === String(value));
        if (v) next.price = v.price || 0;
      }
      return next;
    }));
  }
  function addLine() { setItems((prev) => [...prev, { productId: "", variantId: "", qty: 1, price: 0 }]); }
  function removeLine(idx) { setItems((prev) => prev.filter((_, i) => i !== idx)); }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!warehouseId) return setError("Thiếu kho xuất hàng");
    if (items.some((it) => !it.productId || !it.qty)) return setError("Vui lòng chọn sản phẩm và số lượng cho mọi dòng");
    if (items.some((it) => products.find((p) => String(p.id) === String(it.productId))?.has_variants && !it.variantId)) {
      return setError("Vui lòng chọn biến thể cho các sản phẩm có biến thể");
    }
    setSaving(true);
    try {
      await ordersService.createOrder({
        customerId: customerId || null, warehouseId,
        items: items.map((it) => ({ productId: it.productId, variantId: it.variantId || null, qty: Number(it.qty), price: Number(it.price) })),
        discount: Number(discount) || 0, paidNow: Number(paidNow) || 0, method, note: note || null,
      });
      onSaved();
    } catch (e2) { setError(e2.message); } finally { setSaving(false); }
  }

  return (
    <Modal title="Tạo đơn hàng" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-500">Khách hàng</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">— Khách lẻ —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div><label className="text-xs text-slate-500">Kho xuất</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select></div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-500">Sản phẩm</label>
          {items.map((it, idx) => {
            const product = products.find((p) => String(p.id) === String(it.productId));
            return (
              <div key={idx} className="flex gap-2 items-center flex-wrap">
                <select value={it.productId} onChange={(e) => updateItem(idx, "productId", e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm min-w-[140px]">
                  <option value="">— Chọn sản phẩm —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {product?.has_variants && (
                  <select value={it.variantId} onChange={(e) => updateItem(idx, "variantId", e.target.value)}
                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm min-w-[120px]">
                    <option value="">— Biến thể —</option>
                    {product.variants.map((v) => (
                      <option key={v.id} value={v.id}>{Object.values(v.attrs || {}).join(" / ")}</option>
                    ))}
                  </select>
                )}
                <input type="number" min="0" value={it.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)}
                  placeholder="SL" className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                <input type="number" min="0" value={it.price} onChange={(e) => updateItem(idx, "price", e.target.value)}
                  placeholder="Giá" className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                {items.length > 1 && (
                  <button type="button" onClick={() => removeLine(idx)} className="text-red-500 text-xs">Xoá</button>
                )}
              </div>
            );
          })}
          <button type="button" onClick={addLine} className="text-indigo-600 text-xs font-medium">+ Thêm dòng</button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div><label className="text-xs text-slate-500">Giảm giá</label>
            <input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="text-xs text-slate-500">Thanh toán ngay</label>
            <input type="number" min="0" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="text-xs text-slate-500">Phương thức</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option>Tiền mặt</option><option>Chuyển khoản</option>
            </select></div>
        </div>

        <div className="text-sm text-right space-y-0.5 border-t border-slate-100 pt-2">
          <div>Tạm tính: <span className="font-medium">{fmt(subtotal)}</span></div>
          <div className="font-semibold">Tổng cộng: {fmt(total)}</div>
        </div>

        <div><label className="text-xs text-slate-500">Ghi chú</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">{saving ? "Đang lưu…" : "Tạo đơn"}</button>
        </div>
      </form>
    </Modal>
  );
}

function PayOrderModal({ order, onClose, onSaved }) {
  const remaining = Number(order.total) - Number(order.paid);
  const [amount, setAmount] = useState(remaining);
  const [method, setMethod] = useState("Tiền mặt");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return setError("Số tiền không hợp lệ");
    setSaving(true);
    try {
      await ordersService.addOrderPayment(order.id, { amount: Number(amount), method });
      onSaved();
    } catch (e2) { setError(e2.message); } finally { setSaving(false); }
  }

  return (
    <Modal title={`Thu tiền — ${order.code}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="text-sm text-slate-500">Còn lại: <span className="font-semibold text-slate-800">{fmt(remaining)}</span></div>
        <div><label className="text-xs text-slate-500">Số tiền thu</label>
          <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Phương thức</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option>Tiền mặt</option><option>Chuyển khoản</option>
          </select></div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">{saving ? "Đang lưu…" : "Xác nhận"}</button>
        </div>
      </form>
    </Modal>
  );
}
