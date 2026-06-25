import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as usersService from "../services/users.service.js";
import Modal from "../components/Modal.jsx";
import Toolbar, { ToolbarButton } from "../components/Toolbar.jsx";

const SUB_TABS = [
  { id: "list", label: "Danh sách tài khoản" },
  { id: "permissions", label: "Phân quyền" },
];

export default function UsersPage() {
  const [subTab, setSubTab] = useState("list");
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Tài khoản & Phân quyền</h2>
      <div className="flex gap-1 border-b border-slate-200">
        {SUB_TABS.map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 ${subTab === t.id ? "border-sky-600 text-sky-600" : "border-transparent text-slate-500"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {subTab === "list" && <UserListTab />}
      {subTab === "permissions" && <PermissionsTab />}
    </div>
  );
}

function UserListTab() {
  const { can, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);

  async function reload() {
    try {
      const [us, rs] = await Promise.all([usersService.listUsers(), usersService.listRoles()]);
      setUsers(us); setRoles(rs);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  async function remove(id) {
    if (!confirm("Xoá tài khoản này?")) return;
    try { await usersService.removeUser(id); reload(); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="space-y-3">
      <Toolbar
        actions={can("users_edit") && (
          <ToolbarButton variant="primary" onClick={() => setEditing({})}>+ Thêm tài khoản</ToolbarButton>
        )}
      />
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-bold text-slate-800">{u.name} <span className="text-xs text-slate-400">@{u.username}</span></div>
              <div className="text-xs text-slate-400">{u.role}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {u.active ? "Đang hoạt động" : "Đã khoá"}
              </span>
              {can("users_edit") && (
                <button onClick={() => setEditing(u)} className="text-sky-600 hover:underline text-xs">Sửa</button>
              )}
              {can("users_edit") && u.id !== currentUser?.id && (
                <button onClick={() => remove(u.id)} className="text-red-500 hover:underline text-xs">Xoá</button>
              )}
            </div>
          </div>
        ))}
        {users.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có tài khoản.</p>}
      </div>

      {editing !== null && (
        <UserModal user={editing} roles={roles} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function UserModal({ user, roles, onClose, onSaved }) {
  const isNew = !user.id;
  const [name, setName] = useState(user.name || "");
  const [username, setUsername] = useState(user.username || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user.role || roles[0] || "");
  const [active, setActive] = useState(user.active !== false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !username.trim() || !role) return setError("Thiếu thông tin bắt buộc");
    if (isNew && !password) return setError("Cần đặt mật khẩu cho tài khoản mới");
    setSaving(true);
    try {
      const payload = { name: name.trim(), username: username.trim(), role, active };
      if (password) payload.password = password;
      if (isNew) await usersService.createUser(payload);
      else await usersService.updateUser(user.id, payload);
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isNew ? "Thêm tài khoản" : "Sửa tài khoản"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Họ tên</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} disabled={!isNew}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">{isNew ? "Mật khẩu" : "Mật khẩu mới (để trống nếu không đổi)"}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Vai trò</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {!isNew && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Đang hoạt động
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving}
            className="bg-sky-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Cột cố định: mỗi module chỉ điền vào cột khớp với label hành động của nó.
const ACTION_COLUMNS = ["Xem", "Sửa/Thêm", "Xoá"];

function PermissionsTab() {
  const [roles, setRoles] = useState([]);
  const [modules, setModules] = useState([]); // [{key,label,actions:[{key,label}]}]
  const [edits, setEdits] = useState({}); // { roleName: Set(permissions) }
  const [newRole, setNewRole] = useState("");
  const [error, setError] = useState("");
  const [savingRole, setSavingRole] = useState("");
  const [expanded, setExpanded] = useState("");

  async function reload() {
    try {
      const [rs, ms] = await Promise.all([usersService.listRolesFull(), usersService.listPermissions()]);
      setRoles(rs);
      setModules(ms);
      setEdits(Object.fromEntries(rs.map((r) => [r.name, new Set(r.permissions)])));
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  function toggle(role, perm) {
    setEdits((e) => {
      const set = new Set(e[role]);
      if (set.has(perm)) set.delete(perm); else set.add(perm);
      return { ...e, [role]: set };
    });
  }

  async function saveRole(role) {
    setSavingRole(role);
    try {
      await usersService.setRolePermissions(role, Array.from(edits[role] || []));
      await reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setSavingRole("");
    }
  }

  async function addRole(e) {
    e.preventDefault();
    if (!newRole.trim()) return;
    try {
      await usersService.createRole(newRole.trim());
      setNewRole("");
      reload();
    } catch (e2) {
      setError(e2.message);
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <form onSubmit={addRole} className="flex gap-2 max-w-md">
        <input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="Tên vai trò mới"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        <button type="submit" className="bg-sky-600 text-white text-sm font-medium px-4 py-2 rounded-xl">+ Thêm vai trò</button>
      </form>

      <div className="space-y-3">
        {roles.map((r) => {
          const isOpen = expanded === r.name;
          const count = edits[r.name]?.size || 0;
          return (
            <div key={r.name} className="bg-white rounded-2xl shadow-sm border border-slate-100">
              <button onClick={() => setExpanded(isOpen ? "" : r.name)}
                className="w-full flex items-center justify-between px-4 py-3 text-left">
                <div>
                  <span className="font-bold text-slate-800">{r.name}</span>
                  <span className="text-xs text-slate-400 ml-2">{count} quyền</span>
                </div>
                <span className="text-slate-400 text-xs">{isOpen ? "Thu gọn ▲" : "Chi tiết ▼"}</span>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 text-xs">
                        <th className="py-2 pr-3">Module</th>
                        {ACTION_COLUMNS.map((c) => <th key={c} className="py-2 px-2 text-center whitespace-nowrap">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {modules.map((m) => (
                        <tr key={m.key}>
                          <td className="py-2 pr-3 font-medium whitespace-nowrap">{m.label}</td>
                          {ACTION_COLUMNS.map((col) => {
                            const action = m.actions.find((a) => a.label === col);
                            return (
                              <td key={col} className="py-2 px-2 text-center">
                                {action
                                  ? <input type="checkbox" checked={edits[r.name]?.has(action.key) || false}
                                      onChange={() => toggle(r.name, action.key)} />
                                  : <span className="text-slate-200">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-end mt-3">
                    <button onClick={() => saveRole(r.name)} disabled={savingRole === r.name}
                      className="bg-sky-600 text-white text-xs font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                      {savingRole === r.name ? "Đang lưu…" : "Lưu phân quyền"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {roles.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có vai trò nào.</p>}
      </div>
    </div>
  );
}
