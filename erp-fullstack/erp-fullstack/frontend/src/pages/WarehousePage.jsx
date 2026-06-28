import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as stockService from "../services/stock.service.js";
import * as warehousesService from "../services/warehouses.service.js";
import * as productsService from "../services/products.service.js";
import * as suppliersService from "../services/suppliers.service.js";
import { fmt } from "../utils/format.js";
import MoneyInput from "../components/MoneyInput.jsx";
import ProductPicker from "../components/ProductPicker.jsx";
import { buildSellableOptions } from "../utils/sellable.js";
import { exportCsv } from "../utils/exportCsv.js";

// In phiếu (nhập hàng/điều chỉnh/luân chuyển) theo số phiếu — HTML đã render sẵn ở backend (dùng mẫu in tuỳ chỉnh).
async function printStockDoc(docNo) {
  if (!docNo) return;
  const html = await stockService.getMovementPrintHtml(docNo);
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

async function downloadStockDocPdf(docNo) {
  if (!docNo) return;
  try { await stockService.downloadMovementPdf(docNo); }
  catch (e) { alert(e.message); }
}

const SUB_TABS = [
  { id: "stock", label: "Tồn kho" },
  { id: "inbound", label: "Nhập hàng" },
  { id: "adjust", label: "Điều chỉnh" },
  { id: "transfer", label: "Luân chuyển kho" },
  { id: "movements", label: "Nhập Xuất" },
];

export default function WarehousePage() {
  const { can } = useAuth();
  const [subTab, setSubTab] = useState("stock");
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([warehousesService.listWarehouses(), productsService.listProducts(), suppliersService.listSuppliers()])
      .then(([ws, ps, sups]) => { setWarehouses(ws); setProducts(ps); setSuppliers(sups); })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Kho hàng</h2>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="flex gap-1 border-b border-slate-200">
        {SUB_TABS.map((t) => (
          (t.id === "stock" || t.id === "movements" || can("warehouse_edit")) && (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 ${subTab === t.id ? "border-teal-600 text-teal-600" : "border-transparent text-slate-500"}`}>
              {t.label}
            </button>
          )
        ))}
      </div>

      {subTab === "stock" && <StockTab warehouses={warehouses} />}
      {subTab === "inbound" && can("warehouse_edit") && <InboundTab warehouses={warehouses} products={products} suppliers={suppliers} />}
      {subTab === "adjust" && can("warehouse_edit") && <AdjustTab warehouses={warehouses} products={products} />}
      {subTab === "transfer" && can("warehouse_edit") && <TransferTab warehouses={warehouses} products={products} />}
      {subTab === "movements" && <MovementsTab warehouses={warehouses} />}
    </div>
  );
}

// Bảng tồn kho dạng pivot: mỗi sản phẩm 1 dòng, mỗi kho 1 cột + cột Tổng.
function StockTab({ warehouses }) {
  const [stock, setStock] = useState([]);
  const [error, setError] = useState("");

  async function reload() {
    try { setStock(await stockService.listStock()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  const rowsByProduct = {};
  for (const s of stock) {
    const key = s.product_id + (s.variant_id || "");
    if (!rowsByProduct[key]) {
      const hasAttrs = s.variant_attrs && Object.keys(s.variant_attrs).length > 0;
      const sku = s.variant_sku || s.product_sku || "";
      rowsByProduct[key] = {
        label: s.product_name + (hasAttrs ? ` (${Object.values(s.variant_attrs).join(" / ")})` : ""),
        sku,
        byWarehouse: {},
      };
    }
    rowsByProduct[key].byWarehouse[s.warehouse_id] = s.qty;
  }
  const rows = Object.values(rowsByProduct);

  function exportStock() {
    exportCsv("ton_kho.csv", [
      { key: "label", label: "Sản phẩm" }, { key: "sku", label: "SKU" },
      ...warehouses.map((w) => ({ key: (r) => r.byWarehouse[w.id] ?? 0, label: w.name })),
      { key: (r) => warehouses.reduce((s, w) => s + (Number(r.byWarehouse[w.id]) || 0), 0), label: "Tổng" },
    ], rows);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={exportStock} className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl">
          Xuất CSV
        </button>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs">
              <th className="py-2 px-4">Sản phẩm</th>
              <th className="py-2 px-4">SKU</th>
              {warehouses.map((w) => <th key={w.id} className="py-2 px-4 text-right">{w.name}</th>)}
              <th className="py-2 px-4 text-right">Tổng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => {
              const total = warehouses.reduce((s, w) => s + (Number(r.byWarehouse[w.id]) || 0), 0);
              return (
                <tr key={i}>
                  <td className="py-2 px-4">{r.label}</td>
                  <td className="py-2 px-4 text-slate-500">{r.sku || "—"}</td>
                  {warehouses.map((w) => <td key={w.id} className="py-2 px-4 text-right">{r.byWarehouse[w.id] ?? 0}</td>)}
                  <td className="py-2 px-4 text-right font-bold">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có dữ liệu tồn kho.</p>}
      </div>
    </div>
  );
}

// Lịch sử phiếu nhập/xuất/điều chỉnh/chuyển kho.
const MOVEMENT_LABEL = {
  inbound: "Nhập hàng", sale: "Xuất bán", return: "Hoàn tồn", adjust: "Điều chỉnh",
  transfer_in: "Chuyển vào", transfer_out: "Chuyển ra",
};
function MovementsTab({ warehouses }) {
  const [warehouseId, setWarehouseId] = useState("");
  const [type, setType] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [movements, setMovements] = useState([]);
  const [error, setError] = useState("");

  async function reload() {
    try { setMovements(await stockService.listMovements({ warehouseId, type })); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, [warehouseId, type]);

  const filtered = movements.filter((m) =>
    !skuFilter || (m.variant_sku || m.product_sku || "").toLowerCase().includes(skuFilter.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-3 flex-wrap">
        <div>
          <label className="text-xs text-slate-500">Kho</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm block">
            <option value="">— Tất cả kho —</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Loại phiếu</label>
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm block">
            <option value="">— Tất cả —</option>
            {Object.entries(MOVEMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Phân loại SKU</label>
          <input value={skuFilter} onChange={(e) => setSkuFilter(e.target.value)} placeholder="VD: m57123"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm block" />
        </div>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs">
              <th className="py-2 px-4">Số phiếu</th>
              <th className="py-2 px-4">Ngày</th>
              <th className="py-2 px-4">Loại</th>
              <th className="py-2 px-4">Sản phẩm</th>
              <th className="py-2 px-4">SKU</th>
              <th className="py-2 px-4">Kho</th>
              <th className="py-2 px-4 text-right">SL thay đổi</th>
              <th className="py-2 px-4">Lý do</th>
              <th className="py-2 px-4">Người tạo</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((m) => (
              <tr key={m.id}>
                <td className="py-2 px-4 whitespace-nowrap font-medium">{m.doc_no || "—"}</td>
                <td className="py-2 px-4 whitespace-nowrap">{new Date(m.created_at).toLocaleString("vi-VN")}</td>
                <td className="py-2 px-4">{MOVEMENT_LABEL[m.type] || m.type}</td>
                <td className="py-2 px-4">
                  {m.product_name}
                  {m.variant_attrs && Object.keys(m.variant_attrs).length > 0 ? ` (${Object.values(m.variant_attrs).join(" / ")})` : ""}
                </td>
                <td className="py-2 px-4 text-slate-500">{m.variant_sku || m.product_sku || "—"}</td>
                <td className="py-2 px-4 text-slate-500">{m.warehouse_name}</td>
                <td className={`py-2 px-4 text-right font-medium ${m.qty_change < 0 ? "text-red-500" : "text-emerald-600"}`}>
                  {m.qty_change > 0 ? `+${m.qty_change}` : m.qty_change}
                </td>
                <td className="py-2 px-4 text-slate-500">{m.reason}{m.supplier_name ? ` (${m.supplier_name})` : ""}</td>
                <td className="py-2 px-4 text-slate-500">{m.created_by_name}</td>
                <td className="py-2 px-4">
                  {m.doc_no && (
                    <>
                      <button onClick={() => printStockDoc(m.doc_no)} className="text-teal-600 hover:underline text-xs">In phiếu</button>
                      <button onClick={() => downloadStockDocPdf(m.doc_no)} className="text-teal-600 hover:underline text-xs ml-2">Tải PDF</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có phiếu nhập/xuất nào.</p>}
      </div>
    </div>
  );
}

// Lịch sử 1 loại phiếu (nhập hoặc điều chỉnh) hiện ngay dưới form, kèm xuất CSV.
function SimpleHistoryTable({ type, title, filename, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    stockService.listMovements({ type }).then(setRows).catch((e) => setError(e.message));
  }, [type, refreshKey]);

  function doExport() {
    exportCsv(filename, [
      { key: "doc_no", label: "Số phiếu" },
      { key: (m) => new Date(m.created_at).toLocaleString("vi-VN"), label: "Ngày" },
      { key: (m) => m.product_name + (m.variant_attrs && Object.keys(m.variant_attrs).length ? ` (${Object.values(m.variant_attrs).join(" / ")})` : ""), label: "Sản phẩm" },
      { key: (m) => m.variant_sku || m.product_sku || "", label: "SKU" },
      { key: "warehouse_name", label: "Kho" },
      { key: "qty_change", label: "SL thay đổi" },
      { key: "supplier_name", label: "Nhà cung cấp" },
      { key: "reason", label: "Lý do" },
      { key: "created_by_name", label: "Người tạo" },
    ], rows);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto max-w-4xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="font-semibold text-slate-700">{title}</div>
        <button onClick={doExport} className="border border-slate-200 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg">
          Xuất CSV
        </button>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-2">{error}</div>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400 text-xs">
            <th className="py-2 px-4">Số phiếu</th>
            <th className="py-2 px-4">Ngày</th>
            <th className="py-2 px-4">Sản phẩm</th>
            <th className="py-2 px-4">Kho</th>
            <th className="py-2 px-4 text-right">SL</th>
            <th className="py-2 px-4">Lý do</th>
            <th className="py-2 px-4">Người tạo</th>
            <th className="py-2 px-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((m) => (
            <tr key={m.id}>
              <td className="py-2 px-4 whitespace-nowrap font-medium">{m.doc_no || "—"}</td>
              <td className="py-2 px-4 whitespace-nowrap">{new Date(m.created_at).toLocaleString("vi-VN")}</td>
              <td className="py-2 px-4">
                {m.product_name}
                {m.variant_attrs && Object.keys(m.variant_attrs).length > 0 ? ` (${Object.values(m.variant_attrs).join(" / ")})` : ""}
                {(m.variant_sku || m.product_sku) ? ` · ${m.variant_sku || m.product_sku}` : ""}
              </td>
              <td className="py-2 px-4 text-slate-500">{m.warehouse_name}</td>
              <td className={`py-2 px-4 text-right font-medium ${m.qty_change < 0 ? "text-red-500" : "text-emerald-600"}`}>
                {m.qty_change > 0 ? `+${m.qty_change}` : m.qty_change}
              </td>
              <td className="py-2 px-4 text-slate-500">{m.reason}{m.supplier_name ? ` (${m.supplier_name})` : ""}</td>
              <td className="py-2 px-4 text-slate-500">{m.created_by_name}</td>
              <td className="py-2 px-4">
                {m.doc_no && (
                  <>
                    <button onClick={() => printStockDoc(m.doc_no)} className="text-teal-600 hover:underline text-xs">In phiếu</button>
                    <button onClick={() => downloadStockDocPdf(m.doc_no)} className="text-teal-600 hover:underline text-xs ml-2">Tải PDF</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có phiếu nào.</p>}
    </div>
  );
}

// Lịch sử luân chuyển kho: gộp 2 dòng (xuất kho nguồn + nhập kho đích) cùng doc_no thành 1 phiếu.
function TransferHistoryTable({ refreshKey }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([stockService.listMovements({ type: "transfer_out" }), stockService.listMovements({ type: "transfer_in" })])
      .then(([outs, ins]) => {
        const byDoc = {};
        for (const m of outs) {
          (byDoc[m.doc_no] ||= { docNo: m.doc_no, date: m.created_at, from: m.warehouse_name, items: [], reason: m.reason, createdBy: m.created_by_name })
            .items.push(m);
        }
        for (const m of ins) {
          if (byDoc[m.doc_no]) byDoc[m.doc_no].to = m.warehouse_name;
        }
        setRows(Object.values(byDoc).sort((a, b) => new Date(b.date) - new Date(a.date)));
      })
      .catch((e) => setError(e.message));
  }, [refreshKey]);

  function doExport() {
    const flat = rows.flatMap((r) => r.items.map((m) => ({
      docNo: r.docNo, date: new Date(r.date).toLocaleString("vi-VN"), from: r.from, to: r.to,
      product: m.product_name + (m.variant_attrs && Object.keys(m.variant_attrs).length ? ` (${Object.values(m.variant_attrs).join(" / ")})` : ""),
      sku: m.variant_sku || m.product_sku || "", qty: -m.qty_change, reason: r.reason, createdBy: r.createdBy,
    })));
    exportCsv("luan_chuyen_kho.csv", [
      { key: "docNo", label: "Số phiếu" }, { key: "date", label: "Ngày" },
      { key: "from", label: "Kho nguồn" }, { key: "to", label: "Kho đích" },
      { key: "product", label: "Sản phẩm" }, { key: "sku", label: "SKU" }, { key: "qty", label: "Số lượng" },
      { key: "reason", label: "Lý do" }, { key: "createdBy", label: "Người tạo" },
    ], flat);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto max-w-4xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="font-semibold text-slate-700">Lịch sử luân chuyển kho</div>
        <button onClick={doExport} className="border border-slate-200 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg">
          Xuất CSV
        </button>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-2">{error}</div>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400 text-xs">
            <th className="py-2 px-4">Số phiếu</th>
            <th className="py-2 px-4">Ngày</th>
            <th className="py-2 px-4">Từ kho</th>
            <th className="py-2 px-4">Đến kho</th>
            <th className="py-2 px-4">Sản phẩm</th>
            <th className="py-2 px-4">Lý do</th>
            <th className="py-2 px-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.docNo}>
              <td className="py-2 px-4 whitespace-nowrap font-medium">{r.docNo}</td>
              <td className="py-2 px-4 whitespace-nowrap">{new Date(r.date).toLocaleString("vi-VN")}</td>
              <td className="py-2 px-4 text-slate-500">{r.from}</td>
              <td className="py-2 px-4 text-slate-500">{r.to}</td>
              <td className="py-2 px-4">
                {r.items.map((m, i) => (
                  <div key={i}>
                    {m.product_name}
                    {m.variant_attrs && Object.keys(m.variant_attrs).length > 0 ? ` (${Object.values(m.variant_attrs).join(" / ")})` : ""}
                    {" × "}{-m.qty_change}
                  </div>
                ))}
              </td>
              <td className="py-2 px-4 text-slate-500">{r.reason}</td>
              <td className="py-2 px-4">
                <button onClick={() => printStockDoc(r.docNo)} className="text-teal-600 hover:underline text-xs">In phiếu</button>
                <button onClick={() => downloadStockDocPdf(r.docNo)} className="text-teal-600 hover:underline text-xs ml-2">Tải PDF</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có phiếu luân chuyển nào.</p>}
    </div>
  );
}

// Nhập hàng: nhiều sản phẩm/biến thể/lần, chọn NCC → tự ghi nợ NCC theo Σ(qty×giá vốn). Trả về số phiếu (PN-xxxxxx).
function InboundTab({ warehouses, products, suppliers }) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const [supplierId, setSupplierId] = useState("");
  const [stock, setStock] = useState([]);
  const [lines, setLines] = useState([{ key: "", qty: 1, cost: 0 }]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastDocNo, setLastDocNo] = useState("");

  useEffect(() => { if (!warehouseId && warehouses[0]) setWarehouseId(warehouses[0].id); }, [warehouses]);
  useEffect(() => {
    if (!warehouseId) return;
    stockService.listStock(warehouseId).then(setStock).catch((e) => setError(e.message));
  }, [warehouseId]);

  const stockMap = {};
  for (const s of stock) stockMap[`${s.product_id}:${s.variant_id || ""}`] = s.qty;
  const sellable = buildSellableOptions(products, stockMap);

  function setLine(idx, patch) { setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l))); }
  function addLine() { setLines((ls) => [...ls, { key: "", qty: 1, cost: 0 }]); }
  function removeLine(idx) { setLines((ls) => ls.filter((_, i) => i !== idx)); }
  function onPickProduct(idx, opt) {
    setLine(idx, { key: opt.key, cost: opt.cost });
  }

  const debtAmount = lines.reduce((s, l) => s + Number(l.cost || 0) * Number(l.qty || 0), 0);

  async function submit(e) {
    e.preventDefault();
    setError(""); setOk("");
    const items = lines.filter((l) => l.key && Number(l.qty) > 0).map((l) => {
      const opt = sellable.find((o) => o.key === l.key);
      return { productId: opt.productId, variantId: opt.variantId, qty: Number(l.qty) };
    });
    if (!items.length) return setError("Thêm ít nhất 1 sản phẩm với số lượng hợp lệ");
    setSaving(true);
    try {
      const res = await stockService.inboundStock({
        warehouseId, items, reason,
        supplierId: supplierId || null, debtAmount: supplierId ? debtAmount : 0,
      });
      setOk(`Đã nhập hàng thành công. Số phiếu: ${res.docNo} — Bấm "In phiếu" để in.`);
      setLastDocNo(res.docNo);
      setLines([{ key: "", qty: 1, cost: 0 }]);
      setRefreshKey((k) => k + 1);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
    <form onSubmit={submit} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3 max-w-2xl">
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      {ok && <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg px-3 py-2">{ok}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500">Kho nhận hàng</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Nhà cung cấp (tuỳ chọn)</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">— Không ghi nợ —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-slate-500">Sản phẩm nhập</label>
        {lines.map((l, idx) => {
          const opt = sellable.find((o) => o.key === l.key);
          return (
            <div key={idx}>
              <div className="flex gap-2">
                <ProductPicker options={sellable} value={l.key} onSelect={(o) => onPickProduct(idx, o)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <input type="number" min="1" value={l.qty} onChange={(e) => setLine(idx, { qty: e.target.value })}
                  placeholder="SL" className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <MoneyInput value={l.cost} onChange={(v) => setLine(idx, { cost: v })} placeholder="Giá vốn"
                  className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm text-right" />
                <button type="button" onClick={() => removeLine(idx)} className="text-red-500 px-2 text-sm">✕</button>
              </div>
              {opt && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Đã chọn: <span className="font-medium text-slate-600">{opt.label}</span>
                  {opt.sku ? ` · SKU: ${opt.sku}` : " · Chưa có SKU"}
                  {" · "}Tồn hiện tại: {opt.stock}
                </p>
              )}
            </div>
          );
        })}
        <button type="button" onClick={addLine} className="text-teal-600 text-sm font-medium">+ Thêm sản phẩm</button>
      </div>

      {supplierId && (
        <div className="text-sm text-slate-500">Sẽ ghi nợ nhà cung cấp: <span className="font-semibold text-red-500">{fmt(debtAmount)}</span></div>
      )}

      <div>
        <label className="text-xs text-slate-500">Ghi chú</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
          {saving ? "Đang lưu…" : "Nhập hàng"}
        </button>
        <button type="button" disabled={!lastDocNo} onClick={() => printStockDoc(lastDocNo)}
          className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
          In phiếu
        </button>
        <button type="button" disabled={!lastDocNo} onClick={() => downloadStockDocPdf(lastDocNo)}
          className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
          Tải PDF
        </button>
      </div>
    </form>
    <SimpleHistoryTable type="inbound" title="Lịch sử nhập hàng" filename="phieu_nhap_hang.csv" refreshKey={refreshKey} />
    </div>
  );
}

// Điều chỉnh nhiều sản phẩm/biến thể/lần, hiện tồn sau điều chỉnh ngay khi lưu, có số phiếu (PDC-xxxxxx).
function AdjustTab({ warehouses, products }) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const [stock, setStock] = useState([]);
  const [lines, setLines] = useState([{ key: "", qtyChange: 0 }]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { docNo, after: [{productId, variantId, qtyAfter}] }
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => { if (!warehouseId && warehouses[0]) setWarehouseId(warehouses[0].id); }, [warehouses]);
  useEffect(() => {
    if (!warehouseId) return;
    stockService.listStock(warehouseId).then(setStock).catch((e) => setError(e.message));
  }, [warehouseId]);

  const stockMap = {};
  for (const s of stock) stockMap[`${s.product_id}:${s.variant_id || ""}`] = s.qty;
  const sellable = buildSellableOptions(products, stockMap);

  function setLine(idx, patch) { setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l))); }
  function addLine() { setLines((ls) => [...ls, { key: "", qtyChange: 0 }]); }
  function removeLine(idx) { setLines((ls) => ls.filter((_, i) => i !== idx)); }

  async function submit(e) {
    e.preventDefault();
    setError(""); setResult(null);
    const items = lines.filter((l) => l.key && Number(l.qtyChange)).map((l) => {
      const opt = sellable.find((o) => o.key === l.key);
      return { productId: opt.productId, variantId: opt.variantId, qtyChange: Number(l.qtyChange) };
    });
    if (!items.length) return setError("Thêm ít nhất 1 sản phẩm với số lượng thay đổi khác 0");
    setSaving(true);
    try {
      const res = await stockService.adjustStock({ warehouseId, items, reason });
      setResult(res);
      setLines([{ key: "", qtyChange: 0 }]);
      setRefreshKey((k) => k + 1);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
    <form onSubmit={submit} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3 max-w-2xl">
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      {result && (
        <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg px-3 py-2 space-y-1">
          <div>Đã điều chỉnh thành công. Số phiếu: <b>{result.docNo}</b></div>
          {result.after.map((a, i) => {
            const opt = sellable.find((o) => o.productId === a.productId && o.variantId === a.variantId);
            return <div key={i}>{opt?.label || "Sản phẩm"}: tồn sau điều chỉnh = <b>{a.qtyAfter}</b></div>;
          })}
        </div>
      )}

      <div>
        <label className="text-xs text-slate-500">Kho</label>
        <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-slate-500">Sản phẩm điều chỉnh (+ tăng / - giảm)</label>
        {lines.map((l, idx) => {
          const opt = sellable.find((o) => o.key === l.key);
          return (
            <div key={idx}>
              <div className="flex gap-2">
                <ProductPicker options={sellable} value={l.key} onSelect={(o) => setLine(idx, { key: o.key })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <input type="number" value={l.qtyChange} onChange={(e) => setLine(idx, { qtyChange: e.target.value })}
                  placeholder="+/- SL" className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <button type="button" onClick={() => removeLine(idx)} className="text-red-500 px-2 text-sm">✕</button>
              </div>
              {opt && <p className="text-xs text-slate-400 mt-0.5">Tồn hiện tại: {opt.stock}</p>}
            </div>
          );
        })}
        <button type="button" onClick={addLine} className="text-teal-600 text-sm font-medium">+ Thêm sản phẩm</button>
      </div>

      <div>
        <label className="text-xs text-slate-500">Lý do kiểm/điều chỉnh</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Kiểm kê hàng tháng, hàng hỏng..."
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
          {saving ? "Đang lưu…" : "Điều chỉnh"}
        </button>
        <button type="button" disabled={!result?.docNo} onClick={() => printStockDoc(result?.docNo)}
          className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
          In phiếu
        </button>
        <button type="button" disabled={!result?.docNo} onClick={() => downloadStockDocPdf(result?.docNo)}
          className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
          Tải PDF
        </button>
      </div>
    </form>
    <SimpleHistoryTable type="adjust" title="Lịch sử điều chỉnh" filename="phieu_dieu_chinh.csv" refreshKey={refreshKey} />
    </div>
  );
}

// Luân chuyển nhiều sản phẩm/biến thể cùng lúc giữa 2 kho, in được phiếu vận chuyển sau khi xác nhận.
function TransferTab({ warehouses, products }) {
  const [fromWarehouseId, setFromWarehouseId] = useState(warehouses[0]?.id || "");
  const [toWarehouseId, setToWarehouseId] = useState(warehouses[1]?.id || "");
  const [stock, setStock] = useState([]);
  const [lines, setLines] = useState([{ key: "", qty: 1 }]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastTransfer, setLastTransfer] = useState(null); // {fromName, toName, items} sẵn để in lại
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!fromWarehouseId && warehouses[0]) setFromWarehouseId(warehouses[0].id);
    if (!toWarehouseId && warehouses[1]) setToWarehouseId(warehouses[1].id);
  }, [warehouses]);
  useEffect(() => {
    if (!fromWarehouseId) return;
    stockService.listStock(fromWarehouseId).then(setStock).catch((e) => setError(e.message));
  }, [fromWarehouseId]);

  const stockMap = {};
  for (const s of stock) stockMap[`${s.product_id}:${s.variant_id || ""}`] = s.qty;
  const sellable = buildSellableOptions(products, stockMap);

  function setLine(idx, patch) { setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l))); }
  function addLine() { setLines((ls) => [...ls, { key: "", qty: 1 }]); }
  function removeLine(idx) { setLines((ls) => ls.filter((_, i) => i !== idx)); }

  async function submit(e) {
    e.preventDefault();
    setError(""); setOk("");
    if (fromWarehouseId === toWarehouseId) return setError("Kho nguồn và kho đích phải khác nhau");
    const items = lines.filter((l) => l.key && Number(l.qty) > 0).map((l) => {
      const opt = sellable.find((o) => o.key === l.key);
      return { productId: opt.productId, variantId: opt.variantId, qty: Number(l.qty) };
    });
    if (!items.length) return setError("Thêm ít nhất 1 sản phẩm");
    setSaving(true);
    try {
      const res = await stockService.transferStock({ fromWarehouseId, toWarehouseId, items, reason });
      setOk(`Đã luân chuyển kho thành công. Số phiếu: ${res.docNo} — Bấm "In phiếu" để in.`);
      setLastTransfer({
        items, docNo: res.docNo,
        fromName: warehouses.find((w) => w.id === fromWarehouseId)?.name || "",
        toName: warehouses.find((w) => w.id === toWarehouseId)?.name || "",
      });
      setLines([{ key: "", qty: 1 }]);
      setRefreshKey((k) => k + 1);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
    <form onSubmit={submit} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3 max-w-2xl">
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      {ok && <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg px-3 py-2">{ok}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500">Kho nguồn</label>
          <select value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Kho đích</label>
          <select value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-slate-500">Sản phẩm luân chuyển</label>
        {lines.map((l, idx) => {
          const opt = sellable.find((o) => o.key === l.key);
          return (
            <div key={idx}>
              <div className="flex gap-2">
                <ProductPicker options={sellable} value={l.key} onSelect={(o) => setLine(idx, { key: o.key })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <input type="number" min="1" value={l.qty} onChange={(e) => setLine(idx, { qty: e.target.value })}
                  className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <button type="button" onClick={() => removeLine(idx)} className="text-red-500 px-2 text-sm">✕</button>
              </div>
              {opt && <p className="text-xs text-slate-400 mt-0.5">Tồn tại kho nguồn: {opt.stock}</p>}
            </div>
          );
        })}
        <button type="button" onClick={addLine} className="text-teal-600 text-sm font-medium">+ Thêm sản phẩm</button>
      </div>

      <div>
        <label className="text-xs text-slate-500">Ghi chú</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
          {saving ? "Đang lưu…" : "Xác nhận luân chuyển"}
        </button>
        <button type="button" disabled={!lastTransfer} onClick={() => printStockDoc(lastTransfer.docNo)}
          className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
          In phiếu
        </button>
        <button type="button" disabled={!lastTransfer} onClick={() => downloadStockDocPdf(lastTransfer.docNo)}
          className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
          Tải PDF
        </button>
      </div>
    </form>
    <TransferHistoryTable refreshKey={refreshKey} />
    </div>
  );
}
