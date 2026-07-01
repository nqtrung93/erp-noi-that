import { query, withTransaction } from "../config/db.js";
import { asyncHandler, badRequest, notFound } from "../utils/http.js";
import { nextDocNo } from "../utils/docFormat.js";

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

// "Tiền mặt" là 1 quỹ ảo (không có dòng riêng trong bank_accounts) — số dư tính cùng công thức
// opening_balance + SUM(Thu) - SUM(Chi), nhưng lọc theo method='Tiền mặt' thay vì bank_account_id.
// Số dư đầu kỳ lưu trong app_settings (key='cash_opening_balance') vì không có bảng riêng cho quỹ này.
export const getCashBalance = asyncHandler(async (req, res) => {
  const [openingRow, sumRow] = await Promise.all([
    query(`SELECT value FROM app_settings WHERE key = 'cash_opening_balance'`),
    query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE type = 'Thu'), 0) AS thu,
         COALESCE(SUM(amount) FILTER (WHERE type = 'Chi'), 0) AS chi
       FROM transactions WHERE method = 'Tiền mặt'`
    ),
  ]);
  const openingBalance = Number(openingRow.rows[0]?.value) || 0;
  const { thu, chi } = sumRow.rows[0];
  res.json({ openingBalance, balance: openingBalance + Number(thu) - Number(chi) });
});

export const setCashOpeningBalance = asyncHandler(async (req, res) => {
  const { openingBalance } = req.body || {};
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('cash_opening_balance', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(Number(openingBalance) || 0)]
  );
  res.json({ ok: true });
});

// "Chuyển quỹ" nội bộ: ghi 1 cặp phiếu Chi (nơi đi) + Thu (nơi đến), cùng category "Chuyển quỹ nội bộ"
// để báo cáo Sổ quỹ loại trừ khỏi Tổng thu/Tổng chi (không phải doanh thu/chi phí thật) — nhưng số dư
// từng tài khoản/quỹ tiền mặt vẫn tính đúng vì công thức số dư luôn cộng dồn mọi dòng Thu/Chi.
const TRANSFER_CATEGORY = "Chuyển quỹ nội bộ";

export const transfer = asyncHandler(async (req, res) => {
  const { fromBankAccountId, toBankAccountId, amount, note } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt <= 0) throw badRequest("Số tiền không hợp lệ");
  if ((fromBankAccountId || null) === (toBankAccountId || null)) {
    throw badRequest("Nơi đi và nơi đến phải khác nhau");
  }

  async function resolveLabel(id) {
    if (!id) return "Tiền mặt";
    const { rows } = await query(`SELECT name FROM bank_accounts WHERE id = $1`, [id]);
    if (!rows.length) throw badRequest("Tài khoản không tồn tại");
    return rows[0].name;
  }
  const [fromLabel, toLabel] = await Promise.all([resolveLabel(fromBankAccountId), resolveLabel(toBankAccountId)]);
  const transferNote = `Chuyển quỹ: ${fromLabel} → ${toLabel}${note ? ` — ${note}` : ""}`;

  const result = await withTransaction(async (c) => {
    const codeOut = await nextDocNo(c, "transaction");
    const chiRow = (await c.query(
      `INSERT INTO transactions (code, type, category, amount, method, bank_account_id, party_type, note, created_by)
       VALUES ($1,'Chi',$2,$3,$4,$5,'Khác',$6,$7) RETURNING *`,
      [codeOut, TRANSFER_CATEGORY, amt, fromBankAccountId ? "Ngân hàng" : "Tiền mặt", fromBankAccountId || null, transferNote, req.user.sub]
    )).rows[0];

    const codeIn = await nextDocNo(c, "transaction");
    const thuRow = (await c.query(
      `INSERT INTO transactions (code, type, category, amount, method, bank_account_id, party_type, note, created_by)
       VALUES ($1,'Thu',$2,$3,$4,$5,'Khác',$6,$7) RETURNING *`,
      [codeIn, TRANSFER_CATEGORY, amt, toBankAccountId ? "Ngân hàng" : "Tiền mặt", toBankAccountId || null, transferNote, req.user.sub]
    )).rows[0];

    return { chi: chiRow, thu: thuRow };
  });
  res.status(201).json(result);
});
