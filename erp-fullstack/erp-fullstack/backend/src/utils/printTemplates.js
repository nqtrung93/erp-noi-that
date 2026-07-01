// Mẫu in tuỳ chỉnh: mỗi loại phiếu là 1 HTML có {{placeholder}}, admin sửa được trong Cài đặt → Mẫu in.
// render() chỉ thay token {{key}} bằng data[key] (đã build HTML an toàn/escape sẵn ở nơi gọi) — không eval JS.
export function renderTemplate(tpl, data) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => (data[key] ?? ""));
}

// Chung cho cả 4 mẫu: khổ A4 khi in (@page) + giới hạn chiều rộng nội dung = vùng in A4 (210mm - lề)
// để xem trước trên màn hình cũng giống hệt khi in ra giấy.
const A4_STYLE = `
  @page { size: A4; margin: 15mm; }
  @media print { body { margin: 0 !important; } }
`;

// Bộ style dùng chung cho cả 4 mẫu — đồng bộ giao diện (theo mẫu Hoá đơn/Đơn hàng) giữa các loại phiếu.
// Màu nhấn #0d9488 (teal) khớp với màu chủ đạo của giao diện ERP (nút, tab...) để phiếu in đồng bộ
// thương hiệu với phần mềm. tr có page-break-inside:avoid để 1 dòng sản phẩm không bị cắt ngang
// khi bảng tràn sang trang 2 (đơn nhiều sản phẩm).
const COMMON_STYLE = `
  body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;width:180mm;max-width:100%;margin:15mm auto;padding:0 16px;box-sizing:border-box;font-size:13px}
  .muted{color:#64748b}
  .company-header{display:flex;gap:14px;align-items:flex-start;margin-bottom:16px}
  .company-logo{height:48px;object-fit:contain}
  .company-name{font-size:18px;font-weight:bold;margin-bottom:4px;color:#0d9488}
  .top-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px}
  .doc-date{text-align:right}
  .doc-title{font-size:18px;font-weight:bold;margin:0 0 16px;color:#0d9488}
  .layout{display:flex;gap:24px}
  .col-left{flex:1.6;min-width:0}
  .col-right{flex:1;min-width:0}
  .section-title{font-weight:bold;font-size:14px;color:#0d9488;border-bottom:2px solid #0d9488;padding-bottom:6px;margin:18px 0 10px}
  table{width:100%;border-collapse:collapse}
  th,td{padding:6px 4px;font-size:12.5px;text-align:left;vertical-align:top}
  th{color:#64748b;font-weight:normal;border-bottom:1px solid #e2e8f0}
  tr{page-break-inside:avoid}
  .box{border:1px solid #e2e8f0;border-radius:6px;padding:12px;margin-bottom:14px;background:#f0fdfa}
  .box .field{margin-bottom:8px}
  .box .field:last-child{margin-bottom:0}
  .box .label{font-weight:bold}
  .row{display:flex;justify-content:space-between;padding:3px 0}
  .row.total{font-weight:bold;color:#0d9488;border-top:1px solid #0d9488;margin-top:4px;padding-top:6px}
  .footer{margin-top:24px;font-size:12px;color:#64748b}
`;

