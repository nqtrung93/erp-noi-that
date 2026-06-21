import { useEffect, useState } from "react";
import * as shopsService from "../services/shops.service.js";
import * as orderSourcesService from "../services/orderSources.service.js";
import * as settingsService from "../services/settings.service.js";
import * as customersService from "../services/customers.service.js";
import * as warehousesService from "../services/warehouses.service.js";
import Modal from "../components/Modal.jsx";
import { useAuth } from "../store/auth.store.jsx";

const SUB_TABS = [
  { id: "warehouses", label: "Kho hàng" },
  { id: "company", label: "Thông tin công ty" },
  { id: "shops", label: "Shop TMĐT" },
  { id: "sources", label: "Nguồn đơn hàng" },
  { id: "groups", label: "Nhóm khách hàng" },
  { id: "logo", label: "Logo" },
  { id: "templates", label: "Mẫu in" },
  { id: "docformats", label: "Định dạng số phiếu" },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState("shops");
  const tabs = user?.role === "Admin" ? [...SUB_TABS, { id: "danger", label: "Dữ liệu" }] : SUB_TABS;
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Cài đặt</h2>
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 ${subTab === t.id ? "border-teal-600 text-teal-600" : "border-transparent text-slate-500"} ${t.id === "danger" ? "text-red-500" : ""}`}>
            {t.label}
          </button>
        ))}
      </div>
      {subTab === "warehouses" && <WarehousesManager />}
      {subTab === "company" && <CompanyInfoManager />}
      {subTab === "shops" && (
        <SimpleListManager
          title="Shop bán hàng TMĐT"
          hint="Số lượng shop không cố định — thêm/xoá tuỳ ý. Dùng khi tạo đơn TMĐT."
          list={shopsService.listShops}
          create={shopsService.createShop}
          remove={shopsService.deleteShop}
        />
      )}
      {subTab === "sources" && (
        <SimpleListManager
          title="Nguồn đơn hàng"
          hint="VD: Hotline, Facebook, Tự gọi điện... — hiện trong ô chọn Nguồn đơn khi tạo đơn hàng."
          list={orderSourcesService.listOrderSources}
          create={orderSourcesService.createOrderSource}
          remove={orderSourcesService.deleteOrderSource}
        />
      )}
      {subTab === "groups" && (
        <SimpleListManager
          title="Nhóm khách hàng"
          hint="VD: Khách lẻ, Đại lý... — dùng để lọc và phân loại khách hàng ở tab Khách hàng."
          list={customersService.listCustomerGroupObjs}
          create={customersService.createCustomerGroup}
          remove={customersService.deleteCustomerGroup}
        />
      )}
      {subTab === "logo" && <LogoManager />}
      {subTab === "templates" && <TemplatesManager />}
      {subTab === "docformats" && <DocFormatsManager />}
      {subTab === "danger" && user?.role === "Admin" && <DataResetManager />}
    </div>
  );
}

// Quản lý kho hàng: thêm/sửa/xoá (mã, tên, địa chỉ).
function WarehousesManager() {
  const { can } = useAuth();
  const [warehouses, setWarehouses] = useState([]);
  const [editing, setEditing] = useState(null); // null = đóng modal, {} = thêm mới, {...} = sửa
  const [error, setError] = useState("");

  async function reload() {
    try { setWarehouses(await warehousesService.listWarehouses()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  async function remove(id) {
    if (!confirm("Xoá kho này? Chỉ xoá được nếu kho không còn dữ liệu liên quan.")) return;
    try { await warehousesService.deleteWarehouse(id); reload(); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-slate-700">Kho hàng</div>
          <p className="text-xs text-slate-400">Số lượng kho không cố định — thêm/sửa/xoá tuỳ ý.</p>
        </div>
        {can("warehouse_edit") && (
          <button onClick={() => setEditing({})} className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl">
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
            {can("warehouse_edit") && (
              <div className="flex gap-3 text-xs">
                <button onClick={() => setEditing(w)} className="text-teal-600 hover:underline">Sửa</button>
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
      if (isNew) await warehousesService.createWarehouse(payload);
      else await warehousesService.updateWarehouse(warehouse.id, payload);
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
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="VD: WH05"
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
            className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Thông tin công ty — in lên đầu mọi phiếu (hoá đơn, phiếu kho, phiếu vận chuyển).
function CompanyInfoManager() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    settingsService.getCompanyInfo()
      .then((info) => {
        setName(info.name || ""); setAddress(info.address || ""); setPhone(info.phone || "");
        setEmail(info.email || ""); setWebsite(info.website || ""); setTaxCode(info.taxCode || "");
      })
      .catch((e) => setError(e.message));
  }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaved(false);
    try {
      await settingsService.setCompanyInfo({ name, address, phone, email, website, taxCode });
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
        <p className="text-xs text-slate-400">Hiện ở đầu hoá đơn, phiếu kho, phiếu vận chuyển khi in.</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      {saved && <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg px-3 py-2">Đã lưu.</div>}
      <div>
        <label className="text-xs text-slate-500">Tên công ty</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs text-slate-500">Địa chỉ (có thể nhiều dòng, VD: Địa chỉ HN / Địa chỉ HCM)</label>
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500">Điện thoại</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500">Website</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Mã số thuế</label>
          <input value={taxCode} onChange={(e) => setTaxCode(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <button type="submit" disabled={saving}
        className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
        {saving ? "Đang lưu…" : "Lưu"}
      </button>
    </form>
  );
}

// Upload logo công ty (lưu base64 trong app_settings), hiện ở header sau khi lưu.
function LogoManager() {
  const [logo, setLogoState] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    try { setLogoState((await settingsService.getLogo()).logo); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) { setError("Chỉ chấp nhận file ảnh"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      // Resize về tối đa 300px chiều cao + nén JPEG để base64 luôn nhỏ gọn, tránh lỗi quá dung lượng.
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 300 / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        setLogoState(canvas.toDataURL("image/png", 0.9));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    try { await settingsService.setLogo(logo); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function removeLogo() {
    setSaving(true);
    try { await settingsService.setLogo(null); setLogoState(null); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-3 max-w-md">
      <div>
        <div className="font-semibold text-slate-700">Logo công ty</div>
        <p className="text-xs text-slate-400">Hiện ở góc trên cùng (header) thay cho tên hệ thống.</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      {logo && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex items-center justify-center">
          <img src={logo} alt="Logo" className="max-h-20 object-contain" />
        </div>
      )}
      <input type="file" accept="image/*" onChange={onFile}
        className="block text-sm text-slate-600" />
      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
          {saving ? "…" : "Lưu"}
        </button>
        {logo && (
          <button onClick={removeLogo} disabled={saving}
            className="text-red-500 text-sm font-medium px-4 py-2 rounded-xl border border-red-200 disabled:opacity-50">
            Xoá logo
          </button>
        )}
      </div>
    </div>
  );
}

// Quản lý 1 danh sách tên đơn giản (shop / nguồn đơn...): xem, thêm, xoá.
function SimpleListManager({ title, hint, list, create, remove }) {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    try { setItems(await list()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await create(name.trim());
      setName("");
      reload();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  async function del(id) {
    if (!confirm("Xoá mục này?")) return;
    try { await remove(id); reload(); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="font-semibold text-slate-700">{title}</div>
        <p className="text-xs text-slate-400">{hint}</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      <form onSubmit={add} className="flex gap-2 max-w-md">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên mới"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        <button type="submit" disabled={saving}
          className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
          + Thêm
        </button>
      </form>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100 max-w-md">
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span>{it.name}</span>
            <button onClick={() => del(it.id)} className="text-red-500 hover:underline text-xs">Xoá</button>
          </div>
        ))}
        {items.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có mục nào.</p>}
      </div>
    </div>
  );
}

const TEMPLATE_TYPES = [
  { id: "invoice", label: "Hoá đơn / Đơn hàng" },
  { id: "stock_doc", label: "Phiếu kho (Nhập hàng / Điều chỉnh / Luân chuyển)" },
  { id: "shipment", label: "Phiếu vận chuyển" },
  { id: "warranty", label: "Phiếu bảo hành" },
];

const COMPANY_PLACEHOLDERS = "{{companyHeaderLine}} {{companyName}} {{companyAddress}} {{companyPhone}} {{companyEmail}} {{companyTaxCode}}";
const PLACEHOLDER_HINTS = {
  invoice: `${COMPANY_PLACEHOLDERS} {{code}} {{date}} {{customerName}} {{customerPhone}} {{customerAddress}} {{rowsHtml}} {{subtotal}} {{shippingOrVatLine}} {{total}} {{paid}} {{due}} {{paymentMethod}} {{shippingMethod}} {{noteLine}}`,
  stock_doc: `${COMPANY_PLACEHOLDERS} {{title}} {{docNo}} {{metaLine}} {{date}} {{rowsHtml}} {{reasonLine}}`,
  shipment: `${COMPANY_PLACEHOLDERS} {{docNo}} {{orderCode}} {{date}} {{carrier}} {{trackingLine}} {{customerName}} {{customerPhone}} {{customerAddress}} {{amountDue}} {{shipCost}}`,
  warranty: `${COMPANY_PLACEHOLDERS} {{docNo}} {{orderCodeLine}} {{startDate}} {{productName}} {{customerName}} {{customerPhoneLine}} {{partsRowsHtml}}`,
};

// Sửa mẫu in HTML cho từng loại phiếu — lưu ở app_settings, khôi phục mặc định nếu xoá trắng rồi Lưu.
function TemplatesManager() {
  const [type, setType] = useState("invoice");
  const [templates, setTemplates] = useState({});
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    try {
      const t = await settingsService.getTemplates();
      setTemplates(t);
      setHtml(t[type] || "");
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);
  useEffect(() => { setHtml(templates[type] || ""); }, [type]);

  async function save() {
    setSaving(true);
    try {
      await settingsService.setTemplate(type, html);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function resetDefault() {
    if (!confirm("Khôi phục mẫu in mặc định cho loại phiếu này?")) return;
    setSaving(true);
    try {
      await settingsService.setTemplate(type, "");
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function openPreview() {
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="font-semibold text-slate-700">Mẫu in</div>
        <p className="text-xs text-slate-400">Tuỳ chỉnh HTML cho từng loại phiếu. Dùng các placeholder dạng {"{{...}}"} — hệ thống sẽ tự điền dữ liệu khi in.</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="flex gap-1 border-b border-slate-200">
        {TEMPLATE_TYPES.map((t) => (
          <button key={t.id} onClick={() => setType(t.id)}
            className={`px-3 py-2 text-xs font-medium border-b-2 ${type === t.id ? "border-teal-600 text-teal-600" : "border-transparent text-slate-500"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500 font-mono break-all">
        Placeholder dùng được: {PLACEHOLDER_HINTS[type]}
      </div>

      <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={16} spellCheck={false}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono" />

      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
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

// Tuỳ chỉnh tiền tố + số chữ số đệm cho từng loại số phiếu (ORD-000001, PN-000001...).
// Phần số vẫn tự tăng từ sequence — chỉ đổi cách hiển thị tiền tố/độ dài đệm số.
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
                    className="bg-teal-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">
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

// Reset dữ liệu — CHỈ Admin thấy tab này (kiểm ở component cha). Mỗi nút yêu cầu gõ đúng chuỗi
// xác nhận rồi mới bật được, cộng thêm window.confirm cảnh báo rõ hậu quả trước khi gọi API.
function DataResetManager() {
  const [error, setError] = useState("");
  const [doneMsg, setDoneMsg] = useState("");
  const [busyScope, setBusyScope] = useState("");
  const [backingUp, setBackingUp] = useState(false);

  async function handleBackup() {
    setBackingUp(true); setError(""); setDoneMsg("");
    try {
      await settingsService.downloadBackup();
      setDoneMsg("Đã tải bản backup — kiểm tra thư mục Downloads.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <div className="font-semibold text-slate-700">Backup dữ liệu</div>
        <p className="text-xs text-slate-400">Tải toàn bộ database hiện tại về 1 file (.dump) để lưu trữ/phục hồi khi cần. Nên backup định kỳ.</p>
      </div>
      <button onClick={handleBackup} disabled={backingUp}
        className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
        {backingUp ? "Đang tạo bản backup…" : "Tải bản backup"}
      </button>

      <div className="pt-2">
        <div className="font-semibold text-red-600">Vùng nguy hiểm — Reset dữ liệu</div>
        <p className="text-xs text-slate-400">Chỉ Admin thực hiện được. Hành động KHÔNG THỂ HOÀN TÁC — hãy chắc chắn trước khi gõ xác nhận. Nên tải bản backup trước khi reset.</p>
      </div>
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      {doneMsg && <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg px-3 py-2">{doneMsg}</div>}

      <ResetCard
        title="Reset dữ liệu giao dịch"
        description="Xoá đơn hàng, phiếu kho (nhập/điều chỉnh/luân chuyển), thu chi, vận chuyển, bảo hành. GIỮ LẠI sản phẩm, khách hàng, nhà cung cấp, kho, nhân viên, cài đặt."
        scope="transactions"
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
        description="Xoá SẠCH mọi thứ — sản phẩm, khách hàng, nhà cung cấp, đơn hàng, kho, nhân viên khác... — về trạng thái như mới cài đặt. Giữ nguyên vai trò/phân quyền và tài khoản Admin bạn đang đăng nhập."
        scope="all"
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

function ResetCard({ title, description, scope, danger, busy, disabled, onConfirmed }) {
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
