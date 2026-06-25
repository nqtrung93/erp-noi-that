import { query, withTransaction } from "../config/db.js";
import { asyncHandler, badRequest } from "../utils/http.js";
import { nextDocNo } from "../utils/docFormat.js";

// GET /api/transactions?from=&to=&type=&categoryId=&partnerId= — kèm tên danh mục hiện tại nếu còn liên kết
export const list = asyncHandler(async (req, res) => {
  const { from, to, type, categoryId, partnerId } = req.query;
  const conds = [];
  const params = [];
  if (from) { params.push(from); conds.push(`t.date >= $${params.length}`); }
  if (to) { params.push(to); conds.push(`t.date <= $${params.length}`); }
  if (type) { params.push(type); conds.push(`t.type = $${params.length}`); }
  if (categoryId) { params.push(categoryId); conds.push(`t.category_id = $${params.length}`); }
  if (partnerId) { params.push(partnerId); conds.push(`t.partner_id = $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const { rows } = await query(
    `SELECT t.*, c.name AS category_label, u.name AS created_by_name
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN users u ON u.id = t.created_by
       ${where}
       ORDER BY t.date DESC, t.id DESC`,
    params
  );
  res.json(rows);
});

// POST /api/transactions  { type, amount, categoryId, date, method, partnerId, partnerName, bankAccountId, note }
export const create = asyncHandler(async (req, res) => {
  const { type, amount, categoryId, date, method, partnerId, partnerName, bankAccountId, note } = req.body || {};
  if (!["Thu", "Chi"].includes(type)) throw badRequest("Loại phiếu không hợp lệ");
  if (!amount || Number(amount) <= 0) throw badRequest("Số tiền không hợp lệ");

  const result = await withTransaction(async (c) => {
    let categoryName = null;
    if (categoryId) {
      const cat = (await c.query(`SELECT name FROM categories WHERE id = $1`, [categoryId])).rows[0];
      categoryName = cat?.name || null;
    }
    const code = await nextDocNo(c, "transaction");
    const { rows } = await c.query(
      `INSERT INTO transactions(code, type, category_id, category_name, amount, date, method, partner_id, partner_name, bank_account_id, note, created_by)
       VALUES($1,$2,$3,$4,$5,COALESCE($6, CURRENT_DATE),$7,$8,$9,$10,$11,$12) RETURNING *`,
      [code, type, categoryId || null, categoryName, Number(amount), date || null, method || null,
        partnerId || null, partnerName || null, bankAccountId || null, note || null, req.user.sub]
    );
    return rows[0];
  });
  res.status(201).json(result);
});
