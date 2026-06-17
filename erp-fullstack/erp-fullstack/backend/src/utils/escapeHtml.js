// Escape HTML để chống XSS khi render hoá đơn (yêu cầu #12).
// Mọi dữ liệu do người dùng nhập (tên KH, tên SP, ghi chú...) phải đi qua hàm này
// trước khi nhúng vào chuỗi HTML của hoá đơn.
const MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;",
  "`": "&#x60;",
};

export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`/]/g, (ch) => MAP[ch]);
}
