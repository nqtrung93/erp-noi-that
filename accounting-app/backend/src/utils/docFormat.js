import { query } from "../config/db.js";

// Định dạng số phiếu tuỳ chỉnh được (Cài đặt → Định dạng số phiếu): mỗi loại có tiền tố + số chữ số đệm.
// Phần số vẫn lấy từ sequence Postgres (đảm bảo không trùng/atomic) — chỉ đổi cách HIỂN THỊ (prefix/pad).
export const DEFAULT_DOC_FORMATS = {
  orders: { label: "Đơn bán hàng", prefix: "ORD", pad: 6, seq: "order_seq" },
  inbound: { label: "Phiếu nhập hàng", prefix: "PN", pad: 6, seq: "stock_seq" },
  outbound: { label: "Phiếu xuất hàng", prefix: "PX", pad: 6, seq: "stock_seq" },
  adjust: { label: "Phiếu điều chỉnh tồn", prefix: "PDC", pad: 6, seq: "stock_seq" },
  transfer: { label: "Phiếu luân chuyển kho", prefix: "PXK", pad: 6, seq: "stock_seq" },
  transaction: { label: "Phiếu thu/chi", prefix: "TX", pad: 6, seq: "tx_seq" },
  debt: { label: "Phiếu ghi nợ", prefix: "GN", pad: 6, seq: "debt_seq" },
  payslip: { label: "Bảng lương", prefix: "BL", pad: 6, seq: "payslip_seq" },
};

let cache = null;
export async function getDocFormats() {
  if (cache) return cache;
  const { rows } = await query(`SELECT value FROM app_settings WHERE key = 'doc_formats'`);
  const overrides = rows[0]?.value ? JSON.parse(rows[0].value) : {};
  const merged = {};
  for (const [type, def] of Object.entries(DEFAULT_DOC_FORMATS)) {
    merged[type] = { ...def, ...(overrides[type] || {}) };
  }
  cache = merged;
  return merged;
}

export function clearDocFormatsCache() {
  cache = null;
}

// Sinh số phiếu kế tiếp cho 1 loại, dùng client đang trong transaction để atomic với sequence.
export async function nextDocNo(client, type) {
  const formats = await getDocFormats();
  const f = formats[type];
  if (!f) throw new Error(`Loại phiếu không hợp lệ: ${type}`);
  const { rows } = await client.query(`SELECT nextval($1) AS n`, [f.seq]);
  const num = String(rows[0].n).padStart(Number(f.pad) || 6, "0");
  return `${f.prefix}-${num}`;
}
