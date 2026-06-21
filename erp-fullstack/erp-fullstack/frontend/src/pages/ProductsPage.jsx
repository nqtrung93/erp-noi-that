import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as productsService from "../services/products.service.js";
import * as categoriesService from "../services/categories.service.js";
import { fmt } from "../utils/format.js";
import Modal from "../components/Modal.jsx";
import MoneyInput from "../components/MoneyInput.jsx";
import { exportCsv } from "../utils/exportCsv.js";
import { readCsvFile } from "../utils/importCsv.js";

// Trang sản phẩm: CRUD cơ bản + quản lý biến thể dạng ma trận (khai báo phân loại → sinh tổ hợp).
// Xuất/nhập CSV hỗ trợ tối đa 3 phân loại biến thể (đủ cho hầu hết trường hợp: Màu, Size, ...).
const MAX_VARIANT_AXES = 3;
const CSV_COLUMNS = [
  { key: "productId", label: "ID sản phẩm" },
  { key: "variantId", label: "ID biến thể" },
  { key: "name", label: "Tên" },
  { key: "sku", label: "SKU" },
  { key: "category", label: "Danh mục" },
  ...Array.from({ length: MAX_VARIANT_AXES }, (_, i) => [
    { key: `axisName${i + 1}`, label: `Tên biến thể ${i + 1}` },
    { key: `axisValue${i + 1}`, label: `Giá trị biến thể ${i + 1}` },
  ]).flat(),
  { key: "price", label: "Giá bán" },
  { key: "cost", label: "Giá vốn" },
  { key: "warrantyContent", label: "Nội dung bảo hành" },
  { key: "warrantyMonths", label: "Bảo hành (tháng)" },
  { key: "active", label: "Trạng thái" },
];

// Object attrs {Màu:"Đỏ", Size:"M"} → các cặp cột "Tên biến thể N"/"Giá trị biến thể N" cho 1 dòng CSV.
function attrsToAxisColumns(attrs) {
  const entries = Object.entries(attrs || {});
  const row = {};
  for (let i = 0; i < MAX_VARIANT_AXES; i++) {
    row[`axisName${i + 1}`] = entries[i]?.[0] || "";
    row[`axisValue${i + 1}`] = entries[i]?.[1] || "";
  }
  return row;
}
// Ngược lại: đọc các cặp cột "Tên biến thể N"/"Giá trị biến thể N" từ 1 dòng CSV → object attrs.
function axisColumnsToAttrs(r) {
  const attrs = {};
  for (let i = 1; i <= MAX_VARIANT_AXES; i++) {
    const k = (r[`Tên biến thể ${i}`] || "").trim();
    const v = (r[`Giá trị biến thể ${i}`] || "").trim();
    if (k && v) attrs[k] = v;
  }
  return attrs;
}