export const DEFAULT_TEMPLATES = {
  invoice: `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Đơn hàng {{code}}</title>
<style>
  ${A4_STYLE}
  ${COMMON_STYLE}
</style></head>
<body>
  <div class="top-row">
    {{companyHeaderLine}}
    <div class="doc-date muted">Ngày đặt hàng: {{date}}</div>
  </div>

  <div class="layout">
    <div class="col-left">
      <div class="section-title">Chi tiết đơn hàng</div>
      <table>
        <thead><tr><th>Mã sản phẩm</th><th>Sản phẩm</th><th style="text-align:center">Số lượng</th><th style="text-align:right">Giá</th><th style="text-align:right">Thành tiền</th></tr></thead>
        <tbody>{{rowsHtml}}</tbody>
      </table>

      <div class="section-title">Thông tin thanh toán</div>
      <div class="row"><span>Tổng thành tiền:</span><span>{{subtotal}}</span></div>
      {{shippingOrVatLine}}
      <div class="row total"><span>Tổng tiền:</span><span>{{total}}</span></div>
      <div class="row"><span>Số tiền đã trả:</span><span>{{paid}}</span></div>
      <div class="row total"><span>Tổng tiền phải trả:</span><span>{{due}}</span></div>
      {{noteLine}}
    </div>

    <div class="col-right">
      <div class="section-title">Thông tin đơn hàng</div>
      <div class="box">
        <div class="field"><div class="label">Mã đơn hàng:</div>{{code}}</div>
        <div class="field"><div class="label">Ngày đặt hàng:</div>{{date}}</div>
        <div class="field"><div class="label">Phương thức thanh toán:</div>{{paymentMethod}}</div>
        <div class="field"><div class="label">Phương thức vận chuyển:</div>{{shippingMethod}}</div>
      </div>

      <div class="section-title">Thông tin mua hàng</div>
      <div class="box">
        <div class="field"><b>{{customerName}}</b></div>
        <div class="field">{{customerAddress}}</div>
        <div class="field">Điện thoại: {{customerPhone}}</div>
      </div>
    </div>
  </div>

  <div class="footer">Nếu bạn có thắc mắc, vui lòng liên hệ chúng tôi qua email {{companyEmail}} hoặc {{companyPhone}}</div>
</body></html>`,

  // Dùng chung cho phiếu nhập hàng / điều chỉnh tồn / luân chuyển kho (cấu trúc giống nhau:
  // số phiếu + dòng mô tả riêng từng loại + bảng sản phẩm).
  // Dùng chung cho phiếu nhập hàng / điều chỉnh tồn / luân chuyển kho (cấu trúc giống nhau:
  // số phiếu + dòng mô tả riêng từng loại + bảng sản phẩm).
  stock_doc: `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>{{title}} {{docNo}}</title>
<style>
  ${A4_STYLE}
  ${COMMON_STYLE}
</style></head>
<body>
  <div class="top-row">
    {{companyHeaderLine}}
    <div class="doc-date muted">Ngày: {{date}}</div>
  </div>
  <div class="doc-title">{{title}}</div>

  <div class="layout">
    <div class="col-left">
      <div class="section-title">Danh sách sản phẩm</div>
      <table>
        <thead><tr><th>Sản phẩm</th><th style="text-align:right">Số lượng</th></tr></thead>
        <tbody>{{rowsHtml}}</tbody>
      </table>
    </div>

    <div class="col-right">
      <div class="section-title">Thông tin phiếu</div>
      <div class="box">
        <div class="field"><div class="label">Số phiếu:</div>{{docNo}}</div>
        <div class="field"><div class="label">Ngày:</div>{{date}}</div>
        {{metaLine}}
        {{reasonLine}}
      </div>
    </div>
  </div>
</body></html>`,

  shipment: `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Phiếu vận chuyển {{docNo}}</title>
<style>
  ${A4_STYLE}
  ${COMMON_STYLE}
</style></head>
<body>
  <div class="top-row">
    {{companyHeaderLine}}
    <div class="doc-date muted">Ngày: {{date}}</div>
  </div>
  <div class="doc-title">PHIẾU VẬN CHUYỂN</div>

  <div class="layout">
    <div class="col-left">
      <div class="section-title">Thông tin vận chuyển</div>
      <div class="box">
        <div class="field"><div class="label">Đơn vị vận chuyển:</div>{{carrier}}{{trackingLine}}</div>
        <div class="field"><div class="label">Phí ship ĐVVC:</div>{{shipCost}}</div>
      </div>
      <div class="row total"><span>Số tiền cần thu (COD):</span><span>{{amountDue}}</span></div>
    </div>

    <div class="col-right">
      <div class="section-title">Thông tin phiếu</div>
      <div class="box">
        <div class="field"><div class="label">Số phiếu:</div>{{docNo}}</div>
        <div class="field"><div class="label">Đơn hàng:</div>{{orderCode}}</div>
      </div>

      <div class="section-title">Người nhận</div>
      <div class="box">
        <div class="field"><b>{{customerName}}</b></div>
        <div class="field">{{customerAddress}}</div>
        <div class="field">Điện thoại: {{customerPhone}}</div>
      </div>
    </div>
  </div>
</body></html>`,

  warranty: `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Phiếu bảo hành {{docNo}}</title>
<style>
  ${A4_STYLE}
  ${COMMON_STYLE}
</style></head>
<body>
  <div class="top-row">
    {{companyHeaderLine}}
    <div class="doc-date muted">Ngày bắt đầu: {{startDate}}</div>
  </div>
  <div class="doc-title">PHIẾU BẢO HÀNH</div>

  <div class="layout">
    <div class="col-left">
      <div class="section-title">Chi tiết bảo hành</div>
      <table>
        <thead><tr><th>Bộ phận</th><th>Thời hạn (tháng)</th><th>Hết hạn</th></tr></thead>
        <tbody>{{partsRowsHtml}}</tbody>
      </table>
      <p class="muted" style="margin-top:16px">Vui lòng giữ phiếu này để được hỗ trợ bảo hành khi cần.</p>
    </div>

    <div class="col-right">
      <div class="section-title">Thông tin phiếu</div>
      <div class="box">
        <div class="field"><div class="label">Số phiếu:</div>{{docNo}}{{orderCodeLine}}</div>
        <div class="field"><div class="label">Sản phẩm:</div>{{productName}}</div>
      </div>

      <div class="section-title">Khách hàng</div>
      <div class="box">
        <div class="field"><b>{{customerName}}</b></div>
        <div class="field">{{customerPhoneLine}}</div>
      </div>
    </div>
  </div>
</body></html>`,
};

export const TEMPLATE_LABELS = {
  invoice: "Hoá đơn / Đơn hàng",
  stock_doc: "Phiếu kho (Nhập hàng / Điều chỉnh / Luân chuyển)",
  shipment: "Phiếu vận chuyển",
  warranty: "Phiếu bảo hành",
};
