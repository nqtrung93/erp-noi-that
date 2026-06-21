import bcrypt from "bcrypt";
import { query, withTransaction } from "../config/db.js";
import { asyncHandler, notFound, badRequest } from "../utils/http.js";

// Ma trận quyền theo module: mỗi module có 1 số hành động (xem/sửa/xoá). Quyền lưu trong DB
// dưới dạng chuỗi "<module>_<action>" (action=view/edit/delete), trừ các module chỉ có 1 hành
// động (dashboard, reports) và 2 cờ xem riêng (view_cost, view_revenue) giữ dạng tên đơn.
// Đây là NGUỒN DUY NHẤT cho UI ma trận phân quyền (GET /permissions) + validate khi lưu role.
export const PERMISSION_MODULES = [
  { key: "dashboard", label: "Tổng quan", actions: [{ key: "dashboard", label: "Xem" }] },
  { key: "products", label: "Sản phẩm", actions: [
    { key: "products_view", label: "Xem" }, { key: "products_edit", label: "Sửa/Thêm" }, { key: "products_delete", label: "Xoá" },
  ] },
  { key: "orders", label: "Đơn hàng", actions: [
    { key: "orders_view", label: "Xem" }, { key: "orders_edit", label: "Sửa/Thêm" }, { key: "orders_delete", label: "Xoá" },
  ] },
  { key: "crm", label: "Khách hàng", actions: [
    { key: "crm_view", label: "Xem" }, { key: "crm_edit", label: "Sửa/Thêm" }, { key: "crm_delete", label: "Xoá" },
  ] },
  { key: "suppliers", label: "Nhà cung cấp", actions: [
    { key: "suppliers_view", label: "Xem" }, { key: "suppliers_edit", label: "Sửa/Thêm" }, { key: "suppliers_delete", label: "Xoá" },
  ] },
  { key: "warehouse", label: "Kho hàng", actions: [
    { key: "warehouse_view", label: "Xem" }, { key: "warehouse_edit", label: "Sửa/Thêm" },
  ] },
  { key: "finance", label: "Thu chi", actions: [
    { key: "finance_view", label: "Xem" }, { key: "finance_edit", label: "Sửa/Thêm" }, { key: "finance_delete", label: "Xoá" },
  ] },
  { key: "vatinvoice", label: "Hoá đơn VAT", actions: [
    { key: "vatinvoice_view", label: "Xem" }, { key: "vatinvoice_edit", label: "Sửa/Thêm" },
  ] },
  { key: "shipping", label: "Vận chuyển", actions: [
    { key: "shipping_view", label: "Xem" }, { key: "shipping_edit", label: "Sửa/Thêm" }, { key: "shipping_delete", label: "Xoá" },
  ] },
  { key: "reports", label: "Báo cáo", actions: [{ key: "reports", label: "Xem" }] },
  { key: "employees", label: "Nhân viên", actions: [
    { key: "employees_view", label: "Xem" }, { key: "employees_edit", label: "Sửa/Thêm" }, { key: "employees_delete", label: "Xoá" },
  ] },
  { key: "settings", label: "Cài đặt", actions: [
    { key: "settings_view", label: "Xem" }, { key: "settings_edit", label: "Sửa/Thêm" },
  ] },
  { key: "warranty", label: "Bảo hành", actions: [
    { key: "warranty_view", label: "Xem" }, { key: "warranty_edit", label: "Sửa/Thêm" },
  ] },
  { key: "extra", label: "Khác", actions: [
    { key: "view_cost", label: "Xem giá vốn" }, { key: "view_revenue", label: "Xem doanh thu" },
  ] },
];

// Danh sách quyền hợp lệ (flat) — dùng để validate khi lưu phân quyền 1 role.
export const ALL_PERMISSIONS = PERMISSION_MODULES.flatMap((m) => m.actions.map((a) => a.key));

const SAFE_COLS = `id, name, username, role, warehouse_id, phone, email, active, created_at`;

