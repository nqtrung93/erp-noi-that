import jwt from "jsonwebtoken";
import { query } from "../config/db.js";
import { unauthorized, forbidden } from "../utils/http.js";

// Xác thực JWT từ header Authorization: Bearer <token>
export function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { sub, username, role, warehouseId }
    next();
  } catch {
    next(unauthorized("Token không hợp lệ hoặc đã hết hạn"));
  }
}

// Kiểm tra quyền Ở BACKEND (#6). Quyền lấy từ role_permissions theo role của user.
// Dùng: router.post('/', verifyToken, requirePerm('orders'), handler)
export function requirePerm(permission) {
  return async (req, res, next) => {
    try {
      if (!req.user) return next(unauthorized());
      const { rows } = await query(
        `SELECT 1 FROM role_permissions WHERE role = $1 AND permission = $2 LIMIT 1`,
        [req.user.role, permission]
      );
      if (!rows.length) return next(forbidden(`Vai trò "${req.user.role}" không có quyền "${permission}"`));
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Lấy toàn bộ quyền của 1 role (để trả về cho frontend dựng menu/ẩn nút).
export async function getPermissions(role) {
  const { rows } = await query(`SELECT permission FROM role_permissions WHERE role = $1`, [role]);
  return rows.map((r) => r.permission);
}
