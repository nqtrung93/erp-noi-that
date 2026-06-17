import { escapeHtml } from "../utils/escapeHtml.js";
import { getOrderById } from "./order.service.js";
import { query } from "../config/db.js";

const fmt = (n) => Number(n || 0).toLocaleString("vi-VN") + " ₫";

// Sinh HTML hoá đơn. MỌI dữ liệu người dùng đều qua escapeHtml (#12) để chống XSS.
export async function renderInvoiceHtml(orderId) {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Đơn không tồn tại");

  const customer = order.customer_id
    ? (await query(`SELECT * FROM customers WHERE id = $1`, [order.customer_id])).rows[0]
    : null;
  const wh = (await query(`SELECT * FROM warehouses WHERE id = $1`, [order.warehouse_id])).rows[0];

  const rows = order.items
    .map(
      (it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(it.name)}</td>
        <td style="text-align:center">${escapeHtml(it.qty)}</td>
        <td style="text-align:right">${fmt(it.price_at_sale)}</td>
        <td style="text-align:right">${fmt(it.price_at_sale * it.qty)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Hoá đơn ${escapeHtml(order.code)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:720px;margin:24px auto;padding:0 16px}
  h1{font-size:20px;margin:0 0 4px}
  table{width:100%;border-collapse:collapse;margin-top:16px}
  th,td{border-bottom:1px solid #e2e8f0;padding:8px;font-size:13px}
  th{background:#f8fafc;text-align:left}
  .muted{color:#64748b}.grand{font-weight:bold;font-size:16px}
</style></head>
<body>
  <h1>HOÁ ĐƠN BÁN HÀNG</h1>
  <div class="muted">Mã đơn: ${escapeHtml(order.code)} · Ngày: ${escapeHtml(
    new Date(order.created_at).toLocaleDateString("vi-VN")
  )}</div>
  <div class="muted">Kho: ${escapeHtml(wh?.name || "")}</div>
  <div style="margin-top:12px">
    <b>Khách hàng:</b> ${escapeHtml(customer?.name || "Khách lẻ")}<br>
    <span class="muted">${escapeHtml(customer?.phone || "")} ${escapeHtml(customer?.address || "")}</span>
  </div>
  <table>
    <thead><tr><th>#</th><th>Sản phẩm</th><th style="text-align:center">SL</th>
    <th style="text-align:right">Đơn giá</th><th style="text-align:right">Thành tiền</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:12px;text-align:right">
    <div class="muted">Tạm tính: ${fmt(order.subtotal)}</div>
    ${order.discount > 0 ? `<div class="muted">Giảm giá: − ${fmt(order.discount)}</div>` : ""}
    ${order.shipping > 0 ? `<div class="muted">Phí vận chuyển: + ${fmt(order.shipping)}</div>` : ""}
    <div class="grand">TỔNG CỘNG: ${fmt(order.total)}</div>
    ${order.vat_rate > 0 ? `<div class="muted">Trong đó VAT (${escapeHtml(order.vat_rate)}%, đã gồm trong giá): ${fmt(order.vat_amount)}</div>` : ""}
  </div>
  ${order.note ? `<p class="muted">Ghi chú: ${escapeHtml(order.note)}</p>` : ""}
</body></html>`;
}
