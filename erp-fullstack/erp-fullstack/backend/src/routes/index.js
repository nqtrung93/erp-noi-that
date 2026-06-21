import { Router } from "express";
import { verifyToken, requirePerm } from "../middleware/auth.js";
import * as auth from "../controllers/auth.controller.js";
import * as product from "../controllers/product.controller.js";
import * as order from "../controllers/order.controller.js";
import * as user from "../controllers/user.controller.js";
import * as stock from "../controllers/stock.controller.js";
import * as supplier from "../controllers/supplier.controller.js";
import * as customer from "../controllers/customer.controller.js";
import * as transaction from "../controllers/transaction.controller.js";
import { makeCrud } from "../controllers/crud.factory.js";
import * as reportService from "../services/report.service.js";
import { renderStockDocHtml, renderShipmentHtml, renderWarrantyHtml } from "../services/printDoc.service.js";
import * as warrantyService from "../services/warranty.service.js";
import * as resetData from "../services/resetData.service.js";
import * as backupService from "../services/backup.service.js";
import { DEFAULT_TEMPLATES } from "../utils/printTemplates.js";
import { DEFAULT_DOC_FORMATS, getDocFormats, clearDocFormatsCache } from "../utils/docFormat.js";
import { asyncHandler, badRequest, forbidden } from "../utils/http.js";
import { query } from "../config/db.js";

const r = Router();

// -------- Auth (public login, còn lại cần token) --------
r.post("/auth/login", auth.login);
r.get("/auth/me", verifyToken, auth.me);

// -------- Products + Variants (#15) --------
r.get("/products", verifyToken, requirePerm("products_view"), product.list);
r.get("/products/:id", verifyToken, requirePerm("products_view"), product.getOne);
r.post("/products", verifyToken, requirePerm("products_edit"), product.create);
r.put("/products/:id", verifyToken, requirePerm("products_edit"), product.update);
r.delete("/products/:id", verifyToken, requirePerm("products_delete"), product.remove);
r.get("/products/:id/variants", verifyToken, requirePerm("products_view"), product.listVariants);
r.post("/products/:id/variants", verifyToken, requirePerm("products_edit"), product.createVariant);
r.put("/products/:id/variants/:variantId", verifyToken, requirePerm("products_edit"), product.updateVariant);
r.delete("/products/:id/variants/:variantId", verifyToken, requirePerm("products_delete"), product.removeVariant);

// -------- Categories (không có created_at, sắp theo tên) --------
r.get("/categories", verifyToken, requirePerm("products_view"), asyncHandler(async (req, res) => {
  res.json((await query(`SELECT * FROM categories ORDER BY name`)).rows);
}));
r.post("/categories", verifyToken, requirePerm("products_edit"), asyncHandler(async (req, res) => {
  const name = (req.body || {}).name;
  if (!name) throw badRequest("Thiếu tên danh mục");
  const { rows } = await query(
    `INSERT INTO categories(name) VALUES($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING *`,
    [name]
  );
  res.status(201).json(rows[0]);
}));

// -------- Warehouses (#15) --------
const warehouses = makeCrud("warehouses", ["code", "name", "address"]);
r.get("/warehouses", verifyToken, requirePerm("warehouse_view"), warehouses.list);
r.get("/warehouses/:id", verifyToken, requirePerm("warehouse_view"), warehouses.getOne);
r.post("/warehouses", verifyToken, requirePerm("warehouse_edit"), warehouses.create);
r.put("/warehouses/:id", verifyToken, requirePerm("warehouse_edit"), warehouses.update);
r.delete("/warehouses/:id", verifyToken, requirePerm("warehouse_edit"), warehouses.remove);

// -------- Customer groups (PK = name, không có id/created_at) --------
r.get("/customer-groups", verifyToken, requirePerm("crm_view"), asyncHandler(async (req, res) => {
  res.json((await query(`SELECT name FROM customer_groups ORDER BY name`)).rows.map((r2) => r2.name));
}));
r.post("/customer-groups", verifyToken, requirePerm("settings_edit"), asyncHandler(async (req, res) => {
  const name = (req.body || {}).name;
  if (!name) throw badRequest("Thiếu tên nhóm khách");
  await query(`INSERT INTO customer_groups(name) VALUES($1) ON CONFLICT DO NOTHING`, [name]);
  res.status(201).json({ name });
}));
r.delete("/customer-groups/:name", verifyToken, requirePerm("settings_edit"), asyncHandler(async (req, res) => {
  await query(`UPDATE customers SET group_name = NULL WHERE group_name = $1`, [req.params.name]);
  await query(`DELETE FROM customer_groups WHERE name = $1`, [req.params.name]);
  res.status(204).end();
}));

