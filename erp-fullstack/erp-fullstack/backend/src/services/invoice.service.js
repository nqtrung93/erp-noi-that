import { escapeHtml } from "../utils/escapeHtml.js";
import { getOrderById } from "./order.service.js";
import { query } from "../config/db.js";
import { DEFAULT_TEMPLATES, renderTemplate } from "../utils/printTemplates.js";

const fmt = (n) => Number(n || 0).toLocaleString("vi-VN") + " ₫";

// Lấy mẫu in hiện hành cho 1 loại phiếu (custom đã lưu ở Cài đặt → Mẫu in, hoặc mặc định).
export async function getTemplate(type) {
  const { rows } = await query(`SELECT value FROM app_settings WHERE key = $1`, [`tpl_${type}`]);
  return rows[0]?.value || DEFAULT_TEMPLATES[type];
}

// Thông tin công ty (Cài đặt → Thông tin công ty) — chèn vào đầu mọi phiếu in dưới dạng placeholder.
// address hỗ trợ nhiều dòng (VD: "Địa chỉ HN: ...\nĐịa chỉ HCM: ...") — giữ line break khi in.
export async function getCompanyHeaderData() {
  const [companyRow, logoRow] = await Promise.all([
    query(`SELECT value FROM app_settings WHERE key = 'company_info'`),
    query(`SELECT value FROM app_settings WHERE key = 'logo'`),
  ]);
  const info = companyRow.rows[0]?.value ? JSON.parse(companyRow.rows[0].value) : {};
  const logo = logoRow.rows[0]?.value || null;
  const addressLines = (info.address || "").split("\n").filter(Boolean).map((l) => escapeHtml(l)).join("<br>");

  const infoLines = [
    addressLines,
    info.phone ? `<b>Điện thoại:</b> ${escapeHtml(info.phone)}` : "",
    info.website ? `<b>Website:</b> ${escapeHtml(info.website)}` : "",
    info.email ? `<b>Email:</b> ${escapeHtml(info.email)}` : "",
    info.taxCode ? `<b>MST:</b> ${escapeHtml(info.taxCode)}` : "",
  ].filter(Boolean).map((l) => `<div>${l}</div>`).join("");

  return {
    companyName: escapeHtml(info.name || ""),
    companyAddress: addressLines,
    companyPhone: escapeHtml(info.phone || ""),
    companyWebsite: escapeHtml(info.website || ""),
    companyEmail: escapeHtml(info.email || ""),
    companyTaxCode: escapeHtml(info.taxCode || ""),
    companyLogoImg: logo ? `<img src="${logo}" alt="Logo" class="company-logo">` : "",
    companyHeaderLine: info.name || logo
      ? `<div class="company-header">
          ${logo ? `<img src="${logo}" alt="Logo" class="company-logo">` : ""}
          <div>${info.name ? `<div class="company-name">${escapeHtml(info.name)}</div>` : ""}${infoLines}</div>
        </div>`
      : "",
  };
}

// Sinh HTML hoá đơn (dạng "Chi tiết đơn hàng" — theo mẫu công ty cung cấp).
// MỌI dữ liệu người dùng đều qua escapeHtml (#12) để chống XSS.
export async function renderInvoiceHtml(orderId) {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Đơn không tồn tại");

  const customer = order.customer_id
    ? (await query(`SELECT * FROM customers WHERE id = $1`, [order.customer_id])).rows[0]
    : null;

  // Mã sản phẩm hiển thị: SKU biến thể > SKU sản phẩm > mã sản phẩm (SP-xxxxxx).
  const itemRows = (await query(
    `SELECT oi.*, p.code AS product_code, p.sku AS product_sku, v.sku AS variant_sku
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_variants v ON v.id = oi.variant_id
      WHERE oi.order_id = $1`,
    [orderId]
  )).rows;

  const rowsHtml = itemRows
    .map(
      (it) => `
      <tr>
        <td>${escapeHtml(it.variant_sku || it.product_sku || it.product_code || "—")}</td>
        <td>${escapeHtml(it.name)}</td>
        <td style="text-align:center">${escapeHtml(it.qty)}</td>
        <td style="text-align:right">${fmt(it.price_at_sale * it.qty)}</td>
      </tr>`
    )
    .join("");

  const shippingMethod = order.is_ecommerce
    ? "TMĐT"
    : order.delivery_method === "self"
      ? "Tự giao hàng"
      : (order.carrier || "Đơn vị vận chuyển");

  const tpl = await getTemplate("invoice");
  return renderTemplate(tpl, {
    ...(await getCompanyHeaderData()),
    code: escapeHtml(order.code),
    date: escapeHtml(new Date(order.created_at).toLocaleDateString("vi-VN")),
    customerName: escapeHtml(customer?.name || "Khách lẻ"),
    customerPhone: escapeHtml(customer?.phone || ""),
    customerAddress: escapeHtml(customer?.address || ""),
    rowsHtml,
    subtotal: fmt(order.subtotal),
    shippingOrVatLine: [
      order.discount > 0 ? `<div class="row"><span>Giảm giá:</span><span>− ${fmt(order.discount)}</span></div>` : "",
      order.shipping > 0 ? `<div class="row"><span>Phí vận chuyển:</span><span>${fmt(order.shipping)}</span></div>` : "",
      order.vat_rate > 0 ? `<div class="row"><span>VAT (${escapeHtml(order.vat_rate)}%, đã gồm trong giá):</span><span>${fmt(order.vat_amount)}</span></div>` : "",
    ].join(""),
    total: fmt(order.total),
    paid: fmt(order.paid),
    due: fmt(Math.max(Number(order.total) - Number(order.paid), 0)),
    paymentMethod: escapeHtml(order.payment || "—"),
    shippingMethod: escapeHtml(shippingMethod),
    noteLine: order.note ? `<p class="muted">Ghi chú: ${escapeHtml(order.note)}</p>` : "",
  });
}
