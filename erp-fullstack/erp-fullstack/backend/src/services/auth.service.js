import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { query } from "../config/db.js";
import { getPermissions } from "../middleware/auth.js";
import { unauthorized } from "../utils/http.js";

// Đăng nhập: kiểm tra username + bcrypt.compare, ký JWT (#5).
export async function login(username, password) {
  const { rows } = await query(
    `SELECT u.*, w.code AS warehouse_code
       FROM users u LEFT JOIN warehouses w ON w.id = u.warehouse_id
      WHERE u.username = $1 AND u.active = true`,
    [username]
  );
  const user = rows[0];
  if (!user) throw unauthorized("Sai tài khoản hoặc mật khẩu");

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw unauthorized("Sai tài khoản hoặc mật khẩu");

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role, warehouseId: user.warehouse_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
  );

  const permissions = await getPermissions(user.role);

  // KHÔNG bao giờ trả password_hash ra ngoài
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      warehouseId: user.warehouse_id,
      warehouseCode: user.warehouse_code,
      permissions,
    },
  };
}

// Đổi mật khẩu (bcrypt hash lại).
export async function changePassword(userId, newPassword) {
  const hash = await bcrypt.hash(newPassword, 12);
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, userId]);
}