// -------- Customers (#15) --------
const customers = makeCrud("customers", ["name", "phone", "email", "address", "group_name", "payment_term_days"]);
r.get("/customers", verifyToken, requirePerm("crm_view"), customer.list); // override: kèm công nợ tính toán
r.get("/customers/:id", verifyToken, requirePerm("crm_view"), customers.getOne);
r.post("/customers", verifyToken, requirePerm("crm_edit"), customer.create); // override: tự sinh mã KH
r.put("/customers/:id", verifyToken, requirePerm("crm_edit"), customers.update);
r.delete("/customers/:id", verifyToken, requirePerm("crm_delete"), customers.remove);
r.post("/customers/:id/pay-debt", verifyToken, requirePerm("crm_edit"), customer.payDebt);

// -------- Suppliers (#15) --------
const suppliers = makeCrud("suppliers", ["name", "contact", "phone", "email", "debt"]);
r.get("/suppliers", verifyToken, requirePerm("suppliers_view"), suppliers.list);
r.get("/suppliers/:id", verifyToken, requirePerm("suppliers_view"), suppliers.getOne);
r.post("/suppliers", verifyToken, requirePerm("suppliers_edit"), suppliers.create);
r.put("/suppliers/:id", verifyToken, requirePerm("suppliers_edit"), suppliers.update);
r.delete("/suppliers/:id", verifyToken, requirePerm("suppliers_delete"), suppliers.remove);
r.post("/suppliers/:id/pay", verifyToken, requirePerm("suppliers_edit"), supplier.payDebt);

// -------- Transactions (#15) --------
const transactions = makeCrud("transactions", [
  "code", "type", "category", "amount", "date", "method",
  "party_type", "party_id", "party_name", "ref_type", "ref_id", "note", "created_by",
]);
r.get("/transactions", verifyToken, requirePerm("finance_view"), transaction.list); // override: kèm mã đơn liên quan
r.get("/transactions/:id", verifyToken, requirePerm("finance_view"), transactions.getOne);
r.post("/transactions", verifyToken, requirePerm("finance_edit"), transaction.create); // override: tự sinh mã phiếu
r.put("/transactions/:id", verifyToken, requirePerm("finance_edit"), transactions.update);
r.delete("/transactions/:id", verifyToken, requirePerm("finance_delete"), transactions.remove);

// -------- Orders (#15 + #7/#8/#9/#12) --------
r.get("/orders", verifyToken, requirePerm("orders_view"), order.list);
r.get("/orders/:id", verifyToken, requirePerm("orders_view"), order.getOne);
r.post("/orders", verifyToken, requirePerm("orders_edit"), order.create);
r.put("/orders/:id", verifyToken, requirePerm("orders_edit"), order.update);
r.patch("/orders/:id/status", verifyToken, requirePerm("orders_edit"), order.changeStatus);
r.patch("/orders/:id/shipping", verifyToken, requirePerm("shipping_edit"), order.updateShipping);
r.patch("/orders/:id/vat", verifyToken, requirePerm("vatinvoice_edit"), order.updateVat);
r.post("/orders/:id/payments", verifyToken, requirePerm("finance_edit"), order.addPayment);
r.post("/orders/:id/collect-cod", verifyToken, requirePerm("finance_edit"), order.collectCod);
r.post("/orders/:id/pay-ship-cost", verifyToken, requirePerm("finance_edit"), order.payShipCost);
r.delete("/orders/:id", verifyToken, requirePerm("orders_delete"), order.remove); // kiểm tra role Admin trong controller
r.get("/orders/:id/invoice", verifyToken, requirePerm("orders_view"), order.invoice);

// -------- Carriers (đơn vị vận chuyển) --------
const carriers = makeCrud("carriers", ["name"]);
r.get("/carriers", verifyToken, requirePerm("shipping_view"), carriers.list);
r.post("/carriers", verifyToken, requirePerm("shipping_edit"), carriers.create);
r.put("/carriers/:id", verifyToken, requirePerm("shipping_edit"), carriers.update);
r.delete("/carriers/:id", verifyToken, requirePerm("shipping_delete"), carriers.remove);

// -------- Order sources (nguồn đơn hàng: Hotline, Facebook, Tự gọi điện...) --------
const orderSources = makeCrud("order_sources", ["name"]);
r.get("/order-sources", verifyToken, requirePerm("orders_view"), orderSources.list);
r.post("/order-sources", verifyToken, requirePerm("settings_edit"), orderSources.create);
r.delete("/order-sources/:id", verifyToken, requirePerm("settings_edit"), orderSources.remove);

