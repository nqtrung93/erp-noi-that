import { query } from "../config/db.js";
import { asyncHandler, badRequest, notFound } from "../utils/http.js";

// Số dư KHÔNG lưu cố định — luôn tính = opening_balance + SUM(Thu) - SUM(Chi) lúc truy vấn,
// nên mọi giao dịch (đơn hàng, công nợ, sổ quỹ) chỉ cần gắn đúng bank_account_id là tự "đồng bộ".
const BALANCE_EXPR = `b.opening_balance
  + COALESCE((SELECT SUM(amount) FROM transactions WHERE bank_account_id = b.id AND type = 'Thu'), 0)
  - COALESCE((SELECT SUM(amount) FROM transactions WHERE bank_account_id = b.id AND type = 'Chi'), 0)`;

export const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT b.*, (${BALANCE_EXPR}) AS balance FROM bank_accounts b ORDER BY b.created_at`
  );
  res.json(rows);
});

export const create = asyncHandler(async (req, res) => {
  const { name, bankName, accountNumber, openingBalance } = req.body || {};
  if (!name?.trim()) throw badRequest("Thiếu tên tài khoản");
  const { rows } = await query(
    `INSERT INTO bank_accounts (name, bank_name, account_number, opening_balance)
     VALUES ($1,$2,$3,$4) RETURNING *, $4 AS balance`,
    [name.trim(), bankName || null, accountNumber || null, Number(openingBalance) || 0]
  );
  res.status(201).json(rows[0]);
});

export const update = asyncHandler(async (req, res) => {
  const { name, bankName, accountNumber, openingBalance } = req.body || {};
  const { rows } = await query(
    `UPDATE bank_accounts SET
        name = COALESCE($1, name), bank_name = $2, account_number = $3,
        opening_balance = COALESCE($4, opening_balance)
      WHERE id = $5 RETURNING *`,
    [name?.trim() || null, bankName || null, accountNumber || null,
     openingBalance != null ? Number(openingBalance) : null, req.params.id]
  );
  if (!rows[0]) throw notFound();
  res.json(rows[0]);
});

export const remove = asyncHandler(async (req, res) => {
  const used = await query(`SELECT 1 FROM transactions WHERE bank_account_id = $1 LIMIT 1`, [req.params.id]);
  if (used.rows.length) throw badRequest("Không thể xoá — tài khoản đã có giao dịch liên kết, hãy xoá/chuyển các giao dịch trước");
  await query(`DELETE FROM bank_accounts WHERE id = $1`, [req.params.id]);
  res.status(204).end();
});

// Lịch sử giao dịch của 1 tài khoản — dùng cho modal "Xem giao dịch" trên trang Ngân hàng.
export const transactionsForAccount = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT t.*, o.code AS order_code
       FROM transactions t
       LEFT JOIN orders o ON t.ref_type = 'order' AND o.id = t.ref_id
      WHERE t.bank_account_id = $1
      ORDER BY t.created_at DESC`,
    [req.params.id]
  );
  res.json(rows);
});
