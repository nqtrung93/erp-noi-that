import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as settingsService from "../services/settings.service.js";
import * as inventoryService from "../services/inventory.service.js";
import Modal from "../components/Modal.jsx";

const SUB_TABS = [
  { id: "warehouses", label: "Kho hàng" },
  { id: "company", label: "Thông tin công ty" },
  { id: "templates", label: "Mẫu in hoá đơn" },
  { id: "docformats", label: "Định dạng số phiếu" },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState("warehouses");
  const tabs = user?.role === "Admin" ? [...SUB_TABS, { id: "danger", label: "Dữ liệu" }] : SUB_TABS;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Cài đặt</h2>
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 ${subTab === t.id ? "border-sky-600 text-sky-600" : "border-transparent text-slate-500"} ${t.id === "danger" ? "text-red-500" : ""}`}>
            {t.label}
          </button>
        ))}
      </div>
      {subTab === "warehouses" && <WarehousesManager />}
      {subTab === "company" && <CompanyInfoManager />}
      {subTab === "templates" && <TemplatesManager />}
      {subTab === "docformats" && <DocFormatsManager />}
      {subTab === "danger" && user?.role === "Admin" && <DataResetManager />}
    </div>
  );
}

function WarehousesManager() {
  const { can } = useAuth();
  const [warehouses, setWarehouses] = useState([]);
  const [editing, setEditing] = useState(null); // null = đóng, {} = thêm mới, {...} = sửa
  const [error, setError] = useState("");

  async function reload() {
    try { setWarehouses(await inventoryService.listWarehouses()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  async function remove(id) {
    if (!confirm("Xoá kho này?")) return;
    try { await inventoryService.removeWarehouse(id); reload(); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-slate-700">Kho hàng</div>
          <p className="text-xs text-slate-400">Số lượng kho không cố định — thêm/sửa/xoá tuỳ ý.</p>
        </div>
        {can("inventory_edit") && (
          <button onClick={() => setEditing({})} className="bg-sky-600 text-white text-sm font-medium px-4 py-2 rounded-xl">
            + Thêm kho
          </button>
        )}
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100 max-w-2xl">
        {warehouses.map((w) => (
          <div key={w.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-bold text-slate-800">{w.name} <span className="text-xs font-normal text-slate-400">{w.code}</span></div>
              <div className="text-xs text-slate-400">{w.address || "Chưa có địa chỉ"}</div>
            </div>
            {can("inventory_edit") && (
              <div className="flex gap-3 text-xs">
                <button onClick={() => setEditing(w)} className="text-sky-600 hover:underline">Sửa</button>
                <button onClick={() => remove(w.id)} className="text-red-500 hover:underline">Xoá</button>
              </div>
            )}
          </div>
        ))}
        {warehouses.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có kho nào.</p>}
      </div>
      {editing !== null && (
        <WarehouseModal warehouse={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function WarehouseModal({ warehouse, onClose, onSaved }) {
  const isNew = !warehouse.id;
  const [code, setCode] = useState(warehouse.code || "");
  const [name, setName] = useState(warehouse.name || "");
  const [address, setAddress] = useState(warehouse.address || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!code.trim() || !name.trim()) return setError("Thiếu mã hoặc tên kho");
    setSaving(true);
    try {
      const payload = { code: code.trim(), name: name.trim(), address: address || null };
      if (isNew) await inventoryService.createWarehouse(payload);
      else await inventoryService.updateWarehouse(warehouse.id, payload);
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isNew ? "Thêm kho" : "Sửa kho"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="text-xs text-slate-500">Mã kho</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="VD: KHO02"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Tên kho</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Địa chỉ</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
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

function CompanyInfoManager() {
  const [form, setForm] = useState({ name: "", address: "", phone: "", email: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { settingsService.getCompanyInfo().then(setForm).catch((e) => setError(e.message)); }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaved(false);
    try {
      await settingsService.updateCompanyInfo(form);
      setSaved(true);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3 max-w-md">
      <div>
        <div className="font-semibold text-slate-700">Thông tin công ty</div>
        <p className="text-xs text-slate-400">Hiện ở đầu hoá đơn khi in.</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      {saved && <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg px-3 py-2">Đã lưu.</div>}
      <div>
        <label className="text-xs text-slate-500">Tên công ty</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs text-slate-500">Địa chỉ</label>
        <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500">Điện thoại</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Email</label>
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <button type="submit" disabled={saving}
        className="bg-sky-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
        {saving ? "Đang lưu…" : "Lưu"}
      </button>
    </form>
  );
}

const PLACEHOLDER_HINT = "{{companyName}} {{companyAddress}} {{companyPhone}} {{code}} {{date}} {{customerName}} {{rowsHtml}} {{subtotal}} {{discount}} {{total}} {{paid}} {{due}}";

function TemplatesManager() {
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    try { setHtml((await settingsService.getTemplates()).invoice); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  async function save() {
    setSaving(true);
    try { await settingsService.setInvoiceTemplate(html); await reload(); }
    catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  async function resetDefault() {
    if (!confirm("Khôi phục mẫu in mặc định?")) return;
    setSaving(true);
    try { await settingsService.setInvoiceTemplate(""); await reload(); }
    catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  function openPreview() {
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="font-semibold text-slate-700">Mẫu in hoá đơn bán hàng</div>
        <p className="text-xs text-slate-400">Tuỳ chỉnh HTML. Dùng placeholder dạng {"{{...}}"} — hệ thống tự điền dữ liệu khi in.</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500 font-mono break-all">
        Placeholder dùng được: {PLACEHOLDER_HINT}
      </div>
      <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={16} spellCheck={false}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono" />
      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="bg-sky-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
          {saving ? "Đang lưu…" : "Lưu mẫu"}
        </button>
        <button onClick={openPreview} type="button"
          className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl">
          Xem trước
        </button>
        <button onClick={resetDefault} disabled={saving} type="button"
          className="text-red-500 text-sm font-medium px-4 py-2 rounded-xl border border-red-200 disabled:opacity-50">
          Khôi phục mặc định
        </button>
      </div>
    </div>
  );
}

function DocFormatsManager() {
  const [formats, setFormats] = useState({});
  const [error, setError] = useState("");
  const [savingType, setSavingType] = useState("");

  async function reload() {
    try { setFormats(await settingsService.getDocFormats()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  function setField(type, field, value) {
    setFormats((f) => ({ ...f, [type]: { ...f[type], [field]: value } }));
  }

  async function save(type) {
    const f = formats[type];
    setSavingType(type);
    setError("");
    try {
      await settingsService.setDocFormat(type, f.prefix, Number(f.pad));
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingType("");
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="font-semibold text-slate-700">Định dạng số phiếu</div>
        <p className="text-xs text-slate-400">Đổi tiền tố và số chữ số đệm cho từng loại phiếu. Số thứ tự vẫn tự tăng, không lặp lại.</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs border-b border-slate-100">
              <th className="py-2 px-4">Loại phiếu</th>
              <th className="py-2 px-4">Tiền tố</th>
              <th className="py-2 px-4">Số chữ số đệm</th>
              <th className="py-2 px-4">Ví dụ</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Object.entries(formats).map(([type, f]) => (
              <tr key={type}>
                <td className="py-2 px-4 font-medium">{f.label}</td>
                <td className="py-2 px-4">
                  <input value={f.prefix} onChange={(e) => setField(type, "prefix", e.target.value.toUpperCase())}
                    maxLength={10} className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-sm" />
                </td>
                <td className="py-2 px-4">
                  <input type="number" min="1" max="10" value={f.pad}
                    onChange={(e) => setField(type, "pad", e.target.value)}
                    className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm" />
                </td>
                <td className="py-2 px-4 text-slate-400 font-mono">
                  {f.prefix}-{String(1).padStart(Number(f.pad) || 6, "0")}
                </td>
                <td className="py-2 px-4">
                  <button onClick={() => save(type)} disabled={savingType === type}
                    className="bg-sky-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">
                    {savingType === type ? "…" : "Lưu"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const CONFIRM_PHRASE = "XOA DU LIEU";

function DataResetManager() {
  const [error, setError] = useState("");
  const [doneMsg, setDoneMsg] = useState("");
  const [busyScope, setBusyScope] = useState("");

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <div className="font-semibold text-red-600">Vùng nguy hiểm — Reset dữ liệu</div>
        <p className="text-xs text-slate-400">Chỉ Admin thực hiện được. Hành động KHÔNG THỂ HOÀN TÁC — hãy chắc chắn trước khi gõ xác nhận.</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      {doneMsg && <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg px-3 py-2">{doneMsg}</div>}

      <ResetCard
        title="Reset dữ liệu giao dịch"
        description="Xoá đơn hàng, phiếu kho, thu chi, công nợ, bảng lương. GIỮ LẠI sản phẩm, khách hàng/NCC, kho, nhân viên, danh mục, cài đặt."
        busy={busyScope === "transactions"}
        disabled={!!busyScope}
        onConfirmed={async () => {
          setBusyScope("transactions"); setError(""); setDoneMsg("");
          try {
            await settingsService.resetData("transactions", CONFIRM_PHRASE);
            setDoneMsg("Đã reset xong dữ liệu giao dịch.");
          } catch (e) { setError(e.message); }
          finally { setBusyScope(""); }
        }}
      />

      <ResetCard
        title="Reset toàn bộ dữ liệu"
        description="Xoá SẠCH mọi thứ — sản phẩm, khách hàng, nhà cung cấp, đơn hàng, kho, nhân viên, danh mục... — về trạng thái như mới cài đặt. Giữ nguyên tài khoản Admin bạn đang đăng nhập."
        danger
        busy={busyScope === "all"}
        disabled={!!busyScope}
        onConfirmed={async () => {
          setBusyScope("all"); setError(""); setDoneMsg("");
          try {
            await settingsService.resetData("all", CONFIRM_PHRASE);
            setDoneMsg("Đã reset xong toàn bộ dữ liệu. Hãy tải lại trang.");
          } catch (e) { setError(e.message); }
          finally { setBusyScope(""); }
        }}
      />
    </div>
  );
}

function ResetCard({ title, description, danger, busy, disabled, onConfirmed }) {
  const [input, setInput] = useState("");
  const ready = input.trim() === CONFIRM_PHRASE;

  function handleClick() {
    if (!confirm(`XÁC NHẬN CUỐI: "${title}" sẽ xoá dữ liệu vĩnh viễn và KHÔNG THỂ HOÀN TÁC. Tiếp tục?`)) return;
    onConfirmed();
    setInput("");
  }

  return (
    <div className={`rounded-2xl border p-4 ${danger ? "border-red-300 bg-red-50/40" : "border-amber-300 bg-amber-50/40"}`}>
      <div className="font-bold text-slate-800">{title}</div>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
      <div className="flex items-center gap-2 mt-3">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          placeholder={`Gõ "${CONFIRM_PHRASE}" để mở khoá nút`}
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" />
        <button onClick={handleClick} disabled={!ready || disabled}
          className="bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
          {busy ? "Đang xoá…" : title}
        </button>
      </div>
    </div>
  );
}
