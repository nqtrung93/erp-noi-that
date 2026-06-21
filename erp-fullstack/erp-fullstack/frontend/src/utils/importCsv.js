// Đọc 1 file CSV (kể cả có dấu ngoặc kép bao quanh giá trị chứa dấu phẩy) thành mảng các dòng (mảng cột).
export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const clean = text.replace(/^﻿/, ""); // bỏ BOM nếu có (Excel thường thêm khi lưu CSV)

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else if (ch === "\r") {
      // bỏ qua, xử lý xuống dòng ở \n
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Đọc file CSV thành mảng object theo header dòng đầu tiên.
export function readCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsvText(String(reader.result));
      if (!rows.length) return resolve([]);
      const header = rows[0].map((h) => h.trim());
      const data = rows.slice(1).map((r) => {
        const obj = {};
        header.forEach((h, i) => { obj[h] = (r[i] || "").trim(); });
        return obj;
      });
      resolve(data);
    };
    reader.onerror = () => reject(new Error("Không đọc được file"));
    reader.readAsText(file, "utf-8");
  });
}
