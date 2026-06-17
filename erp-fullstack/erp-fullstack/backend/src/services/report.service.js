import { query } from "../config/db.js";

// Báo cáo lợi nhuận: lợi nhuận = SUM(qty * (price_at_sale - cost_at_sale)) (#11).
// LUÔN dùng cost_at_sale đã chốt lúc bán, KHÔNG dùng products.cost hiện tại.
export async function profitReport({ from, to } = {}) {
  const params = [];
  let where = `o.status = 'Hoàn thành'`;
  if (from) { params.push(from); where += ` AND o.created_at >= $${params.length}`; }
  if (to) { params.push(to); where += ` AND o.created_at <= $${params.length}`; }

  const { rows } = await query(
    `SELECT
        COALESCE(SUM(oi.qty * oi.price_at_sale), 0)                       AS revenue,
        COALESCE(SUM(oi.qty * oi.cost_at_sale), 0)                        AS cogs,
        COALESCE(SUM(oi.qty * (oi.price_at_sale - oi.cost_at_sale)), 0)   AS profit,
        COUNT(DISTINCT o.id)                                             AS orders
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
      WHERE ${where}`,
    params
  );
  const r = rows[0];
  const revenue = Number(r.revenue);
  const profit = Number(r.profit);
  return {
    revenue,
    cogs: Number(r.cogs),
    profit,
    orders: Number(r.orders),
    margin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
  };
}

// Giá trị tồn kho theo cost hiện tại (báo cáo tồn, khác với lợi nhuận).
export async function inventoryValue() {
  const { rows } = await query(
    `SELECT p.id, p.name,
            COALESCE(SUM(ws.qty), 0) AS total_qty,
            COALESCE(SUM(ws.qty * COALESCE(v.cost, p.cost)), 0) AS stock_value
       FROM products p
       LEFT JOIN warehouse_stock ws ON ws.product_id = p.id
       LEFT JOIN product_variants v ON v.id = ws.variant_id
      GROUP BY p.id, p.name
      ORDER BY p.name`
  );
  return rows;
}
