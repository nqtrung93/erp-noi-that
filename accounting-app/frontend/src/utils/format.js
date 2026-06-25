export function fmt(n) {
  return new Intl.NumberFormat("vi-VN").format(Number(n) || 0) + " đ";
}
