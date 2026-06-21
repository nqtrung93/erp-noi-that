import { spawn } from "child_process";
import { existsSync, readdirSync } from "fs";
import path from "path";

// Tìm pg_dump: ưu tiên PATH; trên Windows nếu không có trong PATH thì dò các bản cài
// PostgreSQL trong "C:\Program Files\PostgreSQL\<version>\bin\pg_dump.exe".
function findPgDump() {
  if (process.platform === "win32") {
    const base = "C:\\Program Files\\PostgreSQL";
    if (existsSync(base)) {
      const versions = readdirSync(base).sort().reverse(); // bản mới nhất trước
      for (const v of versions) {
        const exe = path.join(base, v, "bin", "pg_dump.exe");
        if (existsSync(exe)) return exe;
      }
    }
  }
  return "pg_dump"; // giả định có trong PATH (đúng với hầu hết server Linux có postgresql-client)
}

// Chạy pg_dump (format custom — phục hồi bằng pg_restore) và pipe trực tiếp ra response.
// Trả về Promise reject nếu pg_dump không khởi động được hoặc thoát với mã lỗi.
export function streamBackup(res, filename) {
  return new Promise((resolve, reject) => {
    const bin = findPgDump();
    const child = spawn(bin, ["--format=custom", "--no-owner", "--no-privileges", process.env.DATABASE_URL]);
    let headersSent = false;
    let stderr = "";

    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("spawn", () => {
      // Chỉ set header tải file SAU KHI pg_dump khởi động được — nếu lỗi trước đó (vd: không tìm
      // thấy binary) thì route vẫn trả JSON lỗi bình thường thay vì 1 file rỗng/hỏng.
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      headersSent = true;
      child.stdout.pipe(res);
    });

    child.on("error", (err) => {
      reject(new Error(`Không chạy được pg_dump ("${bin}"): ${err.message}. Cần cài PostgreSQL client tools trên server.`));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        const msg = `pg_dump thoát với mã lỗi ${code}: ${stderr || "không có chi tiết"}`;
        if (headersSent) { res.destroy(); console.error(msg); } else reject(new Error(msg));
        return;
      }
      resolve();
    });
  });
}
