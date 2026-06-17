// Escape HTML phía client (vd preview hoá đơn). Backend cũng escape khi render thật.
const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (v) =>
  v == null ? "" : String(v).replace(/[&<>"']/g, (c) => MAP[c]);
