import { api } from "../api/client.js";

export const listUsers = () => api.get("/users");
export const listRoles = () => api.get("/roles");
export const createUser = (data) => api.post("/users", data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const removeUser = (id) => api.del(`/users/${id}`);

export const listRolesFull = () => api.get("/roles/full");
export const listPermissions = () => api.get("/permissions");
export const createRole = (name) => api.post("/roles", { name });
export const setRolePermissions = (role, permissions) => api.put(`/roles/${encodeURIComponent(role)}/permissions`, { permissions });
