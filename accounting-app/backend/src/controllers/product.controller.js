import { query, withTransaction } from "../config/db.js";
import { asyncHandler, badRequest, notFound } from "../utils/http.js";

// GET /api/products — kèm danh sách biến thể (nếu có)
export const list = asyncHandler(async (req, res) => {
  const { rows: products } = await query(`SELECT * FROM products ORDER BY name`);
  const { rows: variants } = await query(`SELECT * FROM product_variants ORDER BY id`);
  const byProduct = {};
  for (const v of variants) (byProduct[v.product_id] ||= []).push(v);
  res.json(products.map((p) => ({ ...p, variants: byProduct[p.id] || [] })));
});

export const getOne = asyncHandler(async (req, res) => {
  const product = (await query(`SELECT * FROM products WHERE id = $1`, [req.params.id])).rows[0];
  if (!product) throw notFound();
  const variants = (await query(`SELECT * FROM product_variants WHERE product_id = $1 ORDER BY id`, [req.params.id])).rows;
  res.json({ ...product, variants });
});

// POST /api/products { sku, name, unit, cost, price, hasVariants, options, variants:[{sku,attrs,price,cost}] }
export const create = asyncHandler(async (req, res) => {
  const { sku, name, unit, cost, price, hasVariants, options, variants } = req.body || {};
  if (!name) throw badRequest("Thiếu tên sản phẩm");

  const result = await withTransaction(async (c) => {
    const product = (await c.query(
      `INSERT INTO products(sku, name, unit, cost, price, has_variants, options)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [hasVariants ? null : (sku || null), name, unit || "cái", Number(cost) || 0, Number(price) || 0,
        !!hasVariants, JSON.stringify(hasVariants ? (options || []) : [])]
    )).rows[0];

    const createdVariants = [];
    if (hasVariants && Array.isArray(variants)) {
      for (const v of variants) {
        const row = (await c.query(
          `INSERT INTO product_variants(product_id, sku, attrs, price, cost) VALUES($1,$2,$3,$4,$5) RETURNING *`,
          [product.id, v.sku || null, JSON.stringify(v.attrs || {}), Number(v.price) || 0, Number(v.cost) || 0]
        )).rows[0];
        createdVariants.push(row);
      }
    }
    return { ...product, variants: createdVariants };
  });
  res.status(201).json(result);
});

// PUT /api/products/:id — sửa thông tin cơ bản (không đụng tới variants, dùng endpoint riêng)
export const update = asyncHandler(async (req, res) => {
  const { sku, name, unit, cost, price, hasVariants, options } = req.body || {};
  const { rows } = await query(
    `UPDATE products SET
       sku = COALESCE($1, sku), name = COALESCE($2, name), unit = COALESCE($3, unit),
       cost = COALESCE($4, cost), price = COALESCE($5, price),
       has_variants = COALESCE($6, has_variants), options = COALESCE($7, options)
     WHERE id = $8 RETURNING *`,
    [sku ?? null, name ?? null, unit ?? null, cost !== undefined ? Number(cost) : null,
      price !== undefined ? Number(price) : null, hasVariants ?? null,
      options !== undefined ? JSON.stringify(options) : null, req.params.id]
  );
  if (!rows.length) throw notFound();
  res.json(rows[0]);
});

export const remove = asyncHandler(async (req, res) => {
  const { rowCount } = await query(`DELETE FROM products WHERE id = $1`, [req.params.id]);
  if (!rowCount) throw notFound();
  res.status(204).end();
});

// -------- Variants --------
export const listVariants = asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT * FROM product_variants WHERE product_id = $1 ORDER BY id`, [req.params.id]);
  res.json(rows);
});

export const createVariant = asyncHandler(async (req, res) => {
  const { sku, attrs, price, cost } = req.body || {};
  const { rows } = await query(
    `INSERT INTO product_variants(product_id, sku, attrs, price, cost) VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, sku || null, JSON.stringify(attrs || {}), Number(price) || 0, Number(cost) || 0]
  );
  res.status(201).json(rows[0]);
});

export const updateVariant = asyncHandler(async (req, res) => {
  const { sku, attrs, price, cost } = req.body || {};
  const { rows } = await query(
    `UPDATE product_variants SET
       sku = COALESCE($1, sku), attrs = COALESCE($2, attrs),
       price = COALESCE($3, price), cost = COALESCE($4, cost)
     WHERE id = $5 AND product_id = $6 RETURNING *`,
    [sku ?? null, attrs !== undefined ? JSON.stringify(attrs) : null,
      price !== undefined ? Number(price) : null, cost !== undefined ? Number(cost) : null,
      req.params.variantId, req.params.id]
  );
  if (!rows.length) throw notFound();
  res.json(rows[0]);
});

export const removeVariant = asyncHandler(async (req, res) => {
  const { rowCount } = await query(
    `DELETE FROM product_variants WHERE id = $1 AND product_id = $2`,
    [req.params.variantId, req.params.id]
  );
  if (!rowCount) throw notFound();
  res.status(204).end();
});
