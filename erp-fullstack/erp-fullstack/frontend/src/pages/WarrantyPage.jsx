import { useEffect, useState } from "react";
import * as warrantiesService from "../services/warranties.service.js";
import { fmtDate } from "../utils/format.js";
import Badge from "../components/Badge.jsx";

// Tra cứu phiếu bảo hành theo mã phiếu/mã đơn/SĐT/tên khách/tên sản phẩm. Mỗi phiếu có thể có
// nhiều bộ phận với hạn khác nhau (VD: Lưới 2 năm, Khung/chân 10 năm) — phiếu được tự tạo khi
// đơn hàng chuyển "Hoàn thành", với điều kiện sản phẩm đã khai báo bộ phận bảo hành ở tab Sản phẩm.
export default function WarrantyPage() {
  const [warranties, setWarranties] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  async function reload(query = q) {
    try { setWarranties(await warrantiesService.listWarranties(query)); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(""); }, []);

  useEffect(() => {
    const t = setTimeout(() => reload(q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function printWarranty(id) {
    const html = await warrantiesService.getWarrantyPrintHtml(id);
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  async function downloadWarrantyPdf(id) {
    try { await warrantiesService.downloadWarrantyPdf(id); }
    catch (e) { alert(e.message); }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Bảo hành</h2>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
        <label className="text-xs text-slate-500 block mb-1">Tra cứu (mã phiếu BH, mã đơn, SĐT, tên khách, tên sản phẩm)</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="VD: 0901234567, ORD-000009, BH-000001..."
          className="w-full max-w-md border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      </div>

      <div className="space-y-2">
        {warranties.map((w) => {
          const parts = w.parts || [];
          const maxExpiry = parts.reduce((max, p) => (p.expiresAt > max ? p.expiresAt : max), "");
          const stillValid = maxExpiry >= today;
          return (
            <div key={w.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
                <div>
                  <div className="font-bold text-slate-800">{w.doc_no} <span className="text-xs font-normal text-slate-400">{w.order_code ? `· Đơn ${w.order_code}` : ""}</span></div>
                  <div className="text-xs text-slate-400">{w.product_name} · Bắt đầu {fmtDate(w.start_date)}</div>
                  <div className="text-xs text-slate-400">{w.customer_name || "Khách lẻ"}{w.customer_phone ? ` · ${w.customer_phone}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge label={stillValid ? "Còn hạn" : "Hết hạn"} colorClass={stillValid ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"} />
                  <button onClick={() => printWarranty(w.id)} className="border border-slate-200 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg">
                    In phiếu
                  </button>
                  <button onClick={() => downloadWarrantyPdf(w.id)} className="border border-slate-200 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg">
                    Tải PDF
                  </button>
                </div>
              </div>
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-left text-slate-400 text-xs">
                    <th className="py-1 pr-4">Bộ phận</th>
                    <th className="py-1 pr-4">Thời hạn</th>
                    <th className="py-1 pr-4">Hết hạn</th>
                    <th className="py-1"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parts.map((p, i) => {
                    const valid = p.expiresAt >= today;
                    return (
                      <tr key={i}>
                        <td className="py-1.5 pr-4">{p.name}</td>
                        <td className="py-1.5 pr-4">{p.months} tháng</td>
                        <td className="py-1.5 pr-4">{fmtDate(p.expiresAt)}</td>
                        <td className="py-1.5">
                          <Badge label={valid ? "Còn hạn" : "Hết hạn"} colorClass={valid ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
        {warranties.length === 0 && (
          <p className="text-slate-400 text-sm bg-white rounded-2xl p-6 text-center border border-slate-100">Chưa có phiếu bảo hành nào.</p>
        )}
      </div>
    </div>
  );
}
