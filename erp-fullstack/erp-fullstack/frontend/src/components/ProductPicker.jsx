import { useEffect, useState } from "react";

// Ô tìm sản phẩm theo tên, màu/size (attrs) hoặc SKU — gõ để lọc, bấm hoặc dùng mũi tên lên/xuống + Enter để chọn.
// options: [{ key, label, sku, price, productId, variantId }]
export default function ProductPicker({ options, value, onSelect, className, placeholder }) {
  const selected = options.find((o) => o.key === value);
  const [query, setQuery] = useState(selected ? selected.label : "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => { setQuery(selected ? selected.label : ""); }, [value]);
  useEffect(() => { setHighlight(0); }, [query, open]);

  const q = query.trim().toLowerCase();
  const filtered = q === "" ? options : options.filter((o) =>
    o.label.toLowerCase().includes(q) || (o.sku || "").toLowerCase().includes(q)
  ).slice(0, 30);

  function pick(o) {
    onSelect(o);
    setQuery(o.label);
    setOpen(false);
  }

  return (
    <div className="relative flex-1">
      <input
        value={query}
        placeholder={placeholder || "Tìm theo tên, màu/size hoặc SKU…"}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || filtered.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((i) => (i + 1) % filtered.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((i) => (i - 1 + filtered.length) % filtered.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(filtered[highlight] || filtered[0]);
          }
        }}
        className={className}
      />
      {open && (
        <div className="absolute z-20 bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-56 overflow-y-auto w-full">
          {filtered.map((o, i) => (
            <div key={o.key}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(o)}
              className={`px-3 py-2 text-sm cursor-pointer flex justify-between gap-2 ${i === highlight ? "bg-teal-50" : "hover:bg-slate-50"}`}>
              <span>{o.label}</span>
              <span className="text-slate-400 whitespace-nowrap">
                {o.sku ? `${o.sku} · ` : ""}
                {o.stock !== undefined && <span className={o.stock > 0 ? "text-emerald-600" : "text-red-500"}>Tồn: {o.stock}</span>}
              </span>
            </div>
          ))}
          {filtered.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">Không tìm thấy sản phẩm</div>}
        </div>
      )}
    </div>
  );
}
