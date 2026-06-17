// Chạy 1 file .sql: node src/db/run-sql.js src/db/schema.sql
import fs from "fs";
import path from "path";
import { pool } from "../config/db.js";

const file = process.argv[2];
if (!file) {
  console.error("Cách dùng: node src/db/run-sql.js <đường-dẫn.sql>");
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(file), "utf8");

try {
  await pool.query(sql);
  console.log(`✓ Đã chạy ${file}`);
} catch (err) {
  console.error("✗ Lỗi chạy SQL:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
