import SearchSelect from "./SearchSelect.jsx";

function attrsLabel(attrs) {
  return Object.values(attrs || {}).join(" / ");
}

// Chọn sản phẩm (+ biến thể nếu có) cho 1 dòng đơn hàng/đơn mua — gõ tên hoặc SKU để tìm,
// hiển thị luôn tồn kho hiện tại ở kho đã chọn để biết còn hàng không trước khi chốt đơn.
export default function ProductLinePicker({ products, stock, warehouseId, productId, variantId, onChangeProduct, onChangeVariant }) {
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
    </>
  );
}
