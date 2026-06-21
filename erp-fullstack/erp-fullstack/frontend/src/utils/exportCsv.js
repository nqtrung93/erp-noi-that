// Xuất 1 danh sách object thành file CSV (mở được bằng Excel), tải xuống ngay trên trình duyệt.
// columns: [{ key, label }] — key dùng để lấy giá trị từ mỗi dòng, có thể là hàm (row) => value.
export function exportCsv(filename, columns, rows) {
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escape(typeof c.key === "function" ? c.key(row) : row[c.key])).join(",")
  );
  const csv = "﻿" + [header, ...lines].join("\n"); // BOM để Excel hiện đúng tiếng Việt
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
