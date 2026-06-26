import { Router } from "express";
import { verifyToken, requirePerm } from "../middleware/auth.js";
import * as auth from "../controllers/auth.controller.js";
import * as user from "../controllers/user.controller.js";
import * as partner from "../controllers/partner.controller.js";
import * as transaction from "../controllers/transaction.controller.js";
import * as stock from "../controllers/stock.controller.js";
import * as payroll from "../controllers/payroll.controller.js";
import * as bank from "../controllers/bank.controller.js";
import * as order from "../controllers/order.controller.js";
import * as product from "../controllers/product.controller.js";
import { makeCrud } from "../controllers/crud.factory.js";
import * as reportService from "../services/report.service.js";
import * as resetData from "../services/resetData.service.js";
import { DEFAULT_INVOICE_TEMPLATE } from "../utils/printTemplate.js";
import { DEFAULT_DOC_FORMATS, getDocFormats, clearDocFormatsCache } from "../utils/docFormat.js";
import { asyncHandler, badRequest, forbidden } from "../utils/http.js";
import { query } from "../config/db.js";

const r = Router();

// -------- Auth --------
r.post("/auth/login", auth.login);
r.get("/auth/me", verifyToken, auth.me);

// -------- Partners (khách hàng / nhà cung cấp / khác) --------
const partners = makeCrud("partners", ["name", "type", "phone", "contact", "address"]);
r.get("/partners", verifyToken, requirePerm("partners_view"), partners.list);
r.get("/partners/:id", verifyToken, requirePerm("partners_view"), partners.getOne);
r.post("/partners", verifyToken, requirePerm("partners_edit"), partner.create); // override: tự sinh mã
r.post("/partners/import", verifyToken, requirePerm("partners_edit"), partner.importDebt);
r.put("/partners/:id", verifyToken, requirePerm("partners_edit"), partners.update);
r.delete("/partners/:id", verifyToken, requirePerm("partners_delete"), partners.remove);
r.post("/partners/:id/debt", verifyToken, requirePerm("partners_edit"), partner.adjustDebt);
r.get("/partners/:id/debt-entries", verifyToken, requirePerm("partners_view"), partner.debtHistory);

// -------- Categories (danh mục thu/chi) --------
const categories = makeCrud("categories", ["name", "type"], "type, name");
r.get("/categories", verifyToken, requirePerm("categories_view"), categories.list);
r.post("/categories", verifyToken, requirePerm("categories_edit"), categories.create);
r.put("/categories/:id", verifyToken, requirePerm("categories_edit"), categories.update);
r.delete("/categories/:id", verifyToken, requirePerm("categories_edit"), categories.remove);

