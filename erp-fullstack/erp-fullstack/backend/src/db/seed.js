// Seed dữ liệu khởi tạo: roles, permissions, warehouses, customer_groups, admin user.
// Mật khẩu admin lấy từ .env và được BCRYPT HASH (không lưu plaintext).
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { pool, withTransaction } from "../config/db.js";

dotenv.config();

const ROLE_PERMS = {
  "Admin": ["dashboard","products","orders","orders_edit","crm","suppliers","warehouse","finance","vatinvoice","shipping","reports","employees","view_cost","view_revenue"],
  "Quản lý kho": ["dashboard","products","warehouse","shipping","reports","view_cost","view_revenue"],
  "Nhân viên kho": ["products","warehouse","shipping","view_cost"],
  "Nhân viên bán hàng": ["dashboard","orders","crm","vatinvoice","shipping"],
};

const WAREHOUSES = [
  { code: "WH01", name: "Kho Hà Nội", address: "Hà Nội" },
  { code: "WH02", name: "Kho TP.HCM", address: "TP. Hồ Chí Minh" },
  { code: "WH03", name: "Kho Đà Nẵng", address: "Đà Nẵng" },
  { code: "WH04", name: "Kho Cần Thơ", address: "Cần Thơ" },
];

const CUSTOMER_GROUPS = ["Khách lẻ", "Đại lý", "Doanh nghiệp"];

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME || "admin";
  const plainPw = process.env.SEED_ADMIN_PASSWORD;
  if (!plainPw) throw new Error("Thiếu SEED_ADMIN_PASSWORD trong .env");

  const passwordHash = await bcrypt.hash(plainPw, 12);

  await withTransaction(async (c) => {
    // Roles + permissions
    for (const role of Object.keys(ROLE_PERMS)) {
      await c.query(`INSERT INTO roles(name) VALUES($1) ON CONFLICT DO NOTHING`, [role]);
      for (const perm of ROLE_PERMS[role]) {
        await c.query(
          `INSERT INTO role_permissions(role, permission) VALUES($1,$2) ON CONFLICT DO NOTHING`,
          [role, perm]
        );
      }
    }
    // Warehouses
    for (const w of WAREHOUSES) {
      await c.query(
        `INSERT INTO warehouses(code, name, address) VALUES($1,$2,$3) ON CONFLICT (code) DO NOTHING`,
        [w.code, w.name, w.address]
      );
    }
    // Customer groups
    for (const g of CUSTOMER_GROUPS) {
      await c.query(`INSERT INTO customer_groups(name) VALUES($1) ON CONFLICT DO NOTHING`, [g]);
    }
    // Admin user
    const wh = await c.query(`SELECT id FROM warehouses WHERE code='WH01'`);
    await c.query(
      `INSERT INTO users(name, username, password_hash, role, warehouse_id, active)
       VALUES('Quản trị viên', $1, $2, 'Admin', $3, true)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [username, passwordHash, wh.rows[0]?.id || null]
    );
  });

  console.log(`✓ Seed xong. Tài khoản admin: ${username} (mật khẩu lấy từ .env, đã hash bcrypt).`);
}

main()
  .catch((e) => { console.error("✗ Seed lỗi:", e.message); process.exitCode = 1; })
  .finally(() => pool.end());