// GET /api/users → nhân viên (KHÔNG bao giờ trả password_hash)
export const list = asyncHandler(async (req, res) => {
  res.json((await query(`SELECT ${SAFE_COLS} FROM users ORDER BY created_at DESC`)).rows);
});

// POST /api/users  { name, username, password, role, warehouseId, phone, email }
export const create = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.username || !b.password || !b.role) throw badRequest("Thiếu thông tin nhân viên");
  const passwordHash = await bcrypt.hash(b.password, 12);
  const { rows } = await query(
    `INSERT INTO users (name, username, password_hash, role, warehouse_id, phone, email)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${SAFE_COLS}`,
    [b.name, b.username, passwordHash, b.role, b.warehouseId || null, b.phone || null, b.email || null]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/users/:id  (đổi mật khẩu chỉ khi gửi field password)
export const update = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const passwordHash = b.password ? await bcrypt.hash(b.password, 12) : null;
  const { rows } = await query(
    `UPDATE users SET name=COALESCE($1,name), role=COALESCE($2,role), warehouse_id=$3,
        phone=$4, email=$5, active=COALESCE($6,active),
        password_hash=COALESCE($7,password_hash)
      WHERE id=$8 RETURNING ${SAFE_COLS}`,
    [b.name, b.role, b.warehouseId || null, b.phone || null, b.email || null, b.active, passwordHash, req.params.id]
  );
  if (!rows.length) throw notFound();
  res.json(rows[0]);
});

export const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
  if (!rowCount) throw notFound();
  res.status(204).end();
});

// GET /api/roles → danh sách role để gán cho nhân viên
export const listRoles = asyncHandler(async (req, res) => {
  res.json((await query(`SELECT name FROM roles ORDER BY name`)).rows.map((r) => r.name));
});

// GET /api/permissions → ma trận quyền theo module (để dựng bảng Xem/Sửa/Xoá ở frontend)
export const listPermissions = asyncHandler(async (req, res) => {
  res.json(PERMISSION_MODULES);
});

// GET /api/roles/full → từng role kèm danh sách quyền hiện có (để hiển thị ma trận phân quyền)
export const listRolesFull = asyncHandler(async (req, res) => {
  const roles = (await query(`SELECT name FROM roles ORDER BY name`)).rows.map((r) => r.name);
  const perms = (await query(`SELECT role, permission FROM role_permissions`)).rows;
  const byRole = {};
  for (const r of roles) byRole[r] = [];
  for (const p of perms) (byRole[p.role] ||= []).push(p.permission);
  res.json(roles.map((name) => ({ name, permissions: byRole[name] || [] })));
});

// POST /api/roles  { name } → tạo vai trò mới (chưa có quyền nào)
export const createRole = asyncHandler(async (req, res) => {
  const name = (req.body || {}).name;
  if (!name) throw badRequest("Thiếu tên vai trò");
  await query(`INSERT INTO roles(name) VALUES($1) ON CONFLICT DO NOTHING`, [name]);
  res.status(201).json({ name, permissions: [] });
});

// PUT /api/roles/:role/permissions  { permissions: [] } → ghi đè toàn bộ quyền của 1 role
export const setRolePermissions = asyncHandler(async (req, res) => {
  const role = req.params.role;
  const permissions = Array.isArray((req.body || {}).permissions) ? req.body.permissions.filter((p) => ALL_PERMISSIONS.includes(p)) : [];
  const exists = (await query(`SELECT 1 FROM roles WHERE name = $1`, [role])).rows.length;
  if (!exists) throw notFound("Vai trò không tồn tại");
  await withTransaction(async (c) => {
    await c.query(`DELETE FROM role_permissions WHERE role = $1`, [role]);
    for (const p of permissions) {
      await c.query(`INSERT INTO role_permissions(role, permission) VALUES($1,$2)`, [role, p]);
    }
  });
  res.json({ name: role, permissions });
});
