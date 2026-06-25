import { query } from "../config/db.js";
import { asyncHandler, notFound, badRequest } from "../utils/http.js";

// Factory tạo controller CRUD cho 1 bảng đơn giản. columns = whitelist cột cho phép ghi.
export function makeCrud(table, columns, orderBy = "created_at DESC NULLS LAST") {
  const list = asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
    res.json(rows);
  });

  const getOne = asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
    if (!rows.length) throw notFound();
    res.json(rows[0]);
  });

  const create = asyncHandler(async (req, res) => {
    const cols = columns.filter((c) => req.body[c] !== undefined);
    if (!cols.length) throw badRequest("Không có dữ liệu hợp lệ");
    const values = cols.map((c) => req.body[c]);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const { rows } = await query(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders.join(",")}) RETURNING *`,
      values
    );
    res.status(201).json(rows[0]);
  });

  const update = asyncHandler(async (req, res) => {
    const cols = columns.filter((c) => req.body[c] !== undefined);
    if (!cols.length) throw badRequest("Không có dữ liệu cập nhật");
    const set = cols.map((c, i) => `${c} = $${i + 1}`);
    const values = cols.map((c) => req.body[c]);
    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE ${table} SET ${set.join(",")} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!rows.length) throw notFound();
    res.json(rows[0]);
  });

  const remove = asyncHandler(async (req, res) => {
    const { rowCount } = await query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
    if (!rowCount) throw notFound();
    res.status(204).end();
  });

  return { list, getOne, create, update, remove };
}
