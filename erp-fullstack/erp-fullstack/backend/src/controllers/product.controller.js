import { query, withTransaction } from "../config/db.js";
import { asyncHandler, notFound, badRequest } from "../utils/http.js";

// GET /api/products → kèm biến thể
export const list = asyncHandler(async (req, res) => {
  const products = (await query(`SELECT * FROM products ORDER BY created_at DESC NULLS LAST`)).rows;
  const variants = (await query(`SELECT * FROM product_variants`)).rows;
  const byProduct = {};
  for (const v of variants) (byProduct[v.product_id] ||= []).push(v);
  res.json(products.map((p) => ({ ...p, variants: byProduct[p.id] || [] })));
});

export const getOne = asyncHandler(async (req, res) => {
  const p = (await query(`SELECT * FROM products WHERE id = $1`, [req.params.id])).rows[0];
  if (!p) throw notFound();
  const variants = (await query(`SELECT * FROM product_variants WHERE product_id = $1`, [req.params.id])).rows;
  res.json({ ...p, variants });
});

// POST /api/products  { name, sku, categoryId, supplierId, hasVariants, price, cost, image, options, variants[] }
export const create = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name) throw badRequest("Thiếu tên sản phẩm");
  const result = await withTransaction(async (c) => {
    const codeRow = await c.query(`SELECT 'SP-' || LPAD(nextval('product_seq')::text, 6, '0') AS code`);
    const p = (await c.query(
      `INSERT INTO products (code, name, sku, category_id, supplier_id, has_variants, price, cost, image, options, warranty_content, warranty_months)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [codeRow.rows[0].code, b.name, b.sku || null, b.categoryId || null, b.supplierId || null,
       !!b.hasVariants, b.price || 0, b.cost || 0, b.image || null, JSON.stringify(b.options || []),
       b.warrantyContent || null, Number(b.warrantyMonths) || 0]
    )).rows[0];

    if (b.hasVariants && Array.isArray(b.variants)) {
      for (const v of b.variants) {
        await c.query(
          `INSERT INTO product_variants (product_id, sku, attrs, price, cost) VALUES ($1,$2,$3,$4,$5)`,
          [p.id, v.sku || null, JSON.stringify(v.attrs || {}), v.price || 0, v.cost || 0]
        );
      }
    }
    return p;
  });
  res.status(201).json(result);
});

// PUT /api/products/:id  (cập nhật cơ bản; biến thể quản lý qua API variants)
export const update = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const { rows } = await query(
    `UPDATE products SET name=COALESCE($1,name), sku=$2, category_id=$3, supplier_id=$4,
        has_variants=COALESCE($5,has_variants), active=COALESCE($6,active),
        price=COALESCE($7,price), cost=COALESCE($8,cost), image=$9, options=COALESCE($10,options),
        warranty_content=$11, warranty_months=COALESCE($12,warranty_months)
      WHERE id=$13 RETURNING *`,
    [b.name, b.sku || null, b.categoryId || null, b.supplierId || null, b.hasVariants, b.active,
     b.price, b.cost, b.image || null, b.options ? JSON.stringify(b.options) : null,
     b.warrantyContent ?? null, b.warrantyMonths != null ? Number(b.warrantyMonths) : null, req.params.id]
  );
  if (!rows.length) throw notFound();
  res.json(rows[0]);
});

// DELETE /api/products/:id → xoá cứng nếu chưa có lịch sử; nếu đã có (nhập/xuất/đơn hàng) thì tự chuyển sang ẨN.
export const remove = asyncHandler(async (req, res) => {
  try {
    const { rowCount } = await query(`DELETE FROM products WHERE id = $1`, [req.params.id]);
    if (!rowCount) throw notFound();
    res.status(204).end();
  } catch (e) {
    if (e.code === "23503") {
      const { rows } = await query(`UPDATE products SET active=false WHERE id=$1 RETURNING *`, [req.params.id]);
      if (!rows.length) throw notFound();
      return res.json({ hidden: true, product: rows[0] });
    }
    throw e;
  }
});

// ---- Variants CRUD ----
export const listVariants = asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT * FROM product_variants WHERE product_id = $1`, [req.params.id]);
  res.json(rows);
});

export const createVariant = asyncHandler(async (req, res) => {
  const v = req.body || {};
  const { rows } = await query(
    `INSERT INTO product_variants (product_id, sku, attrs, price, cost) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, v.sku || null, JSON.stringify(v.attrs || {}), v.price || 0, v.cost || 0]
  );
  res.status(201).json(rows[0]);
});

export const updateVariant = asyncHandler(async (req, res) => {
  const v = req.body || {};
  const { rows } = await query(
    `UPDATE product_variants SET sku=$1, attrs=COALESCE($2,attrs), price=COALESCE($3,price), cost=COALESCE($4,cost)
      WHERE id=$5 RETURNING *`,
    [v.sku || null, v.attrs ? JSON.stringify(v.attrs) : null, v.price, v.cost, req.params.variantId]
  );
  if (!rows.length) throw notFound();
  res.json(rows[0]);
});

export const removeVariant = asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM product_variants WHERE id = $1`, [req.params.variantId]);
  if (!rowCount) throw notFound();
  res.status(204).end();
});
