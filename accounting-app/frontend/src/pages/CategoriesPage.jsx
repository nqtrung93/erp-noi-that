import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as categoriesService from "../services/categories.service.js";
import Toolbar from "../components/Toolbar.jsx";

export default function CategoriesPage() {
  const { can } = useAuth();
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("Chi");
  const [error, setError] = useState("");

  async function reload() {
    try { setCategories(await categoriesService.listCategories()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!name) return;
    try { await categoriesService.createCategory({ name, type }); setName(""); reload(); }
    catch (e2) { setError(e2.message); }
  }

  async function remove(id) {
    if (!confirm("Xoá danh mục này?")) return;
    try { await categoriesService.removeCategory(id); reload(); }
    catch (e) { setError(e.message); }
  }

  const incomeCats = categories.filter((c) => c.type === "Thu");
  const expenseCats = categories.filter((c) => c.type === "Chi");

  return (
    <div className="space-y-3">
      <Toolbar title="Danh mục thu / chi" />
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      {can("categories_edit") && (
        <form onSubmit={add} className="flex gap-2 items-end">
          <div>
            <label className="text-xs text-slate-500">Tên danh mục</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm block" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Loại</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm block">
              <option value="Thu">Thu</option>
              <option value="Chi">Chi</option>
            </select>
          </div>
          <button className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl">Thêm</button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CategoryList title="Danh mục Thu" items={incomeCats} canEdit={can("categories_edit")} onRemove={remove} />
        <CategoryList title="Danh mục Chi" items={expenseCats} canEdit={can("categories_edit")} onRemove={remove} />
      </div>
    </div>
  );
}

function CategoryList({ title, items, canEdit, onRemove }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
      <h3 className="font-semibold text-slate-700 mb-2">{title}</h3>
      <ul className="divide-y divide-slate-100">
        {items.map((c) => (
          <li key={c.id} className="py-2 flex items-center justify-between text-sm">
            <span>{c.name}</span>
            {canEdit && <button onClick={() => onRemove(c.id)} className="text-red-500 text-xs hover:underline">Xoá</button>}
          </li>
        ))}
        {items.length === 0 && <li className="text-slate-400 text-sm py-2">Chưa có danh mục.</li>}
      </ul>
    </div>
  );
}
