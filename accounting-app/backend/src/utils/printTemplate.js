import { query } from "../config/db.js";

export const DEFAULT_INVOICE_TEMPLATE = `
<html><head><meta charset="utf-8"><title>Hoá đơn {{code}}</title></head>
<body style="font-family: sans-serif; padding: 24px;">
  <h2>{{companyName}}</h2>
  <p style="color:#666; margin-top:-8px;">{{companyAddress}} {{companyPhone}}</p>
  <h3>HOÁ ĐƠN BÁN HÀNG — {{code}}</h3>
  <p>Khách hàng: {{customerName}}</p>
  <p>Ngày: {{date}}</p>
  <table style="width:100%; border-collapse: collapse;" border="1" cellpadding="6">
    <thead><tr><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
    <tbody>{{rowsHtml}}</tbody>
  </table>
  <p style="text-align:right; margin-top:12px;">
    Tạm tính: {{subtotal}} đ<br/>
    Giảm giá: {{discount}} đ<br/>
    VAT ({{vatRate}}%): {{vatAmount}} đ<br/>
    Phí ship: {{shippingFee}} đ<br/>
    <strong>Tổng cộng: {{total}} đ</strong><br/>
    Đã thanh toán: {{paid}} đ<br/>
    Còn lại: {{due}} đ
  </p>
</body></html>
`;

function escapeAttrs(attrs) {
  if (!attrs || !Object.keys(attrs).length) return "";
  return ` (${Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join(", ")})`;
}

export async function renderInvoiceHtml(order, items) {
  const companyRow = (await query(`SELECT value FROM app_settings WHERE key = 'company_info'`)).rows[0];
  const company = companyRow?.value ? JSON.parse(companyRow.value) : {};
  const tplRow = (await query(`SELECT value FROM app_settings WHERE key = 'tpl_invoice'`)).rows[0];
  const template = tplRow?.value || DEFAULT_INVOICE_TEMPLATE;

  const rowsHtml = items.map((it) => `
    <tr>
      <td>${it.product_name}${escapeAttrs(it.variant_attrs)}</td>
      <td style="text-align:right">${it.qty}</td>
      <td style="text-align:right">${Number(it.price).toLocaleString("vi-VN")}</td>
      <td style="text-align:right">${(Number(it.qty) * Number(it.price)).toLocaleString("vi-VN")}</td>
    </tr>`).join("");

  const due = Number(order.total) - Number(order.paid);
  const values = {
    code: order.code,
    date: new Date(order.created_at).toLocaleString("vi-VN"),
    customerName: order.customer_name || "Khách lẻ",
    rowsHtml,
    subtotal: Number(order.subtotal).toLocaleString("vi-VN"),
    discount: Number(order.discount).toLocaleString("vi-VN"),
    vatRate: Number(order.vat_rate || 0),
    vatAmount: Number(order.vat_amount || 0).toLocaleString("vi-VN"),
    shippingFee: Number(order.shipping_fee || 0).toLocaleString("vi-VN"),
    total: Number(order.total).toLocaleString("vi-VN"),
    paid: Number(order.paid).toLocaleString("vi-VN"),
    due: due.toLocaleString("vi-VN"),
    companyName: company.name || "",
    companyAddress: company.address || "",
    companyPhone: company.phone || "",
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
}
