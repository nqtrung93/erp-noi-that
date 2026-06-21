import { query, withTransaction } from "../config/db.js";
import { asyncHandler, badRequest, notFound } from "../utils/http.js";
import { nextDocNo } from "../utils/docFormat.js";

// GET /api/customers → kèm công nợ = Σ(total - paid) các đơn chưa huỷ (#README quy ước công nợ KH)
// + overdue_days = số ngày quá hạn của đơn chưa thu LÂU NHẤT (created_at + payment_term_days), để cảnh báo.
export const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, COALESCE(o.debt, 0) AS debt,
            GREATEST(COALESCE(o.max_overdue_days, 0), 0) AS overdue_days
       FROM customers c
       LEFT JOIN (
         SELECT customer_id, SUM(total - paid) AS debt,
                MAX(EXTRACT(DAY FROM now() - o2.created_at) - c2.payment_term_days) AS max_overdue_days
           FROM orders o2
           JOIN customers c2 ON c2.id = o2.customer_id
          WHERE o2.status != 'Đã huỷ' AND o2.paid < o2.total
          GROUP BY customer_id
       ) o ON o.customer_id = c.id
      ORDER BY c.created_at DESC NULLS LAST`
  );
  res.json(rows);
});

// POST /api/customers → tự sinh mã khách hàng (KH-000001...), không nhận code từ client
export const create = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name) throw badRequest("Thiếu tên khách hàng");
  const codeRow = await query(`SELECT 'KH-' || LPAD(nextval('customer_seq')::text, 6, '0') AS code`);
  const { rows } = await query(
    `INSERT INTO customers (code, name, phone, email, address, group_name, payment_term_days)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [codeRow.rows[0].code, b.name, b.phone || null, b.email || null, b.address || null,
     b.group_name || null, b.payment_term_days ?? 30]
  );
  res.status(201).json(rows[0]);
});

// POST /api/customers/:id/pay-debt  { amount, method, note } → thu nợ khách hàng
// Công nợ KH = Σ(total - paid) tính từ đơn hàng, nên phải PHÂN BỔ số tiền thu vào orders.paid
// (đơn cũ nhất trước) để công nợ hiển thị giảm đúng — không chỉ ghi phiếu thu suông.
export const payDebt = asyncHandler(async (req, res) => {
  const { amount, method, note } = req.body || {};
  if (!amount || Number(amount) <= 0) throw badRequest("Số tiền không hợp lệ");

  const tx = await withTransaction(async (c) => {
    const customer = (await c.query(`SELECT * FROM customers WHERE id = $1`, [req.params.id])).rows[0];
    if (!customer) throw notFound("Khách hàng không tồn tại");

    let remaining = Number(amount);
    const unpaidOrders = (await c.query(
      `SELECT id, total, paid FROM orders
        WHERE customer_id = $1 AND status != 'Đã huỷ' AND paid < total
        ORDER BY created_at ASC FOR UPDATE`,
      [customer.id]
    )).rows;
    for (const o of unpaidOrders) {
      if (remaining <= 0) break;
      const owed = Number(o.total) - Number(o.paid);
      const applied = Math.min(owed, remaining);
      await c.query(`UPDATE orders SET paid = paid + $1 WHERE id = $2`, [applied, o.id]);
      remaining -= applied;
    }

    const code = await nextDocNo(c, "transaction");
    return (await c.query(
      `INSERT INTO transactions (code, type, category, amount, method, party_type, party_id, party_name, ref_type, ref_id, note, created_by)
       VALUES ($1,'Thu','Thu nợ khách hàng',$2,$3,'Khách hàng',$4,$5,'customer',$4,$6,$7) RETURNING *`,
      [code, Number(amount), method || null, customer.id, customer.name, note || null, req.user.sub]
    )).rows[0];
  });
  res.status(201).json(tx);
});
