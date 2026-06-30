// Đọc số tiền VNĐ bằng chữ — dùng cho dòng "Số tiền bằng chữ" trên phiếu in.
const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function readGroup(n) {
  // n: 0-999
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const parts = [];
  if (h > 0) {
    parts.push(DIGITS[h], "trăm");
    if (t === 0 && u > 0) parts.push("linh");
  }
  if (t > 1) {
    parts.push(DIGITS[t], "mươi");
    if (u === 1) parts.push("mốt");
    else if (u === 5) parts.push("lăm");
    else if (u > 0) parts.push(DIGITS[u]);
  } else if (t === 1) {
    parts.push("mười");
    if (u === 1) parts.push("mốt");
    else if (u === 5) parts.push("lăm");
    else if (u > 0) parts.push(DIGITS[u]);
  } else if (h > 0 && u > 0) {
    parts.push(DIGITS[u]);
  } else if (h === 0 && u > 0) {
    parts.push(DIGITS[u]);
  }
  return parts.join(" ");
}

export function numberToVietnameseWords(amount) {
  const n = Math.round(Math.abs(Number(amount) || 0));
  if (n === 0) return "Không đồng.";

  const groups = [];
  let rest = n;
  while (rest > 0) {
    groups.unshift(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  const units = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  const total = groups.length;

  const words = [];
  groups.forEach((g, idx) => {
    if (g === 0) return;
    const unit = units[total - 1 - idx];
    words.push(`${readGroup(g)}${unit ? " " + unit : ""}`);
  });

  let result = words.join(" ").replace(/\s+/g, " ").trim();
  result = result.charAt(0).toUpperCase() + result.slice(1);
  return `${result} đồng chẵn.`;
}
