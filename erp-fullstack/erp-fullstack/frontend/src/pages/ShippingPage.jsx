import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as ordersService from "../services/orders.service.js";
import * as carriersService from "../services/carriers.service.js";
import { fmt } from "../utils/format.js";
import Badge from "../components/Badge.jsx";
import MoneyInput from "../components/MoneyInput.jsx";
import StatCard from "../components/StatCard.jsx";

const STATUS_COLOR = {
  "Chưa giao": "bg-slate-100 text-slate-600",
  "Đang giao": "bg-blue-100 text-blue-700",
  "Đã giao": "bg-emerald-100 text-emerald-700",
  "Giao thất bại": "bg-red-100 text-red-700",
};

const SUB_TABS = [
  { id: "orders", label: "Vận chuyển theo đơn" },
  { id: "carriers", label: "Đơn vị vận chuyển" },
];

export default function ShippingPage() {
  const [subTab, setSubTab] = useState("orders");
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Vận chuyển</h2>
      <div className="flex gap-1 border-b border-slate-200">
        {SUB_TABS.map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              subTab === t.id ? "bg-teal-50 text-teal-700" : "text-slate-500 hover:bg-slate-50"
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {subTab === "orders" && <ShippingOrdersTab />}
      {subTab === "carriers" && <CarriersTab />}
    </div>
  );
}