export default function ProductsPage() {
  const { can } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...} = edit
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  async function reload() {
    try {
      const [ps, cs] = await Promise.all([productsService.listProducts(), categoriesService.listCategories()]);
      setProducts(ps);
      setCategories(cs);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  async function remove(id) {
    if (!confirm("Xoá sản phẩm này?")) return;
    try {
      const res = await productsService.deleteProduct(id);
      if (res?.hidden) alert("Sản phẩm đã có lịch sử nhập/xuất kho hoặc đơn hàng nên không thể xoá — đã chuyển sang ẨN (không hiện khi tạo đơn mới nữa).");
      reload();
    } catch (e) { alert(e.message); }
  }

  async function toggleActive(p) {
    try { await productsService.updateProduct(p.id, { active: !p.active }); reload(); }
    catch (e) { alert(e.message); }
  }

  function exportProducts() {
    const rows = [];
    for (const p of products) {
      const categoryName = categories.find((c) => c.id === p.category_id)?.name || "";
      if (p.has_variants && p.variants?.length) {
        for (const v of p.variants) {
          rows.push({
            productId: p.code || p.id, variantId: v.id, name: p.name, sku: v.sku || p.sku || "", category: categoryName,
            ...attrsToAxisColumns(v.attrs), price: v.price, cost: v.cost,
            warrantyContent: p.warranty_content || "", warrantyMonths: p.warranty_months || 0,
            active: p.active !== false ? "Hiện" : "Ẩn",
          });
        }
      } else {
        rows.push({
          productId: p.code || p.id, variantId: "", name: p.name, sku: p.sku || "", category: categoryName,
          ...attrsToAxisColumns({}), price: p.price, cost: p.cost,
          warrantyContent: p.warranty_content || "", warrantyMonths: p.warranty_months || 0,
          active: p.active !== false ? "Hiện" : "Ẩn",
        });
      }
    }
    exportCsv("san_pham.csv", CSV_COLUMNS, rows);
  }

  function downloadTemplate() {
    exportCsv("mau_nhap_san_pham.csv", CSV_COLUMNS, [
      { productId: "", variantId: "", name: "Ghế mẫu (không biến thể)", sku: "GM-001", category: "Ghế",
        ...attrsToAxisColumns({}), price: 1000000, cost: 600000,
        warrantyContent: "Bảo hành toàn bộ sản phẩm", warrantyMonths: 24, active: "Hiện" },
      { productId: "", variantId: "", name: "Ghế mẫu 2 (có biến thể)", sku: "", category: "Ghế",
        ...attrsToAxisColumns({ "Màu": "Đỏ", "Size": "M" }), price: 1200000, cost: 700000,
        warrantyContent: "Bảo hành khung/chân sắt", warrantyMonths: 60, active: "Hiện" },
      { productId: "", variantId: "", name: "Ghế mẫu 2 (có biến thể)", sku: "", category: "Ghế",
        ...attrsToAxisColumns({ "Màu": "Đen", "Size": "L" }), price: 1250000, cost: 720000,
        warrantyContent: "Bảo hành khung/chân sắt", warrantyMonths: 60, active: "Hiện" },
    ]);
  }

  // Nhập sản phẩm từ CSV. Dòng có "ID sản phẩm" khớp sản phẩm đã có → CẬP NHẬT (kèm biến thể theo
  // "ID biến thể" nếu có, hoặc thêm biến thể mới nếu để trống). Dòng không có ID → tạo sản phẩm mới.
  // Các dòng cùng "Tên" (khi tạo mới) hoặc cùng "ID sản phẩm" (khi cập nhật) được gộp thành 1 sản phẩm nhiều biến thể.
  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const rows = await readCsvFile(file);
      if (!rows.length) { setImportResult({ ok: 0, updated: 0, failed: [], note: "File rỗng hoặc không đọc được dữ liệu." }); return; }

      const groups = new Map();
      for (const r of rows) {
        const name = (r["Tên"] || "").trim();
        if (!name) continue;
        const groupKey = (r["ID sản phẩm"] || "").trim() || `new:${name}`;
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push(r);
      }

      let categoryList = [...categories];
      let ok = 0, updated = 0;
      const failed = [];

      for (const [groupKey, group] of groups) {
        const name = group[0]["Tên"].trim();
        try {
          const categoryName = (group[0]["Danh mục"] || "").trim();
          let categoryId = categoryList.find((c) => c.name.toLowerCase() === categoryName.toLowerCase())?.id || null;
          if (!categoryId && categoryName) {
            const cat = await categoriesService.createCategory(categoryName);
            categoryList = [...categoryList, cat];
            categoryId = cat.id;
          }

          const variantRows = group.filter((r) => Object.keys(axisColumnsToAttrs(r)).length > 0);
          const hasVariants = group.length > 1 || variantRows.length > 0;
          const variants = hasVariants ? group.map((r) => ({
            id: (r["ID biến thể"] || "").trim() || undefined,
            sku: r["SKU"] || null, attrs: axisColumnsToAttrs(r),
            price: Number(r["Giá bán"]) || 0, cost: Number(r["Giá vốn"]) || 0,
          })) : [];
          const keyValues = {};
          for (const v of variants) for (const [k, val] of Object.entries(v.attrs)) (keyValues[k] ||= new Set()).add(val);

          const productRef = (group[0]["ID sản phẩm"] || "").trim();
          const matchedProduct = productRef && products.find((p) => p.code === productRef || p.id === productRef);
          const isUpdate = !!matchedProduct;
          const productId = matchedProduct?.id;

          const basePayload = {
            name, sku: hasVariants ? null : (group[0]["SKU"] || null), categoryId, hasVariants,
            price: hasVariants ? variants[0].price : Number(group[0]["Giá bán"]) || 0,
            cost: hasVariants ? variants[0].cost : Number(group[0]["Giá vốn"]) || 0,
            options: hasVariants ? Object.entries(keyValues).map(([n, set]) => ({ name: n, values: [...set] })) : [],
            warrantyContent: (group[0]["Nội dung bảo hành"] || "").trim() || null,
            warrantyMonths: Number(group[0]["Bảo hành (tháng)"]) || 0,
            active: (group[0]["Trạng thái"] || "").trim() !== "Ẩn",
          };

          if (isUpdate) {
            await productsService.updateProduct(productId, basePayload);
            for (const v of variants) {
              const body = { sku: v.sku, attrs: v.attrs, price: v.price, cost: v.cost };
              if (v.id) await productsService.updateVariant(productId, v.id, body);
              else await productsService.createVariant(productId, body);
            }
            updated++;
          } else {
            const created = await productsService.createProduct({ ...basePayload, variants });
            if (!basePayload.active) await productsService.updateProduct(created.id, { active: false });
            ok++;
          }
        } catch (err) {
          failed.push({ name, error: err.message });
        }
      }

      setImportResult({ ok, updated, failed });
      setCategories(categoryList);
      reload();
    } catch (err) {
      setImportResult({ ok: 0, updated: 0, failed: [{ name: "", error: err.message }] });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Sản phẩm</h2>
        <div className="flex gap-2">
          <button onClick={exportProducts} className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl">
            Xuất CSV
          </button>
          {can("products_edit") && (
            <>
              <button onClick={downloadTemplate} className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl">
                Tải file mẫu
              </button>
              <label className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl cursor-pointer">
                {importing ? "Đang nhập…" : "Nhập CSV"}
                <input type="file" accept=".csv" onChange={handleImportFile} disabled={importing} className="hidden" />
              </label>
              <button onClick={() => setEditing({})} className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl">
                + Thêm sản phẩm
              </button>
            </>
          )}
        </div>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      {importResult && (
        <div className={`text-sm rounded-lg px-3 py-2 space-y-1 ${importResult.failed.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
          <div>
            Đã tạo mới {importResult.ok} sản phẩm, cập nhật {importResult.updated || 0} sản phẩm.
            {importResult.failed.length > 0 ? ` ${importResult.failed.length} lỗi:` : ""}
          </div>
          {importResult.failed.map((f, i) => (
            <div key={i} className="text-xs">— {f.name || "(không rõ)"}: {f.error}</div>
          ))}
          {importResult.note && <div className="text-xs">{importResult.note}</div>}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {products.map((p) => (
          <div key={p.id} className={`bg-white rounded-2xl p-4 shadow-sm border border-slate-100 ${p.active === false ? "opacity-50" : ""}`}>
            <div className="font-bold text-slate-800">{p.name} {p.active === false && <span className="text-xs font-normal text-slate-400">(Đã ẩn)</span>}</div>
            <div className="text-xs text-slate-400">{p.sku || "—"} · {categories.find((c) => c.id === p.category_id)?.name || "Chưa phân danh mục"}</div>
            <div className="text-[10px] text-slate-300 font-mono" title={p.id}>{p.code || p.id}</div>
            <div className="text-sm text-teal-600 font-semibold mt-1">{fmt(p.price)}</div>
            {p.has_variants && p.variants?.length > 0 && (
              <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                {p.variants.map((v) => (
                  <div key={v.id}>
                    {v.sku ? `${v.sku} · ` : ""}{Object.values(v.attrs || {}).join(" / ") || "—"}: {fmt(v.price)}
                  </div>
                ))}
              </div>
            )}
            {(can("products_edit") || can("products_delete")) && (
              <div className="flex gap-3 mt-3 text-xs">
                {can("products_edit") && (
                  <>
                    <button onClick={() => setEditing(p)} className="text-teal-600 hover:underline">Sửa</button>
                    <button onClick={() => toggleActive(p)} className="text-slate-500 hover:underline">
                      {p.active === false ? "Hiện lại" : "Ẩn"}
                    </button>
                  </>
                )}
                {can("products_delete") && (
                  <button onClick={() => remove(p.id)} className="text-red-500 hover:underline">Xoá</button>
                )}
              </div>
            )}
          </div>
        ))}
        {products.length === 0 && <p className="text-slate-400 text-sm">Chưa có sản phẩm.</p>}
      </div>

      {editing !== null && (
        <ProductModal
          product={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
          onCategoryCreated={(c) => setCategories((cs) => [...cs, c])}
        />
      )}
    </div>
  );
}

// Khoá so khớp 1 tổ hợp attrs, không phân biệt thứ tự khoá — dùng để giữ lại SKU/giá khi tạo lại ma trận.
function attrsKey(attrs) {
  return Object.keys(attrs).sort().map((k) => `${k}=${attrs[k]}`).join("|");
}
// Tích Đề-các giữa các phân loại, VD Màu:[Đỏ,Đen] × Size:[S,M] → 4 tổ hợp.
function cartesianAttrs(groups) {
  let combos = [{}];
  for (const g of groups) {
    const next = [];
    for (const combo of combos) {
      for (const val of g.values) next.push({ ...combo, [g.name]: val });
    }
    combos = next;
  }
  return combos;
}

function ProductModal({ product, categories, onClose, onSaved, onCategoryCreated }) {
  const isNew = !product.id;
  const [name, setName] = useState(product.name || "");
  const [sku, setSku] = useState(product.sku || "");
  const [categoryId, setCategoryId] = useState(product.category_id || "");
  const [newCategory, setNewCategory] = useState("");
  const [price, setPrice] = useState(product.price || 0);
  const [cost, setCost] = useState(product.cost || 0);
  const [hasVariants, setHasVariants] = useState(!!product.has_variants);
  // Phân loại biến thể (VD: Màu, Size) — nguồn để sinh ma trận tổ hợp.
  const [optionGroups, setOptionGroups] = useState(
    Array.isArray(product.options) && product.options.length
      ? product.options.map((o) => ({ name: o.name, valuesText: (o.values || []).join(", ") }))
      : [{ name: "", valuesText: "" }]
  );
  // Bảo hành: 1 nội dung + 1 thời hạn (tháng) cho cả sản phẩm.
  const [warrantyContent, setWarrantyContent] = useState(product.warranty_content || "");
  const [warrantyMonths, setWarrantyMonths] = useState(product.warranty_months || 0);

  const existingVariants = product.variants || [];
  // Ma trận biến thể đã sinh ra: mỗi dòng = 1 tổ hợp, chỉ cần điền SKU/giá/vốn.
  const [matrix, setMatrix] = useState(
    existingVariants.map((v) => ({ id: v.id, sku: v.sku || "", attrs: v.attrs || {}, price: v.price, cost: v.cost }))
  );
  const [removedVariantIds, setRemovedVariantIds] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function addOptionGroup() {
    setOptionGroups((gs) => [...gs, { name: "", valuesText: "" }]);
  }
  function setOptionGroup(idx, patch) {
    setOptionGroups((gs) => gs.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  }
  function removeOptionGroup(idx) {
    setOptionGroups((gs) => gs.filter((_, i) => i !== idx));
  }

  // Sinh lại bảng ma trận từ các phân loại đã khai báo, giữ nguyên SKU/giá/vốn của tổ hợp đã có.
  function generateMatrix() {
    const groups = optionGroups
      .map((g) => ({ name: g.name.trim(), values: g.valuesText.split(",").map((s) => s.trim()).filter(Boolean) }))
      .filter((g) => g.name && g.values.length);
    if (!groups.length) { setError("Khai báo ít nhất 1 phân loại có tên và giá trị"); return; }
    setError("");

    const known = {};
    for (const m of matrix) known[attrsKey(m.attrs)] = m;
    for (const v of existingVariants) {
      const k = attrsKey(v.attrs || {});
      known[k] = known[k] || { id: v.id, sku: v.sku || "", attrs: v.attrs, price: v.price, cost: v.cost };
    }

    const combos = cartesianAttrs(groups);
    const newMatrix = combos.map((attrs) => {
      const found = known[attrsKey(attrs)];
      return found ? { ...found, attrs } : { sku: "", attrs, price: price || 0, cost: cost || 0 };
    });
    setMatrix(newMatrix);

    const newKeys = new Set(combos.map(attrsKey));
    const removed = existingVariants.filter((v) => !newKeys.has(attrsKey(v.attrs || {}))).map((v) => v.id);
    setRemovedVariantIds((ids) => [...new Set([...ids, ...removed])]);
  }

  function setMatrixRow(idx, patch) {
    setMatrix((ms) => ms.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Thiếu tên sản phẩm");
    if (hasVariants && matrix.length === 0) return setError('Chưa có biến thể — bấm "Tạo bảng biến thể" trước');
    setSaving(true);
    try {
      let catId = categoryId;
      if (!catId && newCategory.trim()) {
        const cat = await categoriesService.createCategory(newCategory.trim());
        catId = cat.id;
        onCategoryCreated(cat);
      }
      const savedOptions = optionGroups
        .map((g) => ({ name: g.name.trim(), values: g.valuesText.split(",").map((s) => s.trim()).filter(Boolean) }))
        .filter((g) => g.name && g.values.length);
      const payload = {
        name: name.trim(),
        sku: sku || null,
        categoryId: catId || null,
        hasVariants,
        price: Number(price) || 0,
        cost: Number(cost) || 0,
        options: hasVariants ? savedOptions : [],
        warrantyContent: warrantyContent.trim() || null,
        warrantyMonths: Number(warrantyMonths) || 0,
        variants: hasVariants ? matrix.map((m) => ({
          sku: m.sku || null, attrs: m.attrs, price: Number(m.price) || 0, cost: Number(m.cost) || 0,
        })) : [],
      };
      if (isNew) {
        await productsService.createProduct(payload);
      } else {
        await productsService.updateProduct(product.id, payload);
        // Xoá biến thể đã bị bỏ khỏi ma trận, rồi đồng bộ phần còn lại (cập nhật cái có id, tạo mới cái chưa có id)
        for (const vid of removedVariantIds) {
          await productsService.deleteVariant(product.id, vid);
        }
        for (const m of matrix) {
          const body = { sku: m.sku || null, attrs: m.attrs, price: Number(m.price) || 0, cost: Number(m.cost) || 0 };
          if (m.id) await productsService.updateVariant(product.id, m.id, body);
          else await productsService.createVariant(product.id, body);
        }
      }
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isNew ? "Thêm sản phẩm" : "Sửa sản phẩm"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Tên sản phẩm</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">{hasVariants ? "SKU chung (có thể để trống, mỗi biến thể có SKU riêng bên dưới)" : "SKU"}</label>
            <input value={sku} onChange={(e) => setSku(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Danh mục</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">— Chọn danh mục —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Hoặc tạo danh mục mới</label>
            <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Tên danh mục mới"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Giá bán</label>
            <MoneyInput value={price} onChange={setPrice}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Giá vốn</label>
            <MoneyInput value={cost} onChange={setCost}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Nội dung bảo hành</label>
            <textarea value={warrantyContent} onChange={(e) => setWarrantyContent(e.target.value)} rows={2}
              placeholder="VD: Bảo hành toàn bộ sản phẩm"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Thời gian bảo hành (tháng)</label>
            <input type="number" min="0" value={warrantyMonths} onChange={(e) => setWarrantyMonths(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            {Number(warrantyMonths) <= 0 && (
              <p className="text-xs text-slate-400 mt-1">Để 0 nếu sản phẩm không bảo hành — đơn hàng sẽ không tự tạo phiếu bảo hành.</p>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} />
          Sản phẩm có biến thể (màu/size...)
        </label>

        {hasVariants && (
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <div>
              <label className="text-xs text-slate-500">Bước 1 — Khai báo phân loại biến thể</label>
              <div className="space-y-2 mt-1">
                {optionGroups.map((g, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input value={g.name} onChange={(e) => setOptionGroup(idx, { name: e.target.value })}
                      placeholder="VD: Màu" className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                    <input value={g.valuesText} onChange={(e) => setOptionGroup(idx, { valuesText: e.target.value })}
                      placeholder="VD: Đỏ, Đen, Trắng (ngăn cách bằng dấu phẩy)"
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                    <button type="button" onClick={() => removeOptionGroup(idx)} className="text-red-500 px-2 text-sm">✕</button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button type="button" onClick={addOptionGroup} className="text-teal-600 text-sm font-medium">+ Thêm phân loại</button>
                  <button type="button" onClick={generateMatrix} className="bg-slate-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
                    Tạo bảng biến thể
                  </button>
                </div>
              </div>
            </div>

            {matrix.length > 0 && (
              <div>
                <label className="text-xs text-slate-500">Bước 2 — Điền SKU / giá / vốn cho từng tổ hợp</label>
                <div className="border border-slate-200 rounded-lg overflow-x-auto mt-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs text-slate-500">
                        <th className="px-2 py-1.5 text-left">Tổ hợp</th>
                        <th className="px-2 py-1.5 text-left">SKU</th>
                        <th className="px-2 py-1.5 text-left">Giá</th>
                        <th className="px-2 py-1.5 text-left">Vốn</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {matrix.map((m, idx) => (
                        <tr key={attrsKey(m.attrs)}>
                          <td className="px-2 py-1.5 whitespace-nowrap">{Object.values(m.attrs).join(" / ")}</td>
                          <td className="px-2 py-1.5">
                            <input value={m.sku} onChange={(e) => setMatrixRow(idx, { sku: e.target.value })}
                              placeholder="SKU" className="w-28 border border-slate-200 rounded-lg px-2 py-1 text-sm" />
                          </td>
                          <td className="px-2 py-1.5">
                            <MoneyInput value={m.price} onChange={(val) => setMatrixRow(idx, { price: val })}
                              className="w-28 border border-slate-200 rounded-lg px-2 py-1 text-sm" />
                          </td>
                          <td className="px-2 py-1.5">
                            <MoneyInput value={m.cost} onChange={(val) => setMatrixRow(idx, { cost: val })}
                              className="w-28 border border-slate-200 rounded-lg px-2 py-1 text-sm" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving}
            className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
