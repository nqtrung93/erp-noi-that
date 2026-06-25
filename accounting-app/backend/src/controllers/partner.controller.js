import { query, withTransaction } from "../config/db.js";
import { asyncHandler, badRequest, notFound } from "../utils/http.js";
import { nextCode } from "../utils/sequence.js";
import { nextDocNo } from "../utils/docFormat.js";

// POST /api/partners  { name, type, phone, contact, address } → tự sinh mã đối tượng
export const create = asyncHandler(async (req, res) => {
  const { name, type, phone, contact, address } = req.body || {};
  if (!name) throw badRequest("Thiếu tên");
  if (!["customer", "supplier", "other"].includes(type)) throw badRequest("Loại đối tượng không hợp lệ");

  const result = await withTransaction(async (c) => {
    const code = await nextCode(c, type === "customer" ? "KH" : type === "supplier" ? "NCC" : "DT", "partner_seq");
    const { rows } = await c.query(
      `INSERT INTO partners(code, name, type, phone, contact, address) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [code, name, type, phone || null, contact || null, address || null]
    );
    return rows[0];
  });
  res.status(201).json(result);
});

// POST /api/partners/:id/debt  { amount, direction: 'increase'|'decrease', note, cash: boolean, method }
// direction=increase: ghi nợ thuần (không có dòng tiền) — vd bán/nhập hàng cho ghi nợ.
// direction=decrease: thu nợ (customer) hoặc trả nợ (supplier) — LUÔN tạo kèm 1 phiếu thu/chi tiền mặt thực tế.
export const adjustDebt = asyncHandler(async (req, res) => {
  const { amount, direction, note, method } = req.body || {};
  if (!amount || Number(amount) <= 0) throw badRequest("Số tiền không hợp lệ");
  if (!["increase", "decrease"].includes(direction)) throw badRequest("Hướng điều chỉnh không hợp lệ");

  const result = await withTransaction(async (c) => {
    const partner = (await c.query(`SELECT * FROM partners WHERE id = $1 FOR UPDATE`, [req.params.id])).rows[0];
    if (!partner) throw notFound("Đối tượng không tồn tại");

    const debtCode = await nextDocNo(c, "debt");
    const entry = (await c.query(
      `INSERT INTO debt_entries(code, partner_id, direction, amount, note, created_by)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [debtCode, partner.id, direction, Number(amount), note || null, req.user.sub]
    )).rows[0];

    const delta = direction === "increase" ? Number(amount) : -Number(amount);
    const updated = (await c.query(
      `UPDATE partners SET debt = GREATEST(debt + $1, 0) WHERE id = $2 RETURNING *`,
      [delta, partner.id]
    )).rows[0];

    let transaction = null;
    if (direction === "decrease") {
      // Thu nợ KH = phiếu Thu; trả nợ NCC = phiếu Chi.
      const txType = partner.type === "supplier" ? "Chi" : "Thu";
      const txCode = await nextDocNo(c, "transaction");
      transaction = (await c.query(
        `INSERT INTO transactions(code, type, category_name, amount, partner_id, partner_name, note, created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [txCode, txType, partner.type === "supplier" ? "Trả nợ nhà cung cấp" : "Thu nợ khách hàng",
          Number(amount), partner.id, partner.name, note || null, req.user.sub]
      )).rows[0];
    }

    return { debtEntry: entry, partner: updated, transaction };
  });
  res.status(201).json(result);
});

// GET /api/partners/:id/debt-entries — lịch sử ghi nợ/thu-trả nợ của 1 đối tượng
export const debtHistory = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM debt_entries WHERE partner_id = $1 ORDER BY created_at DESC`,
    [req.params.id]
  );
  res.json(rows);
});
