// Sidebar trái cố định theo nhóm module, phong cách giống MISA SME (sidebar tối, mục active có viền nhấn).
export default function Sidebar({ groups, activeId, onSelect, collapsed, onToggleCollapse }) {
  return (
    <aside className={`bg-slate-900 text-slate-300 flex flex-col h-screen sticky top-0 transition-all ${collapsed ? "w-20" : "w-72"}`}>
      <div className="flex items-center justify-between px-4 py-5 border-b border-slate-700/60">
        {!collapsed && <span className="font-bold text-white text-lg tracking-wide">KẾ TOÁN NỘI BỘ</span>}
        <button onClick={onToggleCollapse} className="text-slate-400 hover:text-white text-base px-1">
          {collapsed ? "»" : "«"}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            {!collapsed && (
              <div className="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const active = item.id === activeId;
              return (
                <button key={item.id} onClick={() => onSelect(item.id)} title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-4 py-4 text-lg text-left border-l-4 transition-colors ${
                    active
                      ? "bg-slate-800 border-sky-400 text-white font-semibold"
                      : "border-transparent text-slate-300 hover:bg-slate-800/60 hover:text-white"
                  }`}>
                  <span className="text-2xl leading-none flex-none w-7 text-center">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
