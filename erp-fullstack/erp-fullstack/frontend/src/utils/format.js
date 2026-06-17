// Định dạng tiền tệ VND dùng chung.
export const fmt = (n) => Number(n || 0).toLocaleString("vi-VN") + " \u20ab";
export const fmtShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, "") + " tỷ";
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + " tr";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "k";
  return v.toLocaleString("vi-VN");
};
export const fmtDate = (d) => new Date(d).toLocaleDateString("vi-VN");
