import { useEffect, useRef, useState } from "react";

// Ô chọn có tìm kiếm: gõ để lọc danh sách, click để chọn. Dùng cho chọn khách hàng/sản phẩm
// khi danh sách dài, nơi <select> thường khó dùng vì phải cuộn tìm.
export default function SearchSelect({
  options, value, onChange, getLabel, getValue, getSearchText, renderOption, placeholder, className,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const selected = options.find((o) => String(getValue(o)) === String(value));

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = options.filter((o) => {
    if (!query) return true;
    const text = (getSearchText ? getSearchText(o) : getLabel(o)).toLowerCase();
    return text.includes(query.toLowerCase());
  });

  return (
    <div ref={wrapRef} className={`relative ${className || ""}`}>
      <input
        value={open ? query : (selected ? getLabel(selected) : "")}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setQuery(""); setOpen(true); }}
        placeholder={placeholder || "Tìm kiếm…"}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
          {filtered.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">Không tìm thấy</div>}
          {filtered.map((o) => (
            <button key={getValue(o)} type="button"
              onClick={() => { onChange(getValue(o)); setOpen(false); setQuery(""); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 block">
              {renderOption ? renderOption(o) : getLabel(o)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
