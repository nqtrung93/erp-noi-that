// Modal responsive: full màn hình trên mobile, hộp giữa trên desktop.
export default function Modal({ title, onClose, children, wide }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center bg-black/40 md:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white shadow-2xl w-full h-full md:h-auto ${wide ? "md:max-w-2xl" : "md:max-w-lg"} md:max-h-[90vh] rounded-none md:rounded-2xl flex flex-col`}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 flex-none">
          <h3 className="font-bold text-slate-800 text-base md:text-lg">{title}</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-400">✕</button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}
