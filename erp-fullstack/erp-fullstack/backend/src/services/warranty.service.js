import { query } from "../config/db.js";
import { nextDocNo } from "../utils/docFormat.js";
import { notFound } from "../utils/http.js";

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + Number(months));
  return d.toISOString().slice(0, 10);
}

// Tạo phiếu bảo hành cho TỪNG dòng sản phẩm của đơn có khai báo warranty_parts — gọi 1 lần khi đơn
// chuyển "Hoàn thành" lần đầu (idempotent: kiểm tra đã có warranty cho order_id chưa trước khi gọi).
export async function createWarrantiesForOrder(client, order) {
  const items = (await client.query(
    `SELECT oi.*, p.warranty_content, p.warranty_months
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1`,
    [order.id]
  )).rows;

  const startDate = new Date().toISOString().slice(0, 10);
  const created = [];
  for (const it of items) {
    const months = Number(it.warranty_months) || 0;
    if (!months) continue;
    const parts = [{ name: it.warranty_content || "Bảo hành sản phẩm", months, expiresAt: addMonths(startDate, months) }];
    const docNo = await nextDocNo(client, "warranty");
    const row = (await client.query(
      `INSERT INTO warranties
        (doc_no, order_id, order_item_id, product_id, variant_id, product_name,
         customer_id, customer_name, customer_phone, start_date, parts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [docNo, order.id, it.id, it.product_id, it.variant_id, it.name,
       order.customer_id, order.customer_id ? null : "Khách lẻ", null, startDate, JSON.stringify(parts)]
    )).rows[0];
    created.push(row);
  }
  // Snapshot SĐT/tên khách từ bảng customers (nếu có) ngay sau khi tạo, để tra cứu không cần JOIN.
  if (created.length && order.customer_id) {
    const customer = (await client.query(`SELECT name, phone FROM customers WHERE id = $1`, [order.customer_id])).rows[0];
    if (customer) {
      await client.query(
        `UPDATE warranties SET customer_name = $1, customer_phone = $2 WHERE order_id = $3`,
        [customer.name, customer.phone, order.id]
      );
    }
  }
  return created;
}

export async function hasWarrantiesForOrder(client, orderId) {
  const { rows } = await client.query(`SELECT 1 FROM warranties WHERE order_id = $1 LIMIT 1`, [orderId]);
  return rows.length > 0;
}

// GET /warranties?q= → tra theo mã phiếu BH, mã đơn (qua orders.code), SĐT, tên khách, tên sản phẩm.
export async function listWarranties(q) {
  const params = [];
  let where = "";
  if (q) {
    params.push(`%${q}%`);
    where = `WHERE w.doc_no ILIKE $1 OR o.code ILIKE $1 OR w.customer_name ILIKE $1
                OR w.customer_phone ILIKE $1 OR w.product_name ILIKE $1`;
  }
  const { rows } = await query(
    `SELECT w.*, o.code AS order_code
       FROM warranties w
       LEFT JOIN orders o ON o.id = w.order_id
       ${where}
      ORDER BY w.created_at DESC`,
    params
  );
  return rows;
}

export async function getWarrantyById(id) {
  const { rows } = await query(
    `SELECT w.*, o.code AS order_code
       FROM warranties w
       LEFT JOIN orders o ON o.id = w.order_id
      WHERE w.id = $1`,
    [id]
  );
  if (!rows.length) throw notFound("Phiếu bảo hành không tồn tại");
  return rows[0];
}
