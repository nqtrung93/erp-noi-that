import { query } from "../config/db.js";
import { numberToVietnameseWords } from "./numberToWords.js";

// Mẫu "Phiếu xuất kho bán hàng" theo chuẩn chứng từ kế toán phổ biến (giống mẫu MISA/phần mềm
// kế toán Việt Nam): Nợ 131 (Phải thu khách hàng) / Có 5111 (Doanh thu bán hàng) là định khoản
// chuẩn cho nghiệp vụ bán hàng — hiển thị cố định cho đúng hình thức chứng từ, không phát sinh
// bút toán kế toán thật trong hệ thống (app này không làm sổ kế toán kép).
export const DEFAULT_INVOICE_TEMPLATE = `
<html><head><meta charset="utf-8"><title>{{docTitle}} {{code}}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: "Times New Roman", serif; padding: 24px; font-size: 13px; color: #111; }
  @media print { body { padding: 0; } }
  .header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
  .header img.logo { max-height: 64px; max-width: 140px; object-fit: contain; flex: none; }
  .company-name { font-weight: bold; text-transform: uppercase; font-size: 13px; }
  .company-meta { color: #444; font-size: 12px; }
  h1 { text-align: center; font-size: 18px; margin: 16px 0 2px; }
  .sub-center { text-align: center; font-size: 13px; }
  .sub-center i { font-style: italic; }
  .info-grid { display: flex; justify-content: space-between; margin: 14px 0 8px; }
  .info-grid .col { width: 60%; }
  .info-grid .col2 { width: 35%; text-align: left; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.items th, table.items td { border: 1px solid #333; padding: 5px 6px; font-size: 12.5px; }
  table.items th { background: #f2f2f2; text-align: center; }
  table.items td.num { text-align: right; }
  table.items td.center { text-align: center; }
  .totals-row td { font-weight: bold; }
  .summary { margin-top: 4px; }
  .summary .line { display: flex; justify-content: space-between; }
  .amount-words { margin-top: 10px; font-style: italic; font-weight: bold; }
  .sign-date { text-align: right; font-style: italic; margin-top: 14px; }
  .signatures { display: flex; justify-content: space-between; margin-top: 6px; text-align: center; }
  .signatures .col { width: 24%; font-weight: bold; }
  .signatures .col span { display: block; font-weight: normal; font-style: italic; font-size: 12px; }
</style>
</head>
<body>
  <div class="header">
    {{companyLogoHtml}}
    <div>
      <div class="company-name">{{companyName}}</div>
      <div class="company-meta">Địa chỉ: {{companyAddress}}</div>
      <div class="company-meta">Điện thoại: {{companyPhone}} &nbsp; Email: {{companyEmail}}</div>
      <div class="company-meta">Mã số thuế: {{companyTaxId}}</div>
    </div>
  </div>

  <h1>{{docTitle}}</h1>
  <div class="sub-center"><i>Ngày {{day}} tháng {{month}} năm {{year}}</i></div>
  <div class="sub-center">Số: <strong>{{code}}</strong></div>

  <div class="info-grid">
    <div class="col">
      {{partnerLabel}}: {{customerName}}<br/>
      Địa chỉ: {{customerAddress}}<br/>
      Điện thoại: {{customerPhone}}<br/>
      Diễn giải: {{dienGiai}}
    </div>
    <div class="col2">
      Nợ: {{debitCode}}<br/>
      Có: {{creditCode}}<br/>
      Loại tiền: VND
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>Đơn vị</th>
        <th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th>
      </tr>
    </thead>
    <tbody>{{rowsHtml}}</tbody>
    <tr class="totals-row"><td colspan="6" style="text-align:right">Cộng tiền hàng</td><td class="num">{{subtotal}}</td></tr>
  </table>

  <div class="summary">
    <div class="line" style="font-weight:bold; font-size:14px;"><span>Tổng tiền thanh toán:</span><span>{{total}}</span></div>
    <div class="line"><span>Đã thanh toán:</span><span>{{paid}}</span></div>
    <div class="line"><span>Còn lại:</span><span>{{due}}</span></div>
  </div>

  <div class="amount-words">Số tiền bằng chữ: {{amountWords}}</div>
  <div>Số chứng từ gốc kèm theo: ...</div>

  <div class="sign-date">Ngày ..... tháng ..... năm {{year}}</div>
  <div class="signatures">
    <div class="col">Người mua hàng<span>(Ký, họ tên)</span></div>
    <div class="col">Người bán hàng<span>(Ký, họ tên)</span></div>
    <div class="col">Người giao hàng<span>(Ký, họ tên)</span></div>
    <div class="col">Thủ kho<span>(Ký, họ tên)</span></div>
  </div>
</body></html>
`;

