import { query, withTransaction } from "../config/db.js";
import { asyncHandler, badRequest, notFound } from "../utils/http.js";
import { nextDocNo } from "../utils/docFormat.js";

// POST /api/suppliers/:id/pay  { amount, method, note } → trả nợ nhà cung cấp
// Tạo phiếu chi (Chi) + giảm công nợ (suppliers.debt) trong 1 transaction.
export const payDebt = asyncHandler(async (req, res) => {
  const { amount, method, note, bankAccountId } = req.body || {};
  if (!amount || Number(amount) <= 0) throw badRequest("Số tiền không hợp lệ");

  const result = await withTransaction(async (c) => {
    const supplier = (await c.query(`SELECT * FROM suppliers WHERE id = $1 FOR UPDATE`, [req.params.id])).rows[0];
    if (!supplier) throw notFound("Nhà cung cấp không tồn tại");

    const code = await nextDocNo(c, "transaction");
    const tx = (await c.query(
      `INSERT INTO transactions (code, type, category, amount, method, bank_account_id, party_type, party_id, party_name, ref_type, ref_id, note, created_by)
       VALUES ($1,'Chi','Trả nợ nhà cung cấp',$2,$3,$4,'Nhà cung cấp',$5,$6,'supplier',$5,$7,$8) RETURNING *`,
      [code, Number(amount), method || null, method === "Ngân hàng" ? (bankAccountId || null) : null,
       supplier.id, supplier.name, note || null, req.user.sub]
    )).rows[0];

    const updated = (await c.query(
      `UPDATE suppliers SET debt = GREATEST(debt - $1, 0) WHERE id = $2 RETURNING *`,
      [Number(amount), supplier.id]
    )).rows[0];

    return { transaction: tx, supplier: updated };
  });
  res.status(201).json(result);
});
