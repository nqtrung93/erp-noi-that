import { api } from "../api/client.js";
export const listStock = (warehouseId) => api.get(`/stock${warehouseId ? `?warehouseId=${warehouseId}` : ""}`);
export const listMovements = (params = {}) => {
  const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
  return api.get(`/stock/movements${q ? `?${q}` : ""}`);
};
export const inboundStock = (data) => api.post("/stock/inbound", data);
export const adjustStock = (data) => api.post("/stock/adjust", data);
export const transferStock = (data) => api.post("/stock/transfer", data); // data.items: [{productId, variantId, qty}]

// HTML phiếu (đã escape ở backend) để in theo số phiếu — dùng chung cho nhập hàng/điều chỉnh/luân chuyển.
export const getMovementPrintHtml = (docNo) => api.getRaw(`/stock/movements/print/${docNo}`);

// Tải phiếu kho dạng PDF (tên file tự đặt theo số phiếu)
export const downloadMovementPdf = (docNo) => api.downloadFile(`/stock/movements/print/${docNo}/pdf`);