// -------- Transactions (sổ quỹ thu/chi) --------
r.get("/transactions", verifyToken, requirePerm("cashbook_view"), transaction.list);
r.post("/transactions", verifyToken, requirePerm("cashbook_edit"), transaction.create);
r.delete("/transactions/:id", verifyToken, requirePerm("cashbook_delete"), asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM transactions WHERE id = $1`, [req.params.id]);
  if (!rowCount) throw badRequest("Không tìm thấy phiếu");
  res.status(204).end();
}));

// -------- Users / Roles / Permissions --------
r.get("/users", verifyToken, requirePerm("users_view"), user.list);
r.post("/users", verifyToken, requirePerm("users_edit"), user.create);
r.put("/users/:id", verifyToken, requirePerm("users_edit"), user.update);
r.delete("/users/:id", verifyToken, requirePerm("users_edit"), user.remove);
r.get("/roles", verifyToken, requirePerm("users_view"), user.listRoles);
r.get("/roles/full", verifyToken, requirePerm("users_view"), user.listRolesFull);
r.post("/roles", verifyToken, requirePerm("users_edit"), user.createRole);
r.put("/roles/:role/permissions", verifyToken, requirePerm("users_edit"), user.setRolePermissions);
r.get("/permissions", verifyToken, requirePerm("users_view"), user.listPermissions);

// -------- Settings (thông tin công ty) --------
r.get("/settings/company", verifyToken, requirePerm("settings_view"), asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT value FROM app_settings WHERE key = 'company_info'`);
  res.json(rows[0]?.value ? JSON.parse(rows[0].value) : {});
}));
r.put("/settings/company", verifyToken, requirePerm("settings_edit"), asyncHandler(async (req, res) => {
  const { name, address, phone, email } = req.body || {};
  const info = { name: name || "", address: address || "", phone: phone || "", email: email || "" };
  await query(
    `INSERT INTO app_settings(key, value) VALUES('company_info', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(info)]
  );
  res.json(info);
}));

// -------- Kho hàng: sản phẩm (+ biến thể), kho, nhập/xuất/điều chỉnh/luân chuyển --------
r.get("/products", verifyToken, requirePerm("inventory_view"), product.list);
r.get("/products/:id", verifyToken, requirePerm("inventory_view"), product.getOne);
r.post("/products", verifyToken, requirePerm("inventory_edit"), product.create);
r.put("/products/:id", verifyToken, requirePerm("inventory_edit"), product.update);
r.delete("/products/:id", verifyToken, requirePerm("inventory_edit"), product.remove);
r.get("/products/:id/variants", verifyToken, requirePerm("inventory_view"), product.listVariants);
r.post("/products/:id/variants", verifyToken, requirePerm("inventory_edit"), product.createVariant);
r.put("/products/:id/variants/:variantId", verifyToken, requirePerm("inventory_edit"), product.updateVariant);
r.delete("/products/:id/variants/:variantId", verifyToken, requirePerm("inventory_edit"), product.removeVariant);

const warehouses = makeCrud("warehouses", ["code", "name", "address"], "name");
r.get("/warehouses", verifyToken, requirePerm("inventory_view"), warehouses.list);
r.post("/warehouses", verifyToken, requirePerm("inventory_edit"), warehouses.create);
r.put("/warehouses/:id", verifyToken, requirePerm("inventory_edit"), warehouses.update);
r.delete("/warehouses/:id", verifyToken, requirePerm("inventory_edit"), warehouses.remove);

r.get("/stock", verifyToken, requirePerm("inventory_view"), stock.list);
r.get("/stock/movements", verifyToken, requirePerm("inventory_view"), stock.listMovements);
r.post("/stock/inbound", verifyToken, requirePerm("inventory_edit"), stock.inbound);
r.post("/stock/outbound", verifyToken, requirePerm("inventory_edit"), stock.outbound);
r.post("/stock/adjust", verifyToken, requirePerm("inventory_edit"), stock.adjust);
r.post("/stock/transfer", verifyToken, requirePerm("inventory_edit"), stock.transfer);
r.post("/stock/import-opening", verifyToken, requirePerm("inventory_edit"), stock.importOpeningStock);

// -------- Bán hàng: đơn hàng đa dòng sản phẩm --------
r.get("/orders", verifyToken, requirePerm("orders_view"), order.list);
r.get("/orders/:id", verifyToken, requirePerm("orders_view"), order.getOne);
r.post("/orders", verifyToken, requirePerm("orders_edit"), order.create);
r.patch("/orders/:id/status", verifyToken, requirePerm("orders_edit"), order.changeStatus);
r.post("/orders/:id/payments", verifyToken, requirePerm("orders_edit"), order.addPayment);
r.get("/orders/:id/invoice", verifyToken, requirePerm("orders_view"), order.invoice);

// -------- Lương nhân viên & BHXH --------
const employees = makeCrud("employees", ["name", "phone", "position", "base_salary", "allowance", "insurance_base", "active"], "name");
r.get("/employees", verifyToken, requirePerm("payroll_view"), employees.list);
r.post("/employees", verifyToken, requirePerm("payroll_edit"), payroll.createEmployee);
r.put("/employees/:id", verifyToken, requirePerm("payroll_edit"), employees.update);
r.delete("/employees/:id", verifyToken, requirePerm("payroll_edit"), employees.remove);

r.get("/payroll/payslips", verifyToken, requirePerm("payroll_view"), payroll.listPayslips);
r.post("/payroll/generate", verifyToken, requirePerm("payroll_edit"), payroll.generatePayroll);
r.post("/payroll/payslips/:id/pay", verifyToken, requirePerm("payroll_edit"), payroll.paySalary);
r.post("/payroll/insurance/pay", verifyToken, requirePerm("payroll_edit"), payroll.payInsurance);
r.get("/payroll/insurance-summary", verifyToken, requirePerm("payroll_view"), payroll.insuranceSummary);

// -------- Ngân hàng --------
r.get("/bank-accounts", verifyToken, requirePerm("bank_view"), bank.list);
r.post("/bank-accounts", verifyToken, requirePerm("bank_edit"), bank.create);
r.put("/bank-accounts/:id", verifyToken, requirePerm("bank_edit"), bank.update);
r.delete("/bank-accounts/:id", verifyToken, requirePerm("bank_edit"), bank.remove);
r.get("/bank-accounts/:id/transactions", verifyToken, requirePerm("bank_view"), bank.transactions);

// -------- Định dạng số phiếu (tiền tố + số chữ số đệm) --------
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

// -------- Mẫu in hoá đơn bán hàng --------
r.get("/settings/templates", verifyToken, requirePerm("settings_view"), asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT value FROM app_settings WHERE key = 'tpl_invoice'`);
  res.json({ invoice: rows[0]?.value || DEFAULT_INVOICE_TEMPLATE });
}));
r.put("/settings/templates/invoice", verifyToken, requirePerm("settings_edit"), asyncHandler(async (req, res) => {
  const html = (req.body || {}).html;
  if (html) {
    await query(
      `INSERT INTO app_settings(key, value) VALUES('tpl_invoice', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [html]
    );
  } else {
    await query(`DELETE FROM app_settings WHERE key = 'tpl_invoice'`);
  }
  res.json({ html: html || DEFAULT_INVOICE_TEMPLATE });
}));

// -------- Reset dữ liệu — CHỈ Admin, bắt buộc gõ đúng chuỗi xác nhận --------
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

// -------- Reports --------
r.get("/reports/cashbook", verifyToken, requirePerm("reports"),
  asyncHandler(async (req, res) => res.json(await reportService.cashbook(req.query))));
r.get("/reports/profit-loss", verifyToken, requirePerm("reports"),
  asyncHandler(async (req, res) => res.json(await reportService.profitLoss(req.query))));
r.get("/reports/debt", verifyToken, requirePerm("reports"),
  asyncHandler(async (req, res) => res.json(await reportService.debtReport(req.query.type))));

export default r;
