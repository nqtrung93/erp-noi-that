import { api } from "../api/client.js";
export const getLogo = () => api.get("/settings/logo");
export const setLogo = (logo) => api.put("/settings/logo", { logo });

// Mẫu in tuỳ chỉnh (Hoá đơn/Đơn hàng, Phiếu kho, Phiếu vận chuyển) — html rỗng = khôi phục mặc định.
export const getTemplates = () => api.get("/settings/templates");
export const setTemplate = (type, html) => api.put(`/settings/templates/${type}`, { html });

// Thông tin công ty — in lên đầu mọi phiếu.
export const getCompanyInfo = () => api.get("/settings/company");
export const setCompanyInfo = (info) => api.put("/settings/company", info);

// Định dạng số phiếu (tiền tố + số chữ số đệm) cho đơn hàng/phiếu kho/thu chi.
export const getDocFormats = () => api.get("/settings/doc-formats");
export const setDocFormat = (type, prefix, pad) => api.put("/settings/doc-formats", { type, prefix, pad });

// Reset dữ liệu — CHỈ Admin, bắt buộc gõ đúng chuỗi xác nhận "XOA DU LIEU".
export const resetData = (scope, confirm) => api.post("/admin/reset-data", { scope, confirm });

// Tải bản backup toàn bộ database (.dump) — CHỈ Admin.
export const downloadBackup = () => api.downloadFile("/admin/backup");
