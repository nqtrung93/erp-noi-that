import { query } from "../config/db.js";
import { asyncHandler, badRequest, notFound } from "../utils/http.js";

// GET /api/bank-accounts — kèm số dư hiện tại = opening_balance + Thu - Chi gắn tài khoản
export const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT b.*,
            b.opening_balance
              + COALESCE((SELECT SUM(amount) FROM transactions WHERE bank_account_id = b.id AND type = 'Thu'), 0)
              - COALESCE((SELECT SUM(amount) FROM transactions WHERE bank_account_id = b.id AND type = 'Chi'), 0)
              AS balance
       FROM bank_accounts b
       ORDER BY b.created_at DESC`
  );
  res.json(rows);
});

export const create = asyncHandler(async (req, res) => {
  const { name, bankName, accountNumber, openingBalance } = req.body || {};
  if (!name) throw badRequest("Thiếu tên tài khoản");
  const { rows } = await query(
    `INSERT INTO bank_accounts(name, bank_name, account_number, opening_balance) VALUES($1,$2,$3,$4) RETURNING *`,
    [name, bankName || null, accountNumber || null, Number(openingBalance) || 0]
  );
  res.status(201).json(rows[0]);
});

export const update = asyncHandler(async (req, res) => {
  const { name, bankName, accountNumber, openingBalance } = req.body || {};
  const { rows } = await query(
    `UPDATE bank_accounts SET name = COALESCE($1,name), bank_name = COALESCE($2,bank_name),
       account_number = COALESCE($3,account_number), opening_balance = COALESCE($4,opening_balance)
       WHERE id = $5 RETURNING *`,
    [name || null, bankName || null, accountNumber || null, openingBalance !== undefined ? Number(openingBalance) : null, req.params.id]
  );
  if (!rows.length) throw notFound();
  res.json(rows[0]);
});

export const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM bank_accounts WHERE id = $1`, [req.params.id]);
  if (!rowCount) throw notFound();
  res.status(204).end();
});

// GET /api/bank-accounts/:id/transactions
export const transactions = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM transactions WHERE bank_account_id = $1 ORDER BY date DESC, id DESC`,
    [req.params.id]
  );
  res.json(rows);
});
