// Gộp sản phẩm + biến thể thành 1 danh sách lựa chọn duy nhất (không hiện bước chọn biến thể riêng).
// Mỗi option kèm SKU (của biến thể nếu có, hoặc của sản phẩm) và tồn kho hiện tại (nếu có stockMap).
// stockMap: { "<productId>:<variantId|''>": qty }
export function buildSellableOptions(products, stockMap = {}) {
  const options = [];
  for (const p of products.filter((p) => p.active !== false)) {
    if (p.has_variants && p.variants?.length) {
      for (const v of p.variants) {
        const attrs = Object.values(v.attrs || {}).join(" / ");
        options.push({
          key: `${p.id}:${v.id}`, productId: p.id, variantId: v.id,
          label: attrs ? `${p.name} (${attrs})` : p.name,
          sku: v.sku || p.sku || "", price: Number(v.price), cost: Number(v.cost),
          stock: stockMap[`${p.id}:${v.id}`] ?? 0,
        });
      }
    } else {
      options.push({
        key: p.id, productId: p.id, variantId: null, label: p.name, sku: p.sku || "", price: Number(p.price), cost: Number(p.cost),
        stock: stockMap[`${p.id}:`] ?? 0,
      });
    }
  }
  return options;
}
