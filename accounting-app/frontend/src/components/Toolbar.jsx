// Toolbar kiểu MISA: tiêu đề trang bên trái, ô tìm kiếm + nút hành động bên phải.
export default function Toolbar({ title, search, onSearchChange, searchPlaceholder, actions, filters }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 mb-3 flex flex-wrap items-center gap-3">
      {title && <h2 className="font-semibold text-slate-700 text-base flex-none">{title}</h2>}
      {onSearchChange && (
        <input value={search} onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder || "Tìm kiếm…"}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px] max-w-xs" />
      )}
      {filters}
      {actions && <div className="flex items-center gap-2 ml-auto">{actions}</div>}
    </div>
  );
}

export function ToolbarButton({ children, onClick, variant = "default", type = "button" }) {
  const styles = {
    default: "border border-slate-200 text-slate-600 hover:bg-slate-50",
    primary: "bg-sky-600 text-white hover:bg-sky-700",
    danger: "bg-red-500 text-white hover:bg-red-600",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
  };
  return (
    <button type={type} onClick={onClick}
      className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${styles[variant]}`}>
      {children}
    </button>
  );
}
