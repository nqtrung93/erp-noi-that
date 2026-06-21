import { query } from "../config/db.js";
import { escapeHtml } from "../utils/escapeHtml.js";
import { getOrderById } from "./order.service.js";
import { getTemplate, getCompanyHeaderData } from "./invoice.service.js";
import { renderTemplate } from "../utils/printTemplates.js";

const fmt = (n) => Number(n || 0).toLocaleString("vi-VN") + " ₫";

const DOC_TITLE = {
  inbound: "PHIẾU NHẬP HÀNG",
  adjust: "PHIẾU ĐIỀU CHỈNH TỒN KHO",
  transfer_out: "PHIẾU LUÂN CHUYỂN KHO",
  transfer_in: "PHIẾU LUÂN CHUYỂN KHO",
};

// Phiếu nhập/điều chỉnh/luân chuyển đều gộp nhiều dòng sản phẩm vào 1 doc_no — lấy hết theo doc_no
// rồi suy ra loại phiếu + dòng mô tả (meta) riêng từng loại, dùng chung mẫu "stock_doc".
export async function renderStockDocHtml(docNo) {
  const { rows } = await query(
    `SELECT sm.*, p.name AS product_name, w.name AS warehouse_name, s.name AS supplier_name,
            v.attrs AS variant_attrs, v.sku AS variant_sku
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       JOIN warehouses w ON w.id = sm.warehouse_id
       LEFT JOIN suppliers s ON s.id = sm.supplier_id
       LEFT JOIN product_variants v ON v.id = sm.variant_id
      WHERE sm.doc_no = $1
      ORDER BY sm.created_at`,
    [docNo]
  );
  if (!rows.length) throw new Error("Không tìm thấy phiếu");
  const type = rows[0].type;
  const title = DOC_TITLE[type] || "PHIẾU KHO";

  let metaLine = "";
  let rowsHtml = "";
  if (type === "transfer_out" || type === "transfer_in") {
    const outRow = rows.find((r) => r.type === "transfer_out") || rows[0];
    const inRow = rows.find((r) => r.type === "transfer_in") || rows[0];
    metaLine = `<div class="field"><div class="label">Từ kho → Đến kho:</div>${escapeHtml(outRow.warehouse_name)} → ${escapeHtml(inRow.warehouse_name)}</div>`;
    rowsHtml = rows.filter((r) => r.type === "transfer_out").map((r) => `
      <tr><td>${escapeHtml(variantLabel(r))}</td><td style="text-align:right">${Math.abs(r.qty_change)}</td></tr>`).join("");
  } else {
    metaLine = `<div class="field"><div class="label">Kho:</div>${escapeHtml(rows[0].warehouse_name)}${rows[0].supplier_name ? ` · NCC: ${escapeHtml(rows[0].supplier_name)}` : ""}</div>`;
    rowsHtml = rows.map((r) => `
      <tr><td>${escapeHtml(variantLabel(r))}</td><td style="text-align:right">${r.qty_change > 0 ? "+" : ""}${r.qty_change}</td></tr>`).join("");
  }

  const tpl = await getTemplate("stock_doc");
  return renderTemplate(tpl, {
    ...(await getCompanyHeaderData()),
    title,
    docNo: escapeHtml(docNo),
    metaLine,
    date: escapeHtml(new Date(rows[0].created_at).toLocaleString("vi-VN")),
    rowsHtml,
    reasonLine: rows[0].reason ? `<div class="field"><div class="label">Lý do:</div>${escapeHtml(rows[0].reason)}</div>` : "",
  });
}

function variantLabel(r) {
  const attrs = r.variant_attrs && Object.keys(r.variant_attrs).length ? ` (${Object.values(r.variant_attrs).join(" / ")})` : "";
  return `${r.product_name}${attrs}${r.variant_sku ? ` · ${r.variant_sku}` : ""}`;
}

// Phiếu bảo hành: dùng mẫu "warranty".
export async function renderWarrantyHtml(warranty) {
  const partsRowsHtml = (warranty.parts || [])
    .map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.months)}</td><td>${escapeHtml(formatDateVi(p.expiresAt))}</td></tr>`)
    .join("");

  const tpl = await getTemplate("warranty");
  return renderTemplate(tpl, {
    ...(await getCompanyHeaderData()),
    docNo: escapeHtml(warranty.doc_no),
    orderCodeLine: warranty.order_code ? ` — Đơn hàng: <b>${escapeHtml(warranty.order_code)}</b>` : "",
    startDate: escapeHtml(formatDateVi(warranty.start_date)),
    productName: escapeHtml(warranty.product_name),
    customerName: escapeHtml(warranty.customer_name || "Khách lẻ"),
    customerPhoneLine: warranty.customer_phone ? `· ĐT: ${escapeHtml(warranty.customer_phone)}` : "",
    partsRowsHtml,
  });
}

function formatDateVi(d) {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("vi-VN");
}

// Phiếu vận chuyển: lấy đơn + shipment liên kết, dùng mẫu "shipment".
export async function renderShipmentHtml(orderId) {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Đơn không tồn tại");

  const tpl = await getTemplate("shipment");
  return renderTemplate(tpl, {
    ...(await getCompanyHeaderData()),
    docNo: escapeHtml(order.shipment_doc_no || "—"),
    orderCode: escapeHtml(order.code),
    date: escapeHtml(new Date().toLocaleString("vi-VN")),
    carrier: escapeHtml(order.carrier || "—"),
    trackingLine: order.tracking_no ? ` · Mã vận đơn: ${escapeHtml(order.tracking_no)}` : "",
    customerName: escapeHtml(order.customer_name || "Khách lẻ"),
    customerPhone: escapeHtml(order.customer_phone || ""),
    customerAddress: escapeHtml(order.address || ""),
    amountDue: fmt(Math.max(Number(order.total) - Number(order.paid), 0)),
    shipCost: fmt(order.ship_cost),
  });
}
