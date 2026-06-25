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

// Công nợ: liệt kê đối tượng đang có nợ > 0, theo loại.
export async function debtReport(type) {
  const conds = ["debt > 0"];
  const params = [];
  if (type) { params.push(type); conds.push(`type = $${params.length}`); }
  const { rows } = await query(
    `SELECT id, code, name, type, phone, debt FROM partners WHERE ${conds.join(" AND ")} ORDER BY debt DESC`,
    params
  );
  return rows;
}
