import { badRequest } from "../utils/http.js";

// Tất cả hàm nhận `client` (trong transaction) để đảm bảo nhất quán.

// Lấy tồn hiện tại theo (product, variant, warehouse). variantId có thể null.
export async function getStock(client, productId, variantId, warehouseId) {
  const { rows } = await client.query(
    `SELECT qty FROM warehouse_stock
      WHERE product_id = $1
        AND COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE($2, '00000000-0000-0000-0000-000000000000'::uuid)
        AND warehouse_id = $3`,
    [productId, variantId, warehouseId]
  );
  return rows[0]?.qty ?? 0;
}

// Kiểm tra đủ tồn cho danh sách item (#7). Ném lỗi nếu thiếu.
export async function assertEnoughStock(client, warehouseId, items) {
  for (const it of items) {
    const have = await getStock(client, it.productId, it.variantId ?? null, warehouseId);
    if (have < it.qty) {
      throw badRequest(
        `Không đủ tồn cho "${it.name}" tại kho: cần ${it.qty}, còn ${have}`
      );
    }
  }
}

// Áp dụng thay đổi tồn + ghi 1 stock movement (#8/#9).
// qtyChange âm = xuất bán, dương = hoàn về.
export async function applyMovement(client, {
  productId, variantId = null, warehouseId, qtyChange,
  type, refType = null, refId = null, reason = null, createdBy = null,
}) {
  // Upsert tồn
  await client.query(
    `INSERT INTO warehouse_stock (product_id, variant_id, warehouse_id, qty)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), warehouse_id)
     DO UPDATE SET qty = warehouse_stock.qty + EXCLUDED.qty`,
    [productId, variantId, warehouseId, qtyChange]
  );
  // Ghi movement (audit)
  await client.query(
    `INSERT INTO stock_movements
       (product_id, variant_id, warehouse_id, qty_change, type, ref_type, ref_id, reason, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [productId, variantId, warehouseId, qtyChange, type, refType, refId, reason, createdBy]
  );
}
