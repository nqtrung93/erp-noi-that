import { useState } from "react";
import SearchSelect from "./SearchSelect.jsx";
import Modal from "./Modal.jsx";
import MoneyInput from "./MoneyInput.jsx";
import * as inventoryService from "../services/inventory.service.js";

function attrsLabel(attrs) {
  return Object.values(attrs || {}).join(" / ");
}

// Chọn sản phẩm (+ biến thể nếu có) cho 1 dòng đơn hàng/đơn mua — gõ tên hoặc SKU để tìm,
// hiển thị luôn tồn kho hiện tại ở kho đã chọn để biết còn hàng không trước khi chốt đơn.
// Có nút "+ Mới" để tạo nhanh sản phẩm chưa có trong danh mục, tự chọn vào dòng này luôn.
export default function ProductLinePicker({ products, stock, warehouseId, productId, variantId, onChangeProduct, onChangeVariant, onProductCreated }) {
  const [creating, setCreating] = useState(false);
  const product = products.find((p) => String(p.id) === String(productId));

  function stockQty(pId, vId) {
    const row = stock.find((s) =>
      String(s.product_id) === String(pId) &&
      String(s.variant_id || "") === String(vId || "") &&
      String(s.warehouse_id) === String(warehouseId)
    );
    return row ? Number(row.qty) : 0;
  }

  return (
    <>
      <SearchSelect
        className="flex-1 min-w-[160px]"
        options={products}
        value={productId}
        onChange={onChangeProduct}
        getLabel={(p) => p.name}
        getValue={(p) => p.id}
        getSearchText={(p) => `${p.name} ${p.sku || ""}`}
        placeholder="Tìm sản phẩm theo tên/SKU…"
        renderOption={(p) => (
          <div className="flex justify-between gap-2">
            <span>{p.name}{p.sku ? <span className="text-slate-400"> ({p.sku})</span> : ""}</span>
            {!p.has_variants && <span className="text-xs text-slate-400 flex-none">Tồn: {stockQty(p.id, null)}</span>}
          </div>
        )}
      />
      {product?.has_variants && (
        <select value={variantId} onChange={(e) => onChangeVariant(e.target.value)}
          className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm min-w-[140px]">
          <option value="">— Biến thể —</option>
          {product.variants.map((v) => (
            <option key={v.id} value={v.id}>{attrsLabel(v.attrs)} (Tồn: {stockQty(product.id, v.id)})</option>
          ))}
        </select>
      )}
      {product && (!product.has_variants || variantId) && (
        <span className="text-xs text-slate-400 whitespace-nowrap">Tồn: {stockQty(product.id, variantId)}</span>
      )}
      <button type="button" onClick={() => setCreating(true)} title="Tạo sản phẩm mới"
        className="text-xs text-indigo-600 font-medium whitespace-nowrap">+ Mới</button>
      {creating && (
        <QuickAddProductModal
          onClose={() => setCreating(false)}
          onCreated={(p) => { onProductCreated(p); onChangeProduct(p.id); setCreating(false); }}
        />
      )}
    </>
  );
}

function QuickAddProductModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("cái");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return setError("Thiếu tên sản phẩm");
    setSaving(true);
    try {
      const created = await inventoryService.createProduct({
        name: name.trim(), sku: sku || null, unit, cost: Number(cost) || 0, price: Number(price) || 0,
      });
      onCreated(created);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Tạo sản phẩm mới" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div><label className="text-xs text-slate-500">Tên sản phẩm</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Mã SKU (tuỳ chọn)</label>
          <input value={sku} onChange={(e) => setSku(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Đơn vị tính</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-500">Giá vốn</label>
            <MoneyInput value={cost} onChange={setCost} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="text-xs text-slate-500">Giá bán</label>
            <MoneyInput value={price} onChange={setPrice} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu…" : "Tạo & chọn"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
