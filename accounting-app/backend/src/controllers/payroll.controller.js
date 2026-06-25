import { query, withTransaction } from "../config/db.js";
import { asyncHandler, badRequest, notFound } from "../utils/http.js";
import { nextCode } from "../utils/sequence.js";
import { nextDocNo } from "../utils/docFormat.js";

// Tỷ lệ BHXH/BHYT/BHTN theo quy định VN hiện hành.
const EMPLOYEE_RATE = 0.08 + 0.015 + 0.01; // 10.5% — khấu trừ từ lương NLĐ
const EMPLOYER_RATE = 0.175 + 0.03 + 0.01; // 21.5% — chi phí công ty đóng thêm

export const createEmployee = asyncHandler(async (req, res) => {
  const { name, phone, position, baseSalary, allowance, insuranceBase } = req.body || {};
  if (!name) throw badRequest("Thiếu tên nhân viên");

  const result = await withTransaction(async (c) => {
    const code = await nextCode(c, "NV", "employee_seq");
    const { rows } = await c.query(
      `INSERT INTO employees(code, name, phone, position, base_salary, allowance, insurance_base)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [code, name, phone || null, position || null, Number(baseSalary) || 0, Number(allowance) || 0,
        Number(insuranceBase) || Number(baseSalary) || 0]
    );
    return rows[0];
  });
  res.status(201).json(result);
});

// POST /api/payroll/generate { month, year } — tạo bảng lương tháng cho tất cả NV đang active, chưa có phiếu lương tháng này
export const generatePayroll = asyncHandler(async (req, res) => {
  const { month, year } = req.body || {};
  if (!month || !year) throw badRequest("Thiếu tháng/năm");

  const result = await withTransaction(async (c) => {
    const employees = (await c.query(`SELECT * FROM employees WHERE active = true`)).rows;
    const created = [];
    for (const emp of employees) {
      const exists = (await c.query(
        `SELECT 1 FROM payslips WHERE employee_id = $1 AND month = $2 AND year = $3`,
        [emp.id, month, year]
      )).rows.length;
      if (exists) continue;

      const employeeInsurance = Number(emp.insurance_base) * EMPLOYEE_RATE;
      const employerInsurance = Number(emp.insurance_base) * EMPLOYER_RATE;
      const netSalary = Number(emp.base_salary) + Number(emp.allowance) - employeeInsurance;
      const code = await nextDocNo(c, "payslip");
      const { rows } = await c.query(
        `INSERT INTO payslips(code, employee_id, month, year, base_salary, allowance, insurance_base,
           employee_insurance, employer_insurance, net_salary)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [code, emp.id, month, year, emp.base_salary, emp.allowance, emp.insurance_base,
          employeeInsurance, employerInsurance, netSalary]
      );
      created.push(rows[0]);
    }
    return created;
  });
  res.status(201).json(result);
});

// GET /api/payroll/payslips?month=&year=
export const listPayslips = asyncHandler(async (req, res) => {
  const { month, year } = req.query;
  const conds = [];
  const params = [];
  if (month) { params.push(month); conds.push(`p.month = $${params.length}`); }
  if (year) { params.push(year); conds.push(`p.year = $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const { rows } = await query(
    `SELECT p.*, e.name AS employee_name, e.code AS employee_code, e.position
       FROM payslips p JOIN employees e ON e.id = p.employee_id
       ${where}
       ORDER BY p.year DESC, p.month DESC, e.name`,
    params
  );
  res.json(rows);
});

// POST /api/payroll/payslips/:id/pay { method } — trả lương thực nhận (net_salary), tạo phiếu Chi
export const paySalary = asyncHandler(async (req, res) => {
  const { method } = req.body || {};

  const result = await withTransaction(async (c) => {
    const slip = (await c.query(
      `SELECT p.*, e.name AS employee_name FROM payslips p JOIN employees e ON e.id = p.employee_id WHERE p.id = $1 FOR UPDATE`,
      [req.params.id]
    )).rows[0];
    if (!slip) throw notFound("Không tìm thấy phiếu lương");
    if (slip.paid) throw badRequest("Phiếu lương đã được trả");

    const txCode = await nextDocNo(c, "transaction");
    const tx = (await c.query(
      `INSERT INTO transactions(code, type, category_name, amount, method, partner_name, note, created_by)
       VALUES($1,'Chi','Trả lương',$2,$3,$4,$5,$6) RETURNING *`,
      [txCode, slip.net_salary, method || null, slip.employee_name, `Lương tháng ${slip.month}/${slip.year}`, req.user.sub]
    )).rows[0];

    const updated = (await c.query(
      `UPDATE payslips SET paid = true, paid_at = now(), salary_transaction_id = $1 WHERE id = $2 RETURNING *`,
      [tx.id, slip.id]
    )).rows[0];

    return { payslip: updated, transaction: tx };
  });
  res.json(result);
});

// POST /api/payroll/insurance/pay { month, year, method } — nộp BHXH (cả phần NLĐ+công ty) cho 1 kỳ, tạo 1 phiếu Chi tổng
export const payInsurance = asyncHandler(async (req, res) => {
  const { month, year, method } = req.body || {};
  if (!month || !year) throw badRequest("Thiếu tháng/năm");

  const result = await withTransaction(async (c) => {
    const slips = (await c.query(
      `SELECT * FROM payslips WHERE month = $1 AND year = $2 AND insurance_transaction_id IS NULL`,
      [month, year]
    )).rows;
    if (!slips.length) throw badRequest("Không có phiếu lương nào cần nộp BHXH cho kỳ này");

    const total = slips.reduce((s, p) => s + Number(p.employee_insurance) + Number(p.employer_insurance), 0);
    const txCode = await nextDocNo(c, "transaction");
    const tx = (await c.query(
      `INSERT INTO transactions(code, type, category_name, amount, method, note, created_by)
       VALUES($1,'Chi','Nộp BHXH/BHYT/BHTN',$2,$3,$4,$5) RETURNING *`,
      [txCode, total, method || null, `Kỳ ${month}/${year} — ${slips.length} nhân viên`, req.user.sub]
    )).rows[0];

    await c.query(`UPDATE payslips SET insurance_transaction_id = $1 WHERE id = ANY($2)`,
      [tx.id, slips.map((s) => s.id)]);

    return { transaction: tx, count: slips.length, total };
  });
  res.status(201).json(result);
});

// GET /api/payroll/insurance-summary?month=&year= — tổng BHXH phải nộp theo kỳ
export const insuranceSummary = asyncHandler(async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) throw badRequest("Thiếu tháng/năm");
  const { rows } = await query(
    `SELECT COALESCE(SUM(employee_insurance),0) AS employee_total,
            COALESCE(SUM(employer_insurance),0) AS employer_total,
            COUNT(*) AS employee_count,
            bool_and(insurance_transaction_id IS NOT NULL) AS paid
       FROM payslips WHERE month = $1 AND year = $2`,
    [month, year]
  );
  const r = rows[0];
  res.json({
    employeeTotal: Number(r.employee_total),
    employerTotal: Number(r.employer_total),
    total: Number(r.employee_total) + Number(r.employer_total),
    employeeCount: Number(r.employee_count),
    paid: r.employee_count > 0 ? r.paid : false,
  });
});
