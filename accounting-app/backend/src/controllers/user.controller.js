import bcrypt from "bcrypt";
import { query, withTransaction } from "../config/db.js";
import { asyncHandler, badRequest, notFound } from "../utils/http.js";

// Ma trận quyền theo module: mỗi module có 1 số hành động (xem/sửa/xoá). Quyền lưu trong DB
// dưới dạng chuỗi "<module>_<action>", trừ module chỉ có 1 hành động (dashboard, reports).
// Đây là NGUỒN DUY NHẤT cho UI ma trận phân quyền (GET /permissions) + validate khi lưu role.
export const PERMISSION_MODULES = [
  { key: "dashboard", label: "Tổng quan", actions: [{ key: "dashboard", label: "Xem" }] },
  { key: "cashbook", label: "Sổ quỹ", actions: [
    { key: "cashbook_view", label: "Xem" }, { key: "cashbook_edit", label: "Sửa/Thêm" }, { key: "cashbook_delete", label: "Xoá" },
  ] },
  { key: "bank", label: "Ngân hàng", actions: [
    { key: "bank_view", label: "Xem" }, { key: "bank_edit", label: "Sửa/Thêm" },
  ] },
  { key: "inventory", label: "Kho hàng", actions: [
    { key: "inventory_view", label: "Xem" }, { key: "inventory_edit", label: "Sửa/Thêm" },
  ] },
  { key: "orders", label: "Bán hàng", actions: [
    { key: "orders_view", label: "Xem" }, { key: "orders_edit", label: "Sửa/Thêm" },
  ] },
  { key: "purchases", label: "Mua hàng", actions: [
    { key: "purchases_view", label: "Xem" }, { key: "purchases_edit", label: "Sửa/Thêm" },
  ] },
  { key: "partners", label: "Công nợ", actions: [
    { key: "partners_view", label: "Xem" }, { key: "partners_edit", label: "Sửa/Thêm" }, { key: "partners_delete", label: "Xoá" },
  ] },
  { key: "payroll", label: "Lương & BHXH", actions: [
    { key: "payroll_view", label: "Xem" }, { key: "payroll_edit", label: "Sửa/Thêm" },
  ] },
  { key: "categories", label: "Danh mục", actions: [
    { key: "categories_view", label: "Xem" }, { key: "categories_edit", label: "Sửa/Thêm" },
  ] },
  { key: "reports", label: "Báo cáo", actions: [{ key: "reports", label: "Xem" }] },
  { key: "users", label: "Tài khoản", actions: [
    { key: "users_view", label: "Xem" }, { key: "users_edit", label: "Sửa/Thêm" },
  ] },
  { key: "settings", label: "Cài đặt", actions: [
    { key: "settings_view", label: "Xem" }, { key: "settings_edit", label: "Sửa/Thêm" },
  ] },
];

// Danh sách quyền hợp lệ (flat) — dùng để validate khi lưu phân quyền 1 role.
export const ALL_PERMISSIONS = PERMISSION_MODULES.flatMap((m) => m.actions.map((a) => a.key));

// GET /api/users → tài khoản (KHÔNG bao giờ trả password_hash)
export const list = asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT id, name, username, role, active, created_at FROM users ORDER BY created_at DESC`);
  res.json(rows);
});

// POST /api/users  { name, username, password, role }
export const create = asyncHandler(async (req, res) => {
  const { name, username, password, role } = req.body || {};
  if (!name || !username || !password || !role) throw badRequest("Thiếu thông tin");
  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await query(
    `INSERT INTO users(name, username, password_hash, role) VALUES($1,$2,$3,$4)
     RETURNING id, name, username, role, active, created_at`,
    [name, username, passwordHash, role]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/users/:id (đổi mật khẩu chỉ khi gửi field password)
export const update = asyncHandler(async (req, res) => {
  const { name, role, active, password } = req.body || {};
  const sets = [];
  const values = [];
  if (name !== undefined) { values.push(name); sets.push(`name = $${values.length}`); }
  if (role !== undefined) { values.push(role); sets.push(`role = $${values.length}`); }
  if (active !== undefined) { values.push(active); sets.push(`active = $${values.length}`); }
  if (password) { values.push(await bcrypt.hash(password, 12)); sets.push(`password_hash = $${values.length}`); }
  if (!sets.length) throw badRequest("Không có dữ liệu cập nhật");
  values.push(req.params.id);
  const { rows } = await query(
    `UPDATE users SET ${sets.join(",")} WHERE id = $${values.length} RETURNING id, name, username, role, active, created_at`,
    values
  );
  if (!rows.length) throw notFound();
  res.json(rows[0]);
});

export const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
  if (!rowCount) throw notFound();
  res.status(204).end();
});

// GET /api/roles → danh sách role để gán cho tài khoản
export const listRoles = asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT name FROM roles ORDER BY name`);
  res.json(rows.map((r) => r.name));
});

// GET /api/permissions → ma trận quyền theo module (để dựng bảng Xem/Sửa/Xoá ở frontend)
export const listPermissions = asyncHandler(async (req, res) => {
  res.json(PERMISSION_MODULES);
});

// GET /api/roles/full → từng role kèm danh sách quyền hiện có
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
