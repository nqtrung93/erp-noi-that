import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { query } from "../config/db.js";
import { unauthorized } from "../utils/http.js";

export async function login(username, password) {
  const { rows } = await query(`SELECT * FROM users WHERE username = $1 AND active = true`, [username]);
  const user = rows[0];
  if (!user) throw unauthorized("Tài khoản hoặc mật khẩu không đúng");

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw unauthorized("Tài khoản hoặc mật khẩu không đúng");

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
  );
  return { token };
}
