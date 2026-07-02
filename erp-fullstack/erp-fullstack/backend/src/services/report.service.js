import { query } from "../config/db.js";

// Báo cáo lợi nhuận: lợi nhuận = SUM(qty * (price_at_sale - cost_at_sale)) (#11).
// LUÔN dùng cost_at_sale đã chốt lúc bán, KHÔNG dùng products.cost hiện tại.
export async function profitReport({ from, to, shopId, source } = {}) {
  const params = [];
  // Đơn Haravan chỉ nhập để theo dõi lịch sử/bảo hành khi chuyển sàn — không tính vào doanh thu ERP
  // (tránh trùng với doanh thu đã ghi nhận bên Haravan lúc bán).
  let where = `o.status = 'Hoàn thành' AND o.order_source != 'Haravan'`;
  if (from) { params.push(from); where += ` AND o.created_at >= $${params.length}`; }
  if (to) { params.push(to); where += ` AND o.created_at <= $${params.length}`; }
  if (shopId) { params.push(shopId); where += ` AND o.shop_id = $${params.length}`; }
  if (source) { params.push(source); where += ` AND o.order_source = $${params.length}`; }

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

// Công nợ Shop TMĐT: mỗi shop hiện tổng đơn, tổng giá trị, đã thu, còn phải thu.
// Giống cách tính công nợ khách hàng (SUM(total-paid)) nhưng nhóm theo shop_id, chỉ tính đơn TMĐT chưa huỷ.
export async function shopDebtReport() {
  const { rows } = await query(
    `SELECT s.id, s.name,
            COUNT(o.id)                                            AS orders,
            COALESCE(SUM(o.total), 0)                              AS total,
            COALESCE(SUM(o.paid), 0)                                AS paid,
            COALESCE(SUM(GREATEST(o.total - o.paid, 0)), 0)        AS debt
       FROM shops s
       LEFT JOIN orders o ON o.shop_id = s.id AND o.is_ecommerce = true AND o.status != 'Đã huỷ'
      GROUP BY s.id, s.name
      ORDER BY s.name`
  );
  return rows;
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
