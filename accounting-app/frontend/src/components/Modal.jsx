const SIZES = { md: "max-w-md", lg: "max-w-2xl" };

// size="xl" dùng panel trượt từ bên phải, che gần hết chiều rộng/cao màn hình — dành cho các
// form phức tạp (tạo/sửa/xem đơn hàng...) cần nhiều không gian hơn modal căn giữa thông thường.
export default function Modal({ title, onClose, children, size = "md" }) {
  if (size === "xl") {
    return (
      <div className="fixed inset-0 bg-black/30 flex justify-end z-50">
        <div className="bg-white shadow-2xl h-full w-full sm:w-[97%] md:w-[94%] lg:w-[90%] sm:rounded-l-2xl p-7 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 text-xl">{title}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-lg w-full ${SIZES[size] || SIZES.md} p-7 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 text-xl">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