function escapeAttrs(attrs) {
  if (!attrs || !Object.keys(attrs).length) return "";
  return ` (${Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join(", ")})`;
}

function buildDienGiai(doc, verb) {
  const due = Number(doc.total) - Number(doc.paid);
  const parts = [];
  if (doc.note) parts.push(doc.note);
  if (Number(doc.paid) > 0 && due > 0) {
    parts.push(`Đặt ${Number(doc.paid).toLocaleString("vi-VN")} ${verb} còn lại ${due.toLocaleString("vi-VN")}`);
  } else if (due <= 0 && Number(doc.total) > 0) {
    parts.push("Đã thanh toán đủ");
  }
  return parts.join(" — ") || "—";
}

// kind: 'sale' (Phiếu xuất kho bán hàng, Nợ 131/Có 5111) hoặc 'purchase' (Phiếu nhập kho mua
// hàng, Nợ 156/Có 331) — cùng một mẫu HTML, chỉ khác tiêu đề/định khoản/đối tác hiển thị.
export async function renderInvoiceHtml(doc, items, kind = "sale") {
  const companyRow = (await query(`SELECT value FROM app_settings WHERE key = 'company_info'`)).rows[0];
  const company = companyRow?.value ? JSON.parse(companyRow.value) : {};
  const tplRow = (await query(`SELECT value FROM app_settings WHERE key = 'tpl_invoice'`)).rows[0];
  const template = tplRow?.value || DEFAULT_INVOICE_TEMPLATE;

  const isPurchase = kind === "purchase";
  const partnerId = isPurchase ? doc.supplier_id : doc.customer_id;
  let partner = {};
  if (partnerId) {
    partner = (await query(`SELECT phone, address FROM partners WHERE id = $1`, [partnerId])).rows[0] || {};
  }

  const rowsHtml = items.map((it, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td class="center">${it.sku || it.variant_sku || ""}</td>
      <td>${it.product_name}${escapeAttrs(it.variant_attrs)}</td>
      <td class="center">${it.unit || ""}</td>
      <td class="num">${it.qty}</td>
      <td class="num">${Number(it.price).toLocaleString("vi-VN")}</td>
      <td class="num">${(Number(it.qty) * Number(it.price)).toLocaleString("vi-VN")}</td>
    </tr>`).join("");

  const due = Number(doc.total) - Number(doc.paid);
  const createdAt = new Date(doc.created_at);
  const values = {
    docTitle: isPurchase ? "PHIẾU NHẬP KHO MUA HÀNG" : "PHIẾU XUẤT KHO BÁN HÀNG",
    partnerLabel: isPurchase ? "Tên nhà cung cấp" : "Tên khách hàng",
    debitCode: isPurchase ? "156" : "131",
    creditCode: isPurchase ? "331" : "5111",
    code: doc.code,
    day: String(createdAt.getDate()).padStart(2, "0"),
    month: String(createdAt.getMonth() + 1).padStart(2, "0"),
    year: String(createdAt.getFullYear()),
    date: createdAt.toLocaleString("vi-VN"),
    customerName: (isPurchase ? doc.supplier_name : doc.customer_name) || (isPurchase ? "" : "Khách lẻ"),
    customerPhone: partner.phone || "",
    customerAddress: partner.address || "",
    dienGiai: buildDienGiai(doc, isPurchase ? "trả" : "thu"),
    rowsHtml,
    subtotal: Number(doc.subtotal).toLocaleString("vi-VN"),
    discount: Number(doc.discount).toLocaleString("vi-VN"),
    shippingFee: Number(doc.shipping_fee || 0).toLocaleString("vi-VN"),
    total: Number(doc.total).toLocaleString("vi-VN"),
    paid: Number(doc.paid).toLocaleString("vi-VN"),
    due: due.toLocaleString("vi-VN"),
    amountWords: numberToVietnameseWords(doc.total),
    companyName: company.name || "",
    companyAddress: company.address || "",
    companyPhone: company.phone || "",
    companyEmail: company.email || "",
    companyTaxId: company.taxId || "",
    companyLogoHtml: company.logo ? `<img class="logo" src="${company.logo}" alt="logo" />` : "",
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
}
