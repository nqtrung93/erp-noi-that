import { api } from "../api/client.js";

export const listEmployees = () => api.get("/employees");
export const createEmployee = (data) => api.post("/employees", data);
export const updateEmployee = (id, data) => api.put(`/employees/${id}`, data);
export const removeEmployee = (id) => api.del(`/employees/${id}`);

export const listPayslips = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return api.get(`/payroll/payslips${qs ? `?${qs}` : ""}`);
};
export const generatePayroll = (data) => api.post("/payroll/generate", data);
export const paySalary = (id, data) => api.post(`/payroll/payslips/${id}/pay`, data);
export const payInsurance = (data) => api.post("/payroll/insurance/pay", data);
export const getInsuranceSummary = (month, year) => api.get(`/payroll/insurance-summary?month=${month}&year=${year}`);
