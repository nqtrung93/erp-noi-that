import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as payrollService from "../services/payroll.service.js";
import { fmt } from "../utils/format.js";
import Modal from "../components/Modal.jsx";
import Toolbar, { ToolbarButton } from "../components/Toolbar.jsx";

const now = new Date();

export default function PayrollPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState("payslips"); // payslips | employees
  const [employees, setEmployees] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [insurance, setInsurance] = useState(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // 'employee'

  async function reload() {
    try {
      const [emp, slips, ins] = await Promise.all([
        payrollService.listEmployees(),
        payrollService.listPayslips({ month, year }),
        payrollService.getInsuranceSummary(month, year),
      ]);
      setEmployees(emp); setPayslips(slips); setInsurance(ins);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, [month, year]);

  async function generate() {
    try { await payrollService.generatePayroll({ month, year }); reload(); }
    catch (e) { setError(e.message); }
  }

  async function pay(id) {
    try { await payrollService.paySalary(id, { method: "Tiền mặt" }); reload(); }
    catch (e) { setError(e.message); }
  }

  async function payInsuranceNow() {
    if (!confirm("Tạo phiếu chi nộp BHXH/BHYT/BHTN cho kỳ này?")) return;
    try { await payrollService.payInsurance({ month, year, method: "Chuyển khoản" }); reload(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="space-y-3">
      <Toolbar
        title="Lương nhân viên & BHXH"
        actions={can("payroll_edit") && tab === "employees" && (
          <ToolbarButton variant="primary" onClick={() => setModal("employee")}>+ Nhân viên</ToolbarButton>
        )}
      />
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="flex gap-1">
        {[["payslips", "Bảng lương"], ["employees", "Nhân viên"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium ${tab === id ? "bg-indigo-50 text-indigo-700" : "text-slate-500"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "payslips" && (
        <>
          <div className="flex gap-3 items-end flex-wrap">
            <div><label className="text-xs text-slate-500">Tháng</label>
              <input type="number" min="1" max="12" value={month} onChange={(e) => setMonth(Number(e.target.value))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm block w-20" /></div>
            <div><label className="text-xs text-slate-500">Năm</label>
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm block w-24" /></div>
            {can("payroll_edit") && (
              <button onClick={generate} className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl">
                Tạo bảng lương tháng này
              </button>
            )}
          </div>

          {insurance && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="NLĐ đóng BHXH/BHYT/BHTN" value={fmt(insurance.employeeTotal)} />
              <Stat label="Công ty đóng thêm" value={fmt(insurance.employerTotal)} />
              <Stat label="Tổng phải nộp" value={fmt(insurance.total)} />
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">Trạng thái nộp</div>
                  <div className={`text-sm font-semibold ${insurance.paid ? "text-emerald-600" : "text-amber-600"}`}>
                    {insurance.employeeCount === 0 ? "Chưa có bảng lương" : insurance.paid ? "Đã nộp" : "Chưa nộp"}
                  </div>
                </div>
                {can("payroll_edit") && !insurance.paid && insurance.employeeCount > 0 && (
                  <button onClick={payInsuranceNow} className="text-xs text-indigo-600 font-medium hover:underline">Nộp ngay</button>
                )}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-400 text-xs">
                <th className="py-2 px-3">Mã</th><th className="py-2 px-3">Nhân viên</th><th className="py-2 px-3 text-right">Lương CB</th>
                <th className="py-2 px-3 text-right">Phụ cấp</th><th className="py-2 px-3 text-right">BHXH trừ</th>
                <th className="py-2 px-3 text-right">Thực nhận</th><th className="py-2 px-3">Trạng thái</th><th className="py-2 px-3"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {payslips.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 px-3 font-medium">{p.code}</td>
                    <td className="py-2 px-3">{p.employee_name}</td>
                    <td className="py-2 px-3 text-right">{fmt(p.base_salary)}</td>
                    <td className="py-2 px-3 text-right">{fmt(p.allowance)}</td>
                    <td className="py-2 px-3 text-right text-red-500">-{fmt(p.employee_insurance)}</td>
                    <td className="py-2 px-3 text-right font-semibold">{fmt(p.net_salary)}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {p.paid ? "Đã trả" : "Chưa trả"}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {can("payroll_edit") && !p.paid && (
                        <button onClick={() => pay(p.id)} className="text-indigo-600 text-xs hover:underline">Trả lương</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payslips.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có bảng lương cho kỳ này.</p>}
          </div>
        </>
      )}

      {tab === "employees" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-400 text-xs">
              <th className="py-2 px-3">Mã</th><th className="py-2 px-3">Tên</th><th className="py-2 px-3">Chức vụ</th>
              <th className="py-2 px-3 text-right">Lương CB</th><th className="py-2 px-3 text-right">Phụ cấp</th><th className="py-2 px-3">Trạng thái</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 px-3">{e.code}</td>
                  <td className="py-2 px-3">{e.name}</td>
                  <td className="py-2 px-3 text-slate-500">{e.position || "—"}</td>
                  <td className="py-2 px-3 text-right">{fmt(e.base_salary)}</td>
                  <td className="py-2 px-3 text-right">{fmt(e.allowance)}</td>
                  <td className="py-2 px-3 text-slate-500">{e.active ? "Đang làm" : "Đã nghỉ"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {employees.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có nhân viên.</p>}
        </div>
      )}

      {modal === "employee" && <EmployeeModal onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-lg font-bold text-slate-800">{value}</div>
    </div>
  );
}

function EmployeeModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [allowance, setAllowance] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name) return setError("Thiếu tên");
    setSaving(true);
    try {
      await payrollService.createEmployee({
        name, phone: phone || null, position: position || null,
        baseSalary: Number(baseSalary) || 0, allowance: Number(allowance) || 0,
        insuranceBase: Number(baseSalary) || 0,
      });
      onSaved();
    } catch (e2) { setError(e2.message); } finally { setSaving(false); }
  }

  return (
    <Modal title="Thêm nhân viên" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div><label className="text-xs text-slate-500">Họ tên</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Điện thoại</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Chức vụ</label>
          <input value={position} onChange={(e) => setPosition(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-500">Lương cơ bản</label>
            <input type="number" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="text-xs text-slate-500">Phụ cấp</label>
            <input type="number" value={allowance} onChange={(e) => setAllowance(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        <p className="text-xs text-slate-400">Mức đóng BHXH lấy theo lương cơ bản. BHXH/BHYT/BHTN: NLĐ 10.5%, công ty đóng thêm 21.5%.</p>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">{saving ? "Đang lưu…" : "Thêm"}</button>
        </div>
      </form>
    </Modal>
  );
}
