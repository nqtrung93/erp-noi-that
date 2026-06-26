import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as inventoryService from "../services/inventory.service.js";
import * as partnersService from "../services/partners.service.js";
import { fmt } from "../utils/format.js";
import Modal from "../components/Modal.jsx";
import Toolbar, { ToolbarButton } from "../components/Toolbar.jsx";
import { readCsvFile } from "../utils/importCsv.js";

const TYPE_LABEL = { inbound: "Nhập", outbound: "Xuất", adjust: "Điều chỉnh", transfer_in: "Chuyển vào", transfer_out: "Chuyển ra" };

function attrsLabel(attrs) {
  if (!attrs || !Object.keys(attrs).length) return "";
  return Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join(", ");
}

export default function InventoryPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState("stock"); // stock | movements | products
  const [stock, setStock] = useState([]);
  const [movements, setMovements] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [partners, setPartners] = useState([]);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // 'inbound' | 'outbound' | 'adjust' | 'transfer' | 'product'
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importingStock, setImportingStock] = useState(false);
  const [importStockResult, setImportStockResult] = useState(null);
  const [stockSearch, setStockSearch] = useState("");

  async function reload() {
    try {
      const [s, m, p, w] = await Promise.all([
        inventoryService.listStock(), inventoryService.listMovements(),
        inventoryService.listProducts(), inventoryService.listWarehouses(),
      ]);
      setStock(s); setMovements(m); setProducts(p); setWarehouses(w);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); partnersService.listPartners().then(setPartners).catch(() => {}); }, []);

  // Nhập CSV sản phẩm: cột Tên,SKU,ĐVT,GiáVốn,GiáBán + cột thuộc tính tuỳ ý (vd Màu, Size) để tạo biến thể.
  // Các dòng cùng Tên được nhóm thành biến thể của 1 sản phẩm.
  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportResult(null); setError("");
    try {
      const rows = await readCsvFile(file);
      const FIXED = ["Tên", "SKU", "ĐVT", "GiáVốn", "GiáBán"];
      const groups = {};
      for (const row of rows) {
        const name = row["Tên"]?.trim();
        if (!name) continue;
        (groups[name] ||= []).push(row);
      }

      let ok = 0; const failed = [];
      for (const [name, group] of Object.entries(groups)) {
        try {
          const axisKeys = Object.keys(group[0]).filter((k) => !FIXED.includes(k) && group[0][k]);
          const hasVariants = group.length > 1 && axisKeys.length > 0;
          if (hasVariants) {
            const keyValues = {};
            const variants = group.map((row) => {
              const attrs = {};
              for (const k of axisKeys) if (row[k]) { attrs[k] = row[k]; (keyValues[k] ||= new Set()).add(row[k]); }
              return { sku: row["SKU"] || null, attrs, price: Number(row["GiáBán"]) || 0, cost: Number(row["GiáVốn"]) || 0 };
            });
            const options = Object.entries(keyValues).map(([n, set]) => ({ name: n, values: [...set] }));
            await inventoryService.createProduct({
              name, unit: group[0]["ĐVT"] || "cái", hasVariants: true, options, variants,
              price: variants[0].price, cost: variants[0].cost,
            });
          } else {
            await inventoryService.createProduct({
              name, sku: group[0]["SKU"] || null, unit: group[0]["ĐVT"] || "cái",
              cost: Number(group[0]["GiáVốn"]) || 0, price: Number(group[0]["GiáBán"]) || 0,
            });
          }
          ok++;
        } catch (e2) {
          failed.push(`${name}: ${e2.message}`);
        }
      }
      setImportResult({ ok, failed });
      reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  function downloadSampleCsv() {
    const csv = "Tên,SKU,ĐVT,GiáVốn,GiáBán,Màu,Size\n"
      + "Ghế mẫu (không biến thể),GM-001,cái,500000,800000,,\n"
      + "Áo mẫu (có biến thể),,cái,100000,150000,Đen,M\n"
      + "Áo mẫu (có biến thể),,cái,100000,150000,Trắng,L\n";
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mau_nhap_san_pham.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // Nhập tồn kho đầu kỳ: cột Kho, Mã hàng, Tên hàng, ĐVT, Số lượng, Giá vốn.
  // Tự tạo kho/sản phẩm nếu chưa có, SET số lượng tồn tuyệt đối (không cộng dồn) — chạy lại
  // không bị nhân đôi tồn kho, ghi audit trail bằng phiếu điều chỉnh.
  async function handleImportStockFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingStock(true); setImportStockResult(null); setError("");
    try {
      const rows = await readCsvFile(file);
      const payload = rows.map((r) => ({
        warehouse: r["Kho"], sku: r["Mã hàng"], name: r["Tên hàng"],
        unit: r["ĐVT"], qty: r["Số lượng"], cost: r["Giá vốn"],
      }));
      const result = await inventoryService.importOpeningStock(payload);
      setImportStockResult(result);
      reload();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setImportingStock(false);
      e.target.value = "";
    }
  }

  function downloadSampleStockCsv() {
    const csv = "Kho,Mã hàng,Tên hàng,ĐVT,Số lượng,Giá vốn\n"
      + "Kho chính,SP-001,Bàn ghế văn phòng,bộ,10,500000\n"
      + "Kho chính,SP-002,Ghế xoay,cái,25,300000\n";
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mau_nhap_ton_kho_dau_ky.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <Toolbar
        title="Nhập - Xuất - Tồn"
        actions={can("inventory_edit") && (
          <>
            <ToolbarButton onClick={() => setModal("product")}>+ Sản phẩm</ToolbarButton>
            <ToolbarButton variant="danger" onClick={() => setModal("outbound")}>+ Xuất hàng</ToolbarButton>
            <ToolbarButton onClick={() => setModal("adjust")}>Điều chỉnh</ToolbarButton>
            <ToolbarButton onClick={() => setModal("transfer")}>Luân chuyển</ToolbarButton>
            <ToolbarButton onClick={downloadSampleCsv}>Tải mẫu CSV</ToolbarButton>
            <label className="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 cursor-pointer hover:bg-slate-50">
              {importing ? "Đang nhập…" : "Nhập CSV sản phẩm"}
              <input type="file" accept=".csv" onChange={handleImportFile} disabled={importing} className="hidden" />
            </label>
            <ToolbarButton onClick={downloadSampleStockCsv}>Tải mẫu CSV tồn kho</ToolbarButton>
            <label className="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 cursor-pointer hover:bg-slate-50">
              {importingStock ? "Đang nhập…" : "Nhập CSV tồn kho đầu kỳ"}
              <input type="file" accept=".csv" onChange={handleImportStockFile} disabled={importingStock} className="hidden" />
            </label>
          </>
        )}
      />
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      {importResult && (
        <div className={`text-sm rounded-lg px-3 py-2 space-y-1 ${importResult.failed.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
          <div>Đã tạo {importResult.ok} sản phẩm. {importResult.failed.length > 0 ? `${importResult.failed.length} lỗi:` : ""}</div>
          {importResult.failed.map((f, i) => <div key={i} className="text-xs">{f}</div>)}
        </div>
      )}
      {importStockResult && (
        <div className={`text-sm rounded-lg px-3 py-2 space-y-1 ${importStockResult.failed.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
          <div>Tồn kho: tạo mới {importStockResult.created}, cập nhật {importStockResult.updated}. {importStockResult.failed.length > 0 ? `${importStockResult.failed.length} lỗi:` : ""}</div>
          {importStockResult.failed.map((f, i) => <div key={i} className="text-xs">{f}</div>)}
        </div>
      )}

      <div className="flex gap-1">
        {[["stock", "Tồn kho"], ["movements", "Lịch sử"], ["products", "Sản phẩm"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium ${tab === id ? "bg-indigo-50 text-indigo-700" : "text-slate-500"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <div className="space-y-2">
          <input value={stockSearch} onChange={(e) => setStockSearch(e.target.value)} placeholder="Tìm theo tên hoặc mã SKU…"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full max-w-xs" />
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-400 text-xs">
              <th className="py-2 px-3">Mã SP</th><th className="py-2 px-3">Sản phẩm</th><th className="py-2 px-3">Kho</th>
              <th className="py-2 px-3 text-right">Tồn</th><th className="py-2 px-3">ĐVT</th><th className="py-2 px-3 text-right">Giá vốn</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {stock.filter((s) => !stockSearch ||
                s.product_name.toLowerCase().includes(stockSearch.toLowerCase()) ||
                (s.sku || "").toLowerCase().includes(stockSearch.toLowerCase()) ||
                (s.variant_sku || "").toLowerCase().includes(stockSearch.toLowerCase())
              ).map((s) => (
                <tr key={s.id}>
                  <td className="py-2 px-3">{s.variant_sku || s.sku || "—"}</td>
                  <td className="py-2 px-3">{s.product_name}{s.variant_attrs && <span className="text-slate-400"> ({attrsLabel(s.variant_attrs)})</span>}</td>
                  <td className="py-2 px-3 text-slate-500">{s.warehouse_name}</td>
                  <td className="py-2 px-3 text-right font-medium">{s.qty}</td>
                  <td className="py-2 px-3 text-slate-500">{s.unit}</td>
                  <td className="py-2 px-3 text-right">{fmt(s.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stock.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có tồn kho.</p>}
          </div>
        </div>
      )}

      {tab === "movements" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-400 text-xs">
              <th className="py-2 px-3">Mã phiếu</th><th className="py-2 px-3">Loại</th><th className="py-2 px-3">Sản phẩm</th>
              <th className="py-2 px-3">Kho</th><th className="py-2 px-3 text-right">SL</th><th className="py-2 px-3">Đối tượng</th><th className="py-2 px-3">Ngày</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 px-3 font-medium">{m.code}</td>
                  <td className="py-2 px-3 text-slate-500">{TYPE_LABEL[m.type] || m.type}</td>
                  <td className="py-2 px-3">{m.product_name}{m.variant_attrs && <span className="text-slate-400"> ({attrsLabel(m.variant_attrs)})</span>}</td>
                  <td className="py-2 px-3 text-slate-500">{m.warehouse_name}</td>
                  <td className={`py-2 px-3 text-right font-medium ${Number(m.qty_change) > 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {Number(m.qty_change) > 0 ? "+" : ""}{m.qty_change}
                  </td>
                  <td className="py-2 px-3 text-slate-500">{m.partner_name || "—"}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-slate-400">{new Date(m.created_at).toLocaleString("vi-VN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {movements.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có biến động kho.</p>}
        </div>
      )}

      {tab === "products" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-400 text-xs">
              <th className="py-2 px-3">Mã</th><th className="py-2 px-3">Tên</th><th className="py-2 px-3">ĐVT</th>
              <th className="py-2 px-3 text-right">Giá vốn</th><th className="py-2 px-3 text-right">Giá bán</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <>
                  <tr key={p.id} className={p.has_variants ? "bg-slate-50/60" : ""}>
                    <td className="py-2 px-3">{p.sku || "—"}</td>
                    <td className="py-2 px-3 font-medium">{p.name}{p.has_variants && <span className="ml-2 text-xs text-indigo-500 font-normal">{p.variants?.length || 0} biến thể</span>}</td>
                    <td className="py-2 px-3 text-slate-500">{p.unit}</td>
                    <td className="py-2 px-3 text-right">{fmt(p.cost)}</td>
                    <td className="py-2 px-3 text-right">{fmt(p.price)}</td>
                  </tr>
                  {p.has_variants && p.variants?.map((v) => (
                    <tr key={v.id} className="text-slate-500">
                      <td className="py-1.5 px-3 pl-6">{v.sku || "—"}</td>
                      <td className="py-1.5 px-3 pl-6 text-xs">↳ {attrsLabel(v.attrs)}</td>
                      <td className="py-1.5 px-3"></td>
                      <td className="py-1.5 px-3 text-right">{fmt(v.cost)}</td>
                      <td className="py-1.5 px-3 text-right">{fmt(v.price)}</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
          {products.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có sản phẩm.</p>}
        </div>
      )}

      {modal === "product" && <ProductModal onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal === "outbound" && <StockMoveModal mode="outbound" products={products} warehouses={warehouses} partners={partners} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal === "adjust" && <AdjustModal products={products} warehouses={warehouses} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal === "transfer" && <TransferModal products={products} warehouses={warehouses} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </div>
  );
}

// Bộ chọn sản phẩm + biến thể (nếu SP có biến thể, bắt buộc chọn 1 biến thể cụ thể).
function ProductVariantPicker({ products, productId, variantId, onChangeProduct, onChangeVariant }) {
  const product = products.find((p) => String(p.id) === String(productId));
  return (
    <>
      <div><label className="text-xs text-slate-500">Sản phẩm</label>
        <select value={productId} onChange={(e) => onChangeProduct(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="">— Chọn —</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></div>
      {product?.has_variants && (
        <div><label className="text-xs text-slate-500">Biến thể</label>
          <select value={variantId} onChange={(e) => onChangeVariant(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">— Chọn biến thể —</option>
            {product.variants.map((v) => <option key={v.id} value={v.id}>{attrsLabel(v.attrs)}</option>)}
          </select></div>
      )}
    </>
  );
}

function ProductModal({ onClose, onSaved }) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("cái");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [hasVariants, setHasVariants] = useState(false);
  const [axisName, setAxisName] = useState("");
  const [axisValues, setAxisValues] = useState("");
  const [axes, setAxes] = useState([]); // [{name, values:[]}]
  const [matrix, setMatrix] = useState([]); // [{attrs, sku, price, cost}]
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function addAxis() {
    if (!axisName.trim() || !axisValues.trim()) return;
    setAxes((prev) => [...prev, { name: axisName.trim(), values: axisValues.split(",").map((v) => v.trim()).filter(Boolean) }]);
    setAxisName(""); setAxisValues("");
  }

  function buildMatrix() {
    if (!axes.length) return;
    let combos = [{}];
    for (const axis of axes) {
      const next = [];
      for (const combo of combos) for (const val of axis.values) next.push({ ...combo, [axis.name]: val });
      combos = next;
    }
    setMatrix(combos.map((attrs) => ({ attrs, sku: "", price: Number(price) || 0, cost: Number(cost) || 0 })));
  }

  function updateRow(idx, field, value) {
    setMatrix((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  async function submit(e) {
    e.preventDefault();
    if (!name) return setError("Thiếu tên sản phẩm");
    if (hasVariants && matrix.length === 0) return setError('Chưa có biến thể — bấm "Tạo bảng biến thể" trước');
    setSaving(true);
    try {
      await inventoryService.createProduct({
        sku: hasVariants ? null : (sku || null), name, unit,
        cost: hasVariants ? matrix[0].cost : Number(cost) || 0,
        price: hasVariants ? matrix[0].price : Number(price) || 0,
        hasVariants, options: hasVariants ? axes : [],
        variants: hasVariants ? matrix.map((m) => ({ sku: m.sku || null, attrs: m.attrs, price: Number(m.price) || 0, cost: Number(m.cost) || 0 })) : [],
      });
      onSaved();
    } catch (e2) { setError(e2.message); } finally { setSaving(false); }
  }

  return (
    <Modal title="Thêm sản phẩm" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div><label className="text-xs text-slate-500">Tên sản phẩm</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Đơn vị tính</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={hasVariants} onChange={(e) => { setHasVariants(e.target.checked); setMatrix([]); }} />
          Sản phẩm có biến thể (màu/size/...)
        </label>

        {!hasVariants && (
          <>
            <div><label className="text-xs text-slate-500">Mã SKU (tuỳ chọn)</label>
              <input value={sku} onChange={(e) => setSku(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-500">Giá vốn</label>
                <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="text-xs text-slate-500">Giá bán</label>
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
            </div>
          </>
        )}

        {hasVariants && (
          <div className="space-y-2 border border-slate-100 rounded-lg p-3 bg-slate-50/50">
            <div className="text-xs font-medium text-slate-600">Thuộc tính biến thể</div>
            <div className="flex gap-2">
              <input value={axisName} onChange={(e) => setAxisName(e.target.value)} placeholder="Tên (VD: Màu)"
                className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
              <input value={axisValues} onChange={(e) => setAxisValues(e.target.value)} placeholder="Giá trị, phân cách bằng dấu phẩy (VD: Đen, Trắng)"
                className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
              <button type="button" onClick={addAxis} className="text-indigo-600 text-xs font-medium">+ Thêm</button>
            </div>
            {axes.map((a, i) => <div key={i} className="text-xs text-slate-500">{a.name}: {a.values.join(", ")}</div>)}
            {axes.length > 0 && (
              <button type="button" onClick={buildMatrix} className="text-xs font-medium text-indigo-600 underline">
                Tạo bảng biến thể ({axes.reduce((s, a) => (s ? s * a.values.length : a.values.length), 0)} biến thể)
              </button>
            )}
            {matrix.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs mt-2">
                  <thead><tr className="text-left text-slate-400">
                    <th className="py-1">Thuộc tính</th><th className="py-1">SKU</th><th className="py-1">Giá vốn</th><th className="py-1">Giá bán</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {matrix.map((m, idx) => (
                      <tr key={idx}>
                        <td className="py-1 pr-2">{attrsLabel(m.attrs)}</td>
                        <td className="py-1 pr-2"><input value={m.sku} onChange={(e) => updateRow(idx, "sku", e.target.value)} className="w-20 border border-slate-200 rounded px-1 py-0.5" /></td>
                        <td className="py-1 pr-2"><input type="number" value={m.cost} onChange={(e) => updateRow(idx, "cost", e.target.value)} className="w-20 border border-slate-200 rounded px-1 py-0.5" /></td>
                        <td className="py-1 pr-2"><input type="number" value={m.price} onChange={(e) => updateRow(idx, "price", e.target.value)} className="w-20 border border-slate-200 rounded px-1 py-0.5" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">{saving ? "Đang lưu…" : "Thêm"}</button>
        </div>
      </form>
    </Modal>
  );
}

function StockMoveModal({ mode, products, warehouses, partners, onClose, onSaved }) {
  const isInbound = mode === "inbound";
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [settlement, setSettlement] = useState("cash");
  const [method, setMethod] = useState("Tiền mặt");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const relevantPartners = partners.filter((p) => p.type === (isInbound ? "supplier" : "customer") || p.type === "other");
  const product = products.find((p) => String(p.id) === String(productId));

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!productId || !warehouseId || !qty || Number(qty) <= 0) return setError("Thiếu thông tin");
    if (product?.has_variants && !variantId) return setError("Vui lòng chọn biến thể");
    setSaving(true);
    try {
      const payload = {
        productId, variantId: variantId || null, warehouseId, qty: Number(qty), partnerId: partnerId || null,
        settlement, method, note: note || null,
        ...(isInbound ? { unitCost: Number(unitPrice) || 0 } : { unitPrice: Number(unitPrice) || 0 }),
      };
      await (isInbound ? inventoryService.inbound(payload) : inventoryService.outbound(payload));
      onSaved();
    } catch (e2) { setError(e2.message); } finally { setSaving(false); }
  }

  return (
    <Modal title={isInbound ? "Phiếu nhập hàng" : "Phiếu xuất hàng"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <ProductVariantPicker products={products} productId={productId} variantId={variantId}
          onChangeProduct={(v) => { setProductId(v); setVariantId(""); }} onChangeVariant={setVariantId} />
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-500">Kho</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select></div>
          <div><label className="text-xs text-slate-500">Số lượng</label>
            <input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        <div><label className="text-xs text-slate-500">{isInbound ? "Giá nhập / đơn vị" : "Giá bán / đơn vị"}</label>
          <input type="number" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-slate-500">{isInbound ? "Nhà cung cấp" : "Khách hàng"} (tuỳ chọn)</label>
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">— Không chọn —</option>
            {relevantPartners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        {partnerId && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-500">Hình thức thanh toán</label>
              <select value={settlement} onChange={(e) => setSettlement(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="cash">Thanh toán ngay</option>
                <option value="debt">Ghi nợ</option>
              </select></div>
            {settlement === "cash" && (
              <div><label className="text-xs text-slate-500">Phương thức</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option>Tiền mặt</option><option>Chuyển khoản</option>
                </select></div>
            )}
          </div>
        )}
        <div><label className="text-xs text-slate-500">Ghi chú</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">{saving ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </form>
    </Modal>
  );
}

function AdjustModal({ products, warehouses, onClose, onSaved }) {
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const [qtyChange, setQtyChange] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const product = products.find((p) => String(p.id) === String(productId));

  async function submit(e) {
    e.preventDefault();
    if (!productId || !warehouseId || !qtyChange) return setError("Thiếu thông tin");
    if (product?.has_variants && !variantId) return setError("Vui lòng chọn biến thể");
    setSaving(true);
    try {
      await inventoryService.adjust({ productId, variantId: variantId || null, warehouseId, qtyChange: Number(qtyChange), note: note || null });
      onSaved();
    } catch (e2) { setError(e2.message); } finally { setSaving(false); }
  }

  return (
    <Modal title="Điều chỉnh tồn kho" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <ProductVariantPicker products={products} productId={productId} variantId={variantId}
          onChangeProduct={(v) => { setProductId(v); setVariantId(""); }} onChangeVariant={setVariantId} />
        <div><label className="text-xs text-slate-500">Kho</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select></div>
        <div><label className="text-xs text-slate-500">Số lượng điều chỉnh (âm = giảm)</label>
          <input type="number" value={qtyChange} onChange={(e) => setQtyChange(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Lý do</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">{saving ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </form>
    </Modal>
  );
}

function TransferModal({ products, warehouses, onClose, onSaved }) {
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState(warehouses[0]?.id || "");
  const [toWarehouseId, setToWarehouseId] = useState(warehouses[1]?.id || warehouses[0]?.id || "");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const product = products.find((p) => String(p.id) === String(productId));

  async function submit(e) {
    e.preventDefault();
    if (!productId || !fromWarehouseId || !toWarehouseId || !qty) return setError("Thiếu thông tin");
    if (product?.has_variants && !variantId) return setError("Vui lòng chọn biến thể");
    setSaving(true);
    try {
      await inventoryService.transfer({ productId, variantId: variantId || null, fromWarehouseId, toWarehouseId, qty: Number(qty), note: note || null });
      onSaved();
    } catch (e2) { setError(e2.message); } finally { setSaving(false); }
  }

  return (
    <Modal title="Luân chuyển kho" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <ProductVariantPicker products={products} productId={productId} variantId={variantId}
          onChangeProduct={(v) => { setProductId(v); setVariantId(""); }} onChangeVariant={setVariantId} />
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-500">Từ kho</label>
            <select value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select></div>
          <div><label className="text-xs text-slate-500">Đến kho</label>
            <select value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select></div>
        </div>
        <div><label className="text-xs text-slate-500">Số lượng</label>
          <input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Ghi chú</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">{saving ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </form>
    </Modal>
  );
}
