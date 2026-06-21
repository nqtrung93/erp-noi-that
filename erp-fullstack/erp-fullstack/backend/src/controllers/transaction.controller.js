import { query } from "../config/db.js";
import { asyncHandler, badRequest } from "../utils/http.js";
import { nextDocNo } from "../utils/docFormat.js";

// GET /api/transactions → kèm mã đơn hàng liên quan (nếu ref_type='order') để lọc/hiển thị
export const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT t.*, o.code AS order_code
       FROM transactions t
       LEFT JOIN orders o ON t.ref_type = 'order' AND o.id = t.ref_id
      ORDER BY t.created_at DESC`
  );
  res.json(rows);
});

// POST /api/transactions  { type, category, amount, method, partyType, partyName, note, date } → phiếu thu/chi độc lập
// Tự sinh mã phiếu (TX-xxxxxx), KHÔNG gắn với đơn hàng cụ thể (dùng cho chi phí chung, thu khác...).
export const create = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!["Thu", "Chi"].includes(b.type)) throw badRequest("Loại phiếu không hợp lệ");
  if (!b.amount || Number(b.amount) <= 0) throw badRequest("Số tiền không hợp lệ");

  const code = await nextDocNo({ query }, "transaction");
  const { rows } = await query(
    `INSERT INTO transactions (code, type, category, amount, method, party_type, party_name, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [code, b.type, b.category || null, Number(b.amount), b.method || null,
     b.partyType || null, b.partyName || null, b.note || null, req.user.sub]
  );
  res.status(201).json(rows[0]);
});
