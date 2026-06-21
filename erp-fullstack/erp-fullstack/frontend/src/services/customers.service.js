import { api } from "../api/client.js";
export const listCustomers = () => api.get("/customers");
export const createCustomer = (data) => api.post("/customers", data);
export const updateCustomer = (id, data) => api.put(`/customers/${id}`, data);
export const deleteCustomer = (id) => api.del(`/customers/${id}`);

// customer_groups: PK = name (không có id) — bọc lại thành {id: name, name} để dùng chung
// với SimpleListManager (list/create/remove theo id) ở trang Cài đặt.
export const listCustomerGroups = () => api.get("/customer-groups");
export const listCustomerGroupObjs = async () => (await api.get("/customer-groups")).map((name) => ({ id: name, name }));
export const createCustomerGroup = (name) => api.post("/customer-groups", { name });
export const deleteCustomerGroup = (name) => api.del(`/customer-groups/${encodeURIComponent(name)}`);
export const payCustomerDebt = (id, data) => api.post(`/customers/${id}/pay-debt`, data);
