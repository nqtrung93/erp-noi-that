// Seed dữ liệu khởi tạo: roles, permissions, danh mục thu/chi mặc định, admin user.
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { pool, withTransaction } from "../config/db.js";

dotenv.config();

const ROLE_PERMS = {
  "Admin": [
    "dashboard",
    "cashbook_view", "cashbook_edit", "cashbook_delete",
    "partners_view", "partners_edit", "partners_delete",
    "categories_view", "categories_edit",
    "inventory_view", "inventory_edit",
    "orders_view", "orders_edit",
    "purchases_view", "purchases_edit",
    "payroll_view", "payroll_edit",
    "bank_view", "bank_edit",
    "reports",
    "users_view", "users_edit",
    "settings_view", "settings_edit",
  ],
  "Kế toán": [
    "dashboard",
    "cashbook_view", "cashbook_edit",
    "partners_view", "partners_edit",
    "categories_view",
    "inventory_view", "inventory_edit",
    "orders_view", "orders_edit",
    "purchases_view", "purchases_edit",
    "payroll_view", "payroll_edit",
    "bank_view", "bank_edit",
    "reports",
  ],
  "Xem báo cáo": ["dashboard", "cashbook_view", "partners_view", "inventory_view", "orders_view", "purchases_view", "payroll_view", "bank_view", "reports"],
};

const EXPENSE_CATEGORIES = ["Lương", "Mặt bằng", "Nguyên vật liệu", "Điện nước", "Chi phí khác", "Nhập hàng", "Nộp BHXH/BHYT/BHTN", "Trả lương"];
const INCOME_CATEGORIES = ["Bán hàng", "Thu khác"];
const WAREHOUSES = [{ code: "KHO01", name: "Kho chính", address: "" }];

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME || "admin";
  const plainPw = process.env.SEED_ADMIN_PASSWORD;
  if (!plainPw) throw new Error("Thiếu SEED_ADMIN_PASSWORD trong .env");

  const passwordHash = await bcrypt.hash(plainPw, 12);

  await withTransaction(async (c) => {
    for (const role of Object.keys(ROLE_PERMS)) {
      await c.query(`INSERT INTO roles(name) VALUES($1) ON CONFLICT DO NOTHING`, [role]);
      for (const perm of ROLE_PERMS[role]) {
        await c.query(
          `INSERT INTO role_permissions(role, permission) VALUES($1,$2) ON CONFLICT DO NOTHING`,
          [role, perm]
        );
      }
    }
    for (const name of EXPENSE_CATEGORIES) {
      await c.query(`INSERT INTO categories(name, type) VALUES($1,'Chi') ON CONFLICT DO NOTHING`, [name]);
    }
    for (const name of INCOME_CATEGORIES) {
      await c.query(`INSERT INTO categories(name, type) VALUES($1,'Thu') ON CONFLICT DO NOTHING`, [name]);
    }
    for (const w of WAREHOUSES) {
      await c.query(`INSERT INTO warehouses(code, name, address) VALUES($1,$2,$3) ON CONFLICT (code) DO NOTHING`,
        [w.code, w.name, w.address]);
    }
    await c.query(
      `INSERT INTO users(name, username, password_hash, role, active)
       VALUES('Quản trị viên', $1, $2, 'Admin', true)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [username, passwordHash]
    );
  });

  console.log(`✓ Seed xong. Tài khoản admin: ${username} (mật khẩu lấy từ .env, đã hash bcrypt).`);
}

main()
  .catch((e) => { console.error("✗ Seed lỗi:", e.message); process.exitCode = 1; })
  .finally(() => pool.end());