// Mỗi đơn 1 card, sửa trực tiếp (ĐVVC, mã vận đơn, phí ship ĐVVC, COD, trạng thái) rồi bấm Lưu.
function ShippingOrdersTab() {
  const { can } = useAuth();
  const [orders, setOrders] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [error, setError] = useState("");
  const [filterCarrier, setFilterCarrier] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [trackingSearch, setTrackingSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  async function reload() {
    try {
      const [os, cs] = await Promise.all([ordersService.listOrders(), carriersService.listCarriers()]);
      setOrders(os);
      setCarriers(cs);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  // Mọi đơn (trừ đơn đã huỷ) đều có sẵn 1 phiếu vận chuyển ngay từ lúc tạo đơn — hiện ra đây luôn,
  // không đợi xác nhận/đã có ĐVVC, để có thể gán ĐVVC sớm ngay từ tab này nếu muốn.
  const shippable = orders
    .filter((o) => o.status !== "Đã huỷ")
    .filter((o) => !filterCarrier || o.carrier === filterCarrier)
    .filter((o) => !filterStatus || o.delivery_status === filterStatus)
    .filter((o) => !search || o.code.toLowerCase().includes(search.toLowerCase()))
    .filter((o) => !trackingSearch || (o.tracking_no || "").toLowerCase().includes(trackingSearch.toLowerCase()));

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const codCollectibleIds = shippable
    .filter((o) => o.is_cod && !o.cod_reconciled && Number(o.total) - Number(o.paid) > 0)
    .map((o) => o.id);
  const shipPayableIds = shippable
    .filter((o) => Number(o.ship_cost) > 0 && !o.ship_cost_paid)
    .map((o) => o.id);

  function toggleSelectAll() {
    const ids = shippable.map((o) => o.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(ids));
  }

  async function bulkCollectCod() {
    const ids = codCollectibleIds.filter((id) => selected.has(id));
    if (ids.length === 0) return;
    if (!confirm(`Xác nhận thu COD cho ${ids.length} đơn đã chọn?`)) return;
    setBulkBusy(true);
    try {
      for (const id of ids) await ordersService.collectCod(id);
      setSelected(new Set());
      reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkPayShip() {
    const ids = shipPayableIds.filter((id) => selected.has(id));
    if (ids.length === 0) return;
    if (!confirm(`Xác nhận trả phí ship cho ${ids.length} đơn đã chọn?`)) return;
    setBulkBusy(true);
    try {
      for (const id of ids) await ordersService.payShipCost(id);
      setSelected(new Set());
      reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-slate-500 block mb-1">ĐVVC</label>
          <select value={filterCarrier} onChange={(e) => setFilterCarrier(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-36">
            <option value="">Tất cả</option>
            {carriers.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Trạng thái giao</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-36">
            <option value="">Tất cả</option>
            {Object.keys(STATUS_COLOR).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Mã đơn</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="VD: ORD-000001"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-36" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Mã vận đơn</label>
          <input value={trackingSearch} onChange={(e) => setTrackingSearch(e.target.value)} placeholder="VD: GHTK123456"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-36" />
        </div>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      {can("shipping_edit") && shippable.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap bg-white rounded-2xl px-4 py-2.5 shadow-sm border border-slate-100">
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox"
              checked={shippable.length > 0 && shippable.every((o) => selected.has(o.id))}
              onChange={toggleSelectAll} />
            Chọn tất cả ({selected.size})
          </label>
          {selected.size > 0 && (
            <>
              <button onClick={bulkCollectCod} disabled={bulkBusy}
                className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                Thu COD toàn bộ
              </button>
              <button onClick={bulkPayShip} disabled={bulkBusy}
                className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                Trả tiền toàn bộ
              </button>
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        {shippable.map((o) => (
          <ShippingRow key={o.id} order={o} carriers={carriers} canEdit={can("shipping_edit")} onSaved={reload}
            selected={selected.has(o.id)} onToggleSelect={() => toggleSelect(o.id)} />
        ))}
        {shippable.length === 0 && (
          <p className="text-slate-400 text-sm bg-white rounded-2xl p-6 text-center border border-slate-100">Chưa có đơn cần giao.</p>
        )}
      </div>
    </div>
  );
}

function ShippingRow({ order, carriers, canEdit, onSaved, selected, onToggleSelect }) {
  const [carrier, setCarrier] = useState(order.carrier || "");
  const [trackingNo, setTrackingNo] = useState(order.tracking_no || "");
  const [shipCost, setShipCost] = useState(order.ship_cost || 0);
  const [isCod, setIsCod] = useState(!!order.is_cod);
  const [deliveryStatus, setDeliveryStatus] = useState(order.delivery_status || "Chưa giao");
  const [saving, setSaving] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [payingShip, setPayingShip] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Số tiền cần thu: LUÔN tính = total - paid hiện tại (1 nguồn dữ liệu duy nhất),
  // hiện cho MỌI đơn — không chỉ đơn COD — để không lệch với đơn hàng.
  const remaining = Math.max(Number(order.total) - Number(order.paid), 0);

  function mark(setter) { return (v) => { setter(v); setDirty(true); }; }

  async function save() {
    setSaving(true);
    try {
      await ordersService.updateShipping(order.id, {
        carrier, trackingNo, deliveryStatus, isCod,
        shipCost: Number(shipCost) || 0,
      });
      setDirty(false);
      onSaved();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function collectCod() {
    if (!confirm(`Xác nhận đã thu COD ${remaining.toLocaleString("vi-VN")} đ cho đơn ${order.code}? Hệ thống sẽ tự tạo phiếu thu.`)) return;
    setCollecting(true);
    try {
      await ordersService.collectCod(order.id);
      onSaved();
    } catch (e) {
      alert(e.message);
    } finally {
      setCollecting(false);
    }
  }

  async function payShip() {
    if (!confirm(`Xác nhận đã trả phí ship ${fmt(shipCost)} cho ${carrier || "ĐVVC"} của đơn ${order.code}? Hệ thống sẽ tự tạo phiếu chi.`)) return;
    setPayingShip(true);
    try {
      await ordersService.payShipCost(order.id);
      onSaved();
    } catch (e) {
      alert(e.message);
    } finally {
      setPayingShip(false);
    }
  }

  async function printShipment() {
    const html = await ordersService.getShipmentPrintHtml(order.id);
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  async function downloadShipmentPdf() {
    try { await ordersService.downloadShipmentPdf(order.id); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
      <div className="flex items-start gap-3 flex-wrap justify-between mb-3">
        <div className="flex items-start gap-3">
          {canEdit && (
            <input type="checkbox" checked={selected} onChange={onToggleSelect} className="mt-1.5" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800">{order.code}</span>
              <Badge label={deliveryStatus} colorClass={STATUS_COLOR[deliveryStatus]} />
            </div>
            <div className="text-xs text-slate-400">Số phiếu VC: {order.shipment_doc_no || "—"}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">Số tiền cần thu</div>
          <div className="text-lg font-bold text-red-500">{fmt(remaining)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Đơn vị vận chuyển</label>
          <input list="carrier-list-row" value={carrier} disabled={!canEdit}
            onChange={(e) => mark(setCarrier)(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50" />
          <datalist id="carrier-list-row">{carriers.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Mã vận đơn</label>
          <input value={trackingNo} disabled={!canEdit} onChange={(e) => mark(setTrackingNo)(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Phí ship ĐVVC</label>
          <div className="flex items-center gap-1">
            <MoneyInput value={shipCost} disabled={!canEdit} onChange={mark(setShipCost)} placeholder="0"
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right disabled:bg-slate-50" />
            <span className="text-xs text-slate-400">đ</span>
          </div>
          {Number(shipCost) > 0 && (
            order.ship_cost_paid
              ? <div className="mt-1"><Badge label="Đã trả" colorClass="bg-emerald-100 text-emerald-700" /></div>
              : canEdit && (
                <button type="button" onClick={payShip} disabled={payingShip || dirty}
                  title={dirty ? "Lưu thay đổi trước khi trả tiền" : ""}
                  className="mt-1 bg-amber-600 text-white text-xs font-medium px-2 py-1 rounded-lg disabled:opacity-50">
                  {payingShip ? "…" : "Trả tiền"}
                </button>
              )
          )}
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Trạng thái giao</label>
          <select value={deliveryStatus} disabled={!canEdit} onChange={(e) => mark(setDeliveryStatus)(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50">
            {Object.keys(STATUS_COLOR).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 flex-wrap gap-2">
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={isCod} disabled={!canEdit} onChange={(e) => mark(setIsCod)(e.target.checked)} />
          Thu hộ COD
        </label>
        <div className="flex items-center gap-2">
          {isCod && (
            order.cod_reconciled
              ? <Badge label="Đã thu COD" colorClass="bg-emerald-100 text-emerald-700" />
              : canEdit && remaining > 0 && (
                <button onClick={collectCod} disabled={collecting || dirty}
                  title={dirty ? "Lưu thay đổi (tick COD) trước khi thu" : ""}
                  className="bg-emerald-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">
                  {collecting ? "…" : "Thu COD"}
                </button>
              )
          )}
          {canEdit && dirty && (
            <button onClick={save} disabled={saving}
              className="bg-teal-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">
              {saving ? "…" : "Lưu"}
            </button>
          )}
          <button onClick={printShipment} className="border border-slate-200 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg">
            In phiếu
          </button>
          <button onClick={downloadShipmentPdf} className="border border-slate-200 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg">
            Tải PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// Quản lý danh sách ĐVVC + tổng hợp đối chiếu COD theo từng đơn vị.
function CarriersTab() {
  const { can } = useAuth();
  const [carriers, setCarriers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterCarrier, setFilterCarrier] = useState("");

  async function reload() {
    try {
      const [cs, os] = await Promise.all([carriersService.listCarriers(), ordersService.listOrders()]);
      setCarriers(cs);
      setOrders(os);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  const dateFilteredOrders = orders.filter((o) => {
    const d = o.created_at?.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });

  const visibleCarriers = filterCarrier ? carriers.filter((c) => c.name === filterCarrier) : carriers;

  async function addCarrier(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await carriersService.createCarrier(name.trim());
      setName("");
      reload();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  // Số tiền cần thu tính trên TẤT CẢ đơn (không chỉ đơn COD) = total - paid, theo từng ĐVVC.
  const remainingOf = (o) => Math.max(Number(o.total) - Number(o.paid), 0);
  const statsOrders = filterCarrier ? dateFilteredOrders.filter((o) => o.carrier === filterCarrier) : dateFilteredOrders;
  const totalValue = statsOrders.reduce((s, o) => s + Number(o.total), 0);
  const totalCollected = statsOrders.reduce((s, o) => s + Number(o.paid), 0);
  const totalRemaining = statsOrders.reduce((s, o) => s + remainingOf(o), 0);

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Từ ngày</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Đến ngày</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Đơn vị vận chuyển</label>
          <select value={filterCarrier} onChange={(e) => setFilterCarrier(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-44">
            <option value="">Tất cả</option>
            {carriers.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon="📦" label="Tổng giá trị đơn" value={fmt(totalValue)} color="bg-blue-50" />
        <StatCard icon="💰" label="Đã thu" value={fmt(totalCollected)} color="bg-emerald-50" />
        <StatCard icon="⏳" label="Số tiền cần thu" value={fmt(totalRemaining)} color="bg-red-50" />
      </div>

      {can("shipping_edit") && (
        <form onSubmit={addCarrier} className="flex gap-2 max-w-md">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên đơn vị vận chuyển mới"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <button type="submit" disabled={saving}
            className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            + Thêm
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs border-b border-slate-100">
              <th className="py-2 px-4">Đơn vị vận chuyển</th>
              <th className="py-2 px-4 text-right">Số đơn</th>
              <th className="py-2 px-4 text-right">Tổng giá trị</th>
              <th className="py-2 px-4 text-right">Đã thu</th>
              <th className="py-2 px-4 text-right">Số tiền cần thu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleCarriers.map((c) => {
              const list = dateFilteredOrders.filter((o) => o.carrier === c.name);
              const total = list.reduce((s, o) => s + Number(o.total), 0);
              const collected = list.reduce((s, o) => s + Number(o.paid), 0);
              const remaining = list.reduce((s, o) => s + remainingOf(o), 0);
              return (
                <tr key={c.id}>
                  <td className="py-2.5 px-4 font-medium">{c.name}</td>
                  <td className="py-2.5 px-4 text-right">{list.length}</td>
                  <td className="py-2.5 px-4 text-right">{fmt(total)}</td>
                  <td className="py-2.5 px-4 text-right text-emerald-600">{fmt(collected)}</td>
                  <td className="py-2.5 px-4 text-right text-red-500 font-medium">{fmt(remaining)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleCarriers.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có đơn vị vận chuyển nào.</p>}
      </div>
    </div>
  );
}