// -------- Shops (shop bán hàng TMĐT — số lượng tự thêm/xoá) --------
const shops = makeCrud("shops", ["name"]);
r.get("/shops", verifyToken, requirePerm("orders_view"), shops.list);
r.post("/shops", verifyToken, requirePerm("settings_edit"), shops.create);
r.delete("/shops/:id", verifyToken, requirePerm("settings_edit"), shops.remove);

// -------- Stock (tồn kho: xem + nhập/điều chỉnh/luân chuyển) --------
r.get("/stock", verifyToken, requirePerm("warehouse_view"), stock.list);
r.get("/stock/movements", verifyToken, requirePerm("warehouse_view"), stock.listMovements);
r.post("/stock/inbound", verifyToken, requirePerm("warehouse_edit"), stock.inbound);
r.post("/stock/adjust", verifyToken, requirePerm("warehouse_edit"), stock.adjust);
r.post("/stock/transfer", verifyToken, requirePerm("warehouse_edit"), stock.transfer);

// -------- Employees (users) (#15) --------
r.get("/users", verifyToken, requirePerm("employees_view"), user.list);
r.post("/users", verifyToken, requirePerm("employees_edit"), user.create);
r.put("/users/:id", verifyToken, requirePerm("employees_edit"), user.update);
r.delete("/users/:id", verifyToken, requirePerm("employees_delete"), user.remove);
r.get("/roles", verifyToken, requirePerm("employees_view"), user.listRoles);
r.get("/roles/full", verifyToken, requirePerm("employees_view"), user.listRolesFull);
r.post("/roles", verifyToken, requirePerm("employees_edit"), user.createRole);
r.put("/roles/:role/permissions", verifyToken, requirePerm("employees_edit"), user.setRolePermissions);
r.get("/permissions", verifyToken, requirePerm("employees_view"), user.listPermissions);

// -------- Settings (logo công ty...) — đọc public (kể cả chưa đăng nhập, để hiện ở màn login) --------
r.get("/settings/logo", asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT value FROM app_settings WHERE key = 'logo'`);
  res.json({ logo: rows[0]?.value || null });
}));

// -------- Thông tin công ty (tên/địa chỉ/điện thoại/email/MST) — dùng để in lên phiếu --------
r.get("/settings/company", verifyToken, requirePerm("settings_view"), asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT value FROM app_settings WHERE key = 'company_info'`);
  res.json(rows[0]?.value ? JSON.parse(rows[0].value) : {});
}));
r.put("/settings/company", verifyToken, requirePerm("settings_edit"), asyncHandler(async (req, res) => {
  const { name, address, phone, email, taxCode, website } = req.body || {};
  const info = { name: name || "", address: address || "", phone: phone || "", email: email || "", taxCode: taxCode || "", website: website || "" };
  await query(
    `INSERT INTO app_settings(key, value) VALUES('company_info', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(info)]
  );
  res.json(info);
}));
r.put("/settings/logo", verifyToken, requirePerm("settings_edit"), asyncHandler(async (req, res) => {
  const logo = (req.body || {}).logo || null;
  await query(
    `INSERT INTO app_settings(key, value) VALUES('logo', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [logo]
  );
  res.json({ logo });
}));

// -------- Mẫu in tuỳ chỉnh (Hoá đơn/Đơn hàng, Phiếu kho, Phiếu vận chuyển, Phiếu bảo hành) --------
r.get("/settings/templates", verifyToken, requirePerm("settings_view"), asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT key, value FROM app_settings WHERE key LIKE 'tpl_%'`);
  const overrides = Object.fromEntries(rows.map((r2) => [r2.key.replace("tpl_", ""), r2.value]));
  res.json({
    invoice: overrides.invoice || DEFAULT_TEMPLATES.invoice,
    stock_doc: overrides.stock_doc || DEFAULT_TEMPLATES.stock_doc,
    shipment: overrides.shipment || DEFAULT_TEMPLATES.shipment,
    warranty: overrides.warranty || DEFAULT_TEMPLATES.warranty,
  });
}));
r.put("/settings/templates/:type", verifyToken, requirePerm("settings_edit"), asyncHandler(async (req, res) => {
  const type = req.params.type;
  if (!DEFAULT_TEMPLATES[type]) throw badRequest("Loại mẫu in không hợp lệ");
  const html = (req.body || {}).html;
  if (html) {
    await query(
      `INSERT INTO app_settings(key, value) VALUES($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [`tpl_${type}`, html]
    );
  } else {
    // html rỗng/null → khôi phục mặc định (xoá override)
    await query(`DELETE FROM app_settings WHERE key = $1`, [`tpl_${type}`]);
  }
  res.json({ type, html: html || DEFAULT_TEMPLATES[type] });
}));

