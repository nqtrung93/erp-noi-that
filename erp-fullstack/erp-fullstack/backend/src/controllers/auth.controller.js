import * as authService from "../services/auth.service.js";
import { getPermissions } from "../middleware/auth.js";
import { asyncHandler, badRequest } from "../utils/http.js";
import { query } from "../config/db.js";

// POST /api/auth/login  { username, password }
export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw badRequest("Thiếu tài khoản hoặc mật khẩu");
  const result = await authService.login(username, password);
  res.json(result);
});

// GET /api/auth/me  (cần token) → trả thông tin user + quyền
export const me = asyncHandler(async (req, res) => {
  const u = (await query(
    `SELECT u.id,u.name,u.username,u.role,u.warehouse_id, w.code AS warehouse_code
       FROM users u LEFT JOIN warehouses w ON w.id=u.warehouse_id WHERE u.id=$1`,
    [req.user.sub]
  )).rows[0];
  if (!u) throw badRequest("User không tồn tại");
  const permissions = await getPermissions(u.role);
  res.json({ ...u, permissions });
});
