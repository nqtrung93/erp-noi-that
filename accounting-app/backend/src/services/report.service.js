import { query } from "../config/db.js";

// Sổ quỹ: tổng thu/chi trong kỳ + số dư.
export async function cashbook({ from, to }) {
  const conds = [];
  const params = [];
  if (from) { params.push(from); conds.push(`date >= $${params.length}`); }
  if (to) { params.push(to); conds.push(`date <= $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const { rows } = await query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE type = 'Thu'), 0) AS total_in,
       COALESCE(SUM(amount) FILTER (WHERE type = 'Chi'), 0) AS total_out
     FROM transactions ${where}`,
    params
  );
  const { total_in, total_out } = rows[0];
  return { totalIn: Number(total_in), totalOut: Number(total_out), balance: Number(total_in) - Number(total_out) };
}

// Báo cáo lãi/lỗ đơn giản: Thu - Chi, gom theo danh mục, trong kỳ.
export async function profitLoss({ from, to }) {
  const conds = [];
  const params = [];
  if (from) { params.push(from); conds.push(`date >= $${params.length}`); }
  if (to) { params.push(to); conds.push(`date <= $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const { rows } = await query(
    `SELECT type, COALESCE(category_name, 'Khác') AS category, SUM(amount) AS total
       FROM transactions ${where}
       GROUP BY type, category_name
       ORDER BY type, total DESC`,
    params
  );
  const income = rows.filter((r) => r.type === "Thu").map((r) => ({ category: r.category, total: Number(r.total) }));
  const expense = rows.filter((r) => r.type === "Chi").map((r) => ({ category: r.category, total: Number(r.total) }));
  const totalIncome = income.reduce((s, r) => s + r.total, 0);
  const totalExpense = expense.reduce((s, r) => s + r.total, 0);
  return { income, expense, totalIncome, totalExpense, profit: totalIncome - totalExpense };
}

// Công nợ: liệt kê đối tượng đang có nợ khác 0 (dương = họ nợ mình, âm = mình nợ lại họ), theo loại.
export async function debtReport(type) {
  const conds = ["debt <> 0"];
  const params = [];
  if (type) { params.push(type); conds.push(`type = $${params.length}`); }
  const { rows } = await query(
    `SELECT id, code, name, type, phone, debt FROM partners WHERE ${conds.join(" AND ")} ORDER BY debt DESC`,
    params
  );
  const receivable = rows.filter((r) => Number(r.debt) > 0);
  const payable = rows.filter((r) => Number(r.debt) < 0);
  return {
    rows,
    totalReceivable: receivable.reduce((s, r) => s + Number(r.debt), 0),
    totalPayable: payable.reduce((s, r) => s + Math.abs(Number(r.debt)), 0),
  };
}

// Báo cáo tồn kho: số lượng + giá trị tồn (qty * giá vốn) theo từng sản phẩm/biến thể/kho.
export async function inventoryReport() {
  const { rows } = await query(
    `SELECT ws.id, ws.qty, ws.variant_id, p.name AS product_name, p.sku, p.unit, p.cost AS product_cost,
            v.attrs AS variant_attrs, v.sku AS variant_sku, v.cost AS variant_cost,
            w.name AS warehouse_name
       FROM warehouse_stock ws
       JOIN products p ON p.id = ws.product_id
       LEFT JOIN product_variants v ON v.id = ws.variant_id
       JOIN warehouses w ON w.id = ws.warehouse_id
       WHERE ws.qty <> 0
       ORDER BY p.name`
  );
  const items = rows.map((r) => {
    const cost = Number(r.variant_id ? r.variant_cost : r.product_cost) || 0;
    return { ...r, cost, value: Number(r.qty) * cost };
  });
  return { items, totalQty: items.reduce((s, r) => s + Number(r.qty), 0), totalValue: items.reduce((s, r) => s + r.value, 0) };
}

// Báo cáo bán hàng trong kỳ: tổng quan đơn hàng (bỏ qua Nháp) + top sản phẩm bán chạy.
export async function salesReport({ from, to }) {
  const conds = ["o.status <> 'Nháp'"];
  const params = [];
  if (from) { params.push(from); conds.push(`o.created_at >= $${params.length}`); }
  if (to) { params.push(to); conds.push(`o.created_at < ($${params.length + 1}::date + interval '1 day')`); params.push(to); }
  const where = `WHERE ${conds.join(" AND ")}`;

  const summaryRows = (await query(
    `SELECT o.status, COUNT(*) AS cnt, COALESCE(SUM(o.total),0) AS total, COALESCE(SUM(o.paid),0) AS paid
       FROM orders o ${where} GROUP BY o.status`,
    params
  )).rows;
  const byStatus = summaryRows.map((r) => ({ status: r.status, count: Number(r.cnt), total: Number(r.total), paid: Number(r.paid) }));
  const totalOrders = byStatus.reduce((s, r) => s + r.count, 0);
  const totalRevenue = byStatus.reduce((s, r) => s + r.total, 0);
  const totalPaid = byStatus.reduce((s, r) => s + r.paid, 0);

  const topProducts = (await query(
    `SELECT p.id, p.name, COALESCE(SUM(oi.qty),0) AS qty, COALESCE(SUM(oi.qty * oi.price),0) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       ${where}
       GROUP BY p.id, p.name
       ORDER BY revenue DESC
       LIMIT 15`,
    params
  )).rows.map((r) => ({ id: r.id, name: r.name, qty: Number(r.qty), revenue: Number(r.revenue) }));

  return { byStatus, totalOrders, totalRevenue, totalPaid, totalDue: totalRevenue - totalPaid, topProducts };
}

// Báo cáo mua hàng trong kỳ: tổng quan đơn mua (bỏ qua Nháp) + top sản phẩm nhập nhiều.
export async function purchaseReport({ from, to }) {
  const conds = ["po.status <> 'Nháp'"];
  const params = [];
  if (from) { params.push(from); conds.push(`po.created_at >= $${params.length}`); }
  if (to) { params.push(to); conds.push(`po.created_at < ($${params.length + 1}::date + interval '1 day')`); params.push(to); }
  const where = `WHERE ${conds.join(" AND ")}`;

  const summaryRows = (await query(
    `SELECT po.status, COUNT(*) AS cnt, COALESCE(SUM(po.total),0) AS total, COALESCE(SUM(po.paid),0) AS paid
       FROM purchase_orders po ${where} GROUP BY po.status`,
    params
  )).rows;
  const byStatus = summaryRows.map((r) => ({ status: r.status, count: Number(r.cnt), total: Number(r.total), paid: Number(r.paid) }));
  const totalOrders = byStatus.reduce((s, r) => s + r.count, 0);
  const totalSpent = byStatus.reduce((s, r) => s + r.total, 0);
  const totalPaid = byStatus.reduce((s, r) => s + r.paid, 0);

  const topProducts = (await query(
    `SELECT p.id, p.name, COALESCE(SUM(poi.qty),0) AS qty, COALESCE(SUM(poi.qty * poi.price),0) AS spent
       FROM purchase_order_items poi
       JOIN purchase_orders po ON po.id = poi.purchase_order_id
       JOIN products p ON p.id = poi.product_id
       ${where}
       GROUP BY p.id, p.name
       ORDER BY spent DESC
       LIMIT 15`,
    params
  )).rows.map((r) => ({ id: r.id, name: r.name, qty: Number(r.qty), spent: Number(r.spent) }));

  return { byStatus, totalOrders, totalSpent, totalPaid, totalDue: totalSpent - totalPaid, topProducts };
}