// -------- Định dạng số phiếu (tiền tố + số chữ số đệm) cho đơn hàng/phiếu kho/thu chi --------
r.get("/settings/doc-formats", verifyToken, requirePerm("settings_view"), asyncHandler(async (req, res) => {
  res.json(await getDocFormats());
}));
r.put("/settings/doc-formats", verifyToken, requirePerm("settings_edit"), asyncHandler(async (req, res) => {
  const { type, prefix, pad } = req.body || {};
  if (!DEFAULT_DOC_FORMATS[type]) throw badRequest("Loại phiếu không hợp lệ");
  if (!prefix || !/^[A-Za-z0-9]{1,10}$/.test(prefix)) throw badRequest("Tiền tố không hợp lệ (1-10 ký tự chữ/số)");
  const padNum = Number(pad);
  if (!Number.isInteger(padNum) || padNum < 1 || padNum > 10) throw badRequest("Số chữ số đệm phải từ 1-10");

  const { rows } = await query(`SELECT value FROM app_settings WHERE key = 'doc_formats'`);
  const overrides = rows[0]?.value ? JSON.parse(rows[0].value) : {};
  overrides[type] = { prefix: prefix.toUpperCase(), pad: padNum };
  await query(
    `INSERT INTO app_settings(key, value) VALUES('doc_formats', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(overrides)]
  );
  clearDocFormatsCache();
  res.json(await getDocFormats());
}));

// -------- In phiếu kho (nhập hàng / điều chỉnh / luân chuyển) theo số phiếu --------
r.get("/stock/movements/print/:docNo", verifyToken, requirePerm("warehouse_view"),
  asyncHandler(async (req, res) => res.type("html").send(await renderStockDocHtml(req.params.docNo))));

// -------- In phiếu vận chuyển theo đơn --------
r.get("/orders/:id/shipment-print", verifyToken, requirePerm("shipping_view"),
  asyncHandler(async (req, res) => res.type("html").send(await renderShipmentHtml(req.params.id))));

// -------- Bảo hành: tra cứu theo mã phiếu/mã đơn/SĐT/tên KH/tên SP + in phiếu --------
r.get("/warranties", verifyToken, requirePerm("warranty_view"),
  asyncHandler(async (req, res) => res.json(await warrantyService.listWarranties(req.query.q))));
r.get("/warranties/:id", verifyToken, requirePerm("warranty_view"),
  asyncHandler(async (req, res) => res.json(await warrantyService.getWarrantyById(req.params.id))));
r.get("/warranties/:id/print", verifyToken, requirePerm("warranty_view"), asyncHandler(async (req, res) => {
  const w = await warrantyService.getWarrantyById(req.params.id);
  res.type("html").send(await renderWarrantyHtml(w));
}));

// -------- Reset dữ liệu — CHỈ Admin (kiểm role cứng, không chỉ permission), bắt buộc gõ đúng
// chuỗi xác nhận để tránh bấm nhầm. scope: "transactions" (giữ master data) | "all" (xoá sạch). --------
r.post("/admin/reset-data", verifyToken, asyncHandler(async (req, res) => {
  if (req.user.role !== "Admin") throw forbidden("Chỉ Admin được thực hiện reset dữ liệu");
  const { scope, confirm } = req.body || {};
  if (confirm !== "XOA DU LIEU") throw badRequest('Chuỗi xác nhận không đúng — phải gõ đúng "XOA DU LIEU"');
  if (scope === "transactions") {
    await resetData.resetTransactions();
  } else if (scope === "all") {
    await resetData.resetAll(req.user.sub);
  } else {
    throw badRequest("Phạm vi reset không hợp lệ");
  }
  res.json({ ok: true, scope });
}));

// -------- Backup database — CHỈ Admin. Stream trực tiếp file pg_dump (.dump) để tải xuống. --------
r.get("/admin/backup", verifyToken, asyncHandler(async (req, res) => {
  if (req.user.role !== "Admin") throw forbidden("Chỉ Admin được tải bản backup");
  const filename = `erp_backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.dump`;
  await backupService.streamBackup(res, filename);
}));

// -------- Reports (#11) --------
r.get("/reports/profit", verifyToken, requirePerm("view_revenue"),
  asyncHandler(async (req, res) => res.json(await reportService.profitReport(req.query))));
r.get("/reports/inventory", verifyToken, requirePerm("reports"),
  asyncHandler(async (req, res) => res.json(await reportService.inventoryValue())));
r.get("/reports/shop-debt", verifyToken, requirePerm("view_revenue"),
  asyncHandler(async (req, res) => res.json(await reportService.shopDebtReport())));

export default r;
