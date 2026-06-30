import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as purchasesService from "../services/purchases.service.js";
import * as inventoryService from "../services/inventory.service.js";
import * as partnersService from "../services/partners.service.js";
import * as settingsService from "../services/settings.service.js";
import * as bankService from "../services/bank.service.js";
import { fmt } from "../utils/format.js";
import Modal from "../components/Modal.jsx";
import Toolbar, { ToolbarButton } from "../components/Toolbar.jsx";
import SearchSelect from "../components/SearchSelect.jsx";
import ProductLinePicker from "../components/ProductLinePicker.jsx";
import MoneyInput from "../components/MoneyInput.jsx";

const STATUS_COLOR = {
  "Nháp": "bg-slate-100 text-slate-600",
  "Mới": "bg-amber-100 text-amber-700",
  "Hoàn thành": "bg-emerald-100 text-emerald-700",
  "Đã hủy": "bg-red-100 text-red-700",
};

export default function PurchasesPage() {
  const { can } = useAuth();
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [stock, setStock] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState(null);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [confirmingPurchase, setConfirmingPurchase] = useState(null);
  const [paying, setPaying] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

  async function reload() {
    try { setPurchases(await purchasesService.listPurchases()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => {
    reload();
    inventoryService.listProducts().then(setProducts).catch(() => {});
    inventoryService.listWarehouses().then(setWarehouses).catch(() => {});
    inventoryService.listStock().then(setStock).catch(() => {});
    partnersService.listPartners().then((ps) => setSuppliers(ps.filter((p) => p.type === "supplier"))).catch(() => {});
    bankService.listBankAccounts().then(setBankAccounts).catch(() => {});
  }, []);

  function addProduct(p) { setProducts((prev) => [...prev, p]); }

  const filtered = purchases.filter((o) => !statusFilter || o.status === statusFilter);

  async function setStatus(id, status) {
    if (status === "Đã hủy" && !confirm("Hủy đơn mua này? Hàng sẽ bị trừ lại khỏi kho (cần đủ tồn để hủy).")) return;
    try { await purchasesService.changePurchaseStatus(id, status); reload(); }
    catch (e) { setError(e.message); }
  }

  async function removePurchase(id) {
    if (!confirm("Xoá đơn mua nháp này? Không thể hoàn tác.")) return;
    try { await purchasesService.removePurchase(id); reload(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="space-y-3">
      <Toolbar
        title="Mua hàng — Đơn mua"
        filters={
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
            <option value="">— Trạng thái —</option>
            <option>Nháp</option>
            <option>Mới</option>
            <option>Hoàn thành</option>
            <option>Đã hủy</option>
          </select>
        }
        actions={can("purchases_edit") && (
          <ToolbarButton variant="primary" onClick={() => setCreating(true)}>+ Tạo đơn mua</ToolbarButton>
        )}
      />
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-400 text-xs">
            <th className="py-2 px-3">Mã đơn</th><th className="py-2 px-3">Nhà cung cấp</th><th className="py-2 px-3 text-right">Tổng tiền</th>
            <th className="py-2 px-3 text-right">Đã trả</th><th className="py-2 px-3 text-right">Còn lại</th>
            <th className="py-2 px-3">Trạng thái</th><th className="py-2 px-3">Ngày</th><th className="py-2 px-3"></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((o) => {
              const remaining = Number(o.total) - Number(o.paid);
              return (
                <tr key={o.id}>
                  <td className="py-2 px-3 font-medium">{o.code}</td>
                  <td className="py-2 px-3">{o.supplier_name || "—"}</td>
                  <td className="py-2 px-3 text-right font-medium">{fmt(o.total)}</td>
                  <td className="py-2 px-3 text-right text-emerald-600">{fmt(o.paid)}</td>
                  <td className="py-2 px-3 text-right text-red-500">{fmt(remaining)}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status]}`}>{o.status}</span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap text-slate-400">{new Date(o.created_at).toLocaleDateString("vi-VN")}</td>
                  <td className="py-2 px-3">
                    <div className="flex gap-2 justify-end text-xs flex-wrap">
                      <button onClick={() => setViewingPurchase(o)} className="text-slate-600 hover:underline">Xem</button>
                      <button onClick={() => purchasesService.openInvoice(o.id)} className="text-indigo-600 hover:underline">In</button>
                      {can("purchases_edit") && ["Nháp", "Mới"].includes(o.status) && (
                        <button onClick={() => setEditingPurchase(o)} className="text-sky-600 hover:underline">Sửa</button>
                      )}
                      {can("purchases_edit") && o.status === "Nháp" && (
                        <button onClick={() => setConfirmingPurchase(o)} className="text-emerald-600 hover:underline">Xác nhận</button>
                      )}
                      {can("purchases_edit") && o.status === "Mới" && remaining > 0 && (
                        <button onClick={() => setPaying(o)} className="text-emerald-600 hover:underline">Trả tiền</button>
                      )}
                      {can("purchases_edit") && o.status === "Mới" && (
                        <>
                          <button onClick={() => setStatus(o.id, "Hoàn thành")} className="text-slate-500 hover:underline">Hoàn thành</button>
                          <button onClick={() => setStatus(o.id, "Đã hủy")} className="text-red-500 hover:underline">Hủy</button>
                        </>
                      )}
                      {can("purchases_edit") && o.status === "Nháp" && (
                        <button onClick={() => removePurchase(o.id)} className="text-red-500 hover:underline">Xoá</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có đơn mua nào.</p>}
      </div>

      {creating && (
        <CreatePurchaseModal products={products} warehouses={warehouses} suppliers={suppliers} stock={stock} bankAccounts={bankAccounts}
          onProductCreated={addProduct}
          onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />
      )}
      {viewingPurchase && (
        <ViewPurchaseModal purchase={viewingPurchase} onClose={() => setViewingPurchase(null)} />
      )}
      {editingPurchase && (
        <EditPurchaseModal purchase={editingPurchase} products={products} stock={stock}
          onProductCreated={addProduct}
          onClose={() => setEditingPurchase(null)} onSaved={() => { setEditingPurchase(null); reload(); }} />
      )}
      {confirmingPurchase && (
        <ConfirmPurchaseModal purchase={confirmingPurchase} bankAccounts={bankAccounts} onClose={() => setConfirmingPurchase(null)} onSaved={() => { setConfirmingPurchase(null); reload(); }} />
      )}
      {paying && (
        <PayPurchaseModal purchase={paying} bankAccounts={bankAccounts} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); reload(); }} />
      )}
    </div>
  );
}

function CreatePurchaseModal({ products, warehouses, suppliers, stock, bankAccounts, onProductCreated, onClose, onSaved }) {
  const [supplierId, setSupplierId] = useState("");
  const [addingNewSupplier, setAddingNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [newSupplierAddress, setNewSupplierAddress] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const [items, setItems] = useState([{ productId: "", variantId: "", qty: 1, price: 0 }]);
  const [paidNow, setPaidNow] = useState("");
  const [method, setMethod] = useState("Tiền mặt");
  const [bankAccountId, setBankAccountId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsService.getDefaultWarehouse().then((r) => { if (r.warehouseId) setWarehouseId(r.warehouseId); }).catch(() => {});
  }, []);

  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const total = subtotal;

  function updateItem(idx, field, value) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: value };
      if (field === "productId") {
        const p = products.find((pp) => String(pp.id) === String(value));
        next.variantId = "";
        if (p && !p.has_variants) next.price = p.cost || 0;
      }
      if (field === "variantId") {
        const p = products.find((pp) => String(pp.id) === String(it.productId));
        const v = p?.variants?.find((vv) => String(vv.id) === String(value));
        if (v) next.price = v.cost || 0;
      }
      return next;
    }));
  }
  function addLine() { setItems((prev) => [...prev, { productId: "", variantId: "", qty: 1, price: 0 }]); }
  function removeLine(idx) { setItems((prev) => prev.filter((_, i) => i !== idx)); }

  async function submit(e, isDraft) {
    e.preventDefault();
    setError("");
    if (!warehouseId) return setError("Thiếu kho nhập hàng");
    if (items.some((it) => !it.productId || !it.qty)) return setError("Vui lòng chọn sản phẩm và số lượng cho mọi dòng");
    if (items.some((it) => products.find((p) => String(p.id) === String(it.productId))?.has_variants && !it.variantId)) {
      return setError("Vui lòng chọn biến thể cho các sản phẩm có biến thể");
    }
    if (addingNewSupplier && !newSupplierName.trim()) return setError("Thiếu tên nhà cung cấp mới");
    setSaving(true);
    try {
      await purchasesService.createPurchase({
        supplierId: addingNewSupplier ? null : (supplierId || null),
        newSupplier: addingNewSupplier ? { name: newSupplierName, phone: newSupplierPhone || null, address: newSupplierAddress || null } : null,
        warehouseId,
        items: items.map((it) => ({ productId: it.productId, variantId: it.variantId || null, qty: Number(it.qty), price: Number(it.price) })),
        discount: 0, shippingFee: 0,
        paidNow: Number(paidNow) || 0, method,
        bankAccountId: method === "Chuyển khoản" ? (bankAccountId || null) : null,
        note: note || null, isDraft,
      });
      onSaved();
    } catch (e2) { setError(e2.message); } finally { setSaving(false); }
  }

  return (
    <Modal title="Tạo đơn mua hàng" onClose={onClose} size="xl">
      <form onSubmit={(e) => submit(e, false)} className="space-y-4 text-base">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-500">Nhà cung cấp</label>
              <button type="button" onClick={() => { setAddingNewSupplier((v) => !v); setSupplierId(""); }}
                className="text-xs text-indigo-600 font-medium">
                {addingNewSupplier ? "← Chọn NCC có sẵn" : "+ NCC mới"}
              </button>
            </div>
            {addingNewSupplier ? (
              <input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="Tên nhà cung cấp"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base" />
            ) : (
              <SearchSelect options={suppliers} value={supplierId} onChange={setSupplierId}
                getLabel={(s) => s.name} getValue={(s) => s.id} getSearchText={(s) => `${s.name} ${s.phone || ""} ${s.code}`}
                placeholder="— Chọn nhà cung cấp —" />
            )}
          </div>
          <div><label className="text-sm text-slate-500">Kho nhập</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select></div>
        </div>
        {addingNewSupplier && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm text-slate-500">Số điện thoại</label>
              <input value={newSupplierPhone} onChange={(e) => setNewSupplierPhone(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base" /></div>
            <div><label className="text-sm text-slate-500">Địa chỉ</label>
              <input value={newSupplierAddress} onChange={(e) => setNewSupplierAddress(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base" /></div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm text-slate-500">Sản phẩm</label>
          {items.map((it, idx) => (
            <div key={idx} className="flex gap-2 items-center flex-wrap">
              <span className="text-xs text-slate-400 w-5 flex-none text-right">{idx + 1}</span>
              <ProductLinePicker products={products} stock={stock} warehouseId={warehouseId}
                productId={it.productId} variantId={it.variantId} onProductCreated={onProductCreated}
                onChangeProduct={(v) => updateItem(idx, "productId", v)} onChangeVariant={(v) => updateItem(idx, "variantId", v)} />
              <input type="number" min="0" value={it.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)}
                placeholder="SL" className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
              <MoneyInput value={it.price} onChange={(v) => updateItem(idx, "price", v)}
                placeholder="Giá nhập" className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
              <span className="text-sm text-slate-600 font-medium w-28 text-right whitespace-nowrap">
                {fmt((Number(it.qty) || 0) * (Number(it.price) || 0))}
              </span>
              {items.length > 1 && (
                <button type="button" onClick={() => removeLine(idx)} className="text-red-500 text-xs">Xoá</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addLine} className="text-indigo-600 text-sm font-medium">+ Thêm dòng</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-sm text-slate-500">Phương thức</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base">
              <option>Tiền mặt</option><option>Chuyển khoản</option>
            </select></div>
          <div><label className="text-sm text-slate-500">Thanh toán ngay</label>
            <MoneyInput value={paidNow} onChange={setPaidNow} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base" /></div>
        </div>
        {method === "Chuyển khoản" && (
          <div><label className="text-sm text-slate-500">Tài khoản ngân hàng</label>
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base">
              <option value="">— Không chọn —</option>
              {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></div>
        )}

        <div className="text-base text-right space-y-1 border-t border-slate-100 pt-3">
          <div className="font-semibold text-lg">Tổng cộng: {fmt(total)}</div>
        </div>

        <div><label className="text-sm text-slate-500">Ghi chú</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base" /></div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="button" disabled={saving} onClick={(e) => submit(e, true)}
            className="border border-slate-300 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu…" : "Lưu nháp"}
          </button>
          <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">{saving ? "Đang lưu…" : "Tạo đơn"}</button>
        </div>
      </form>
    </Modal>
  );
}

// Sửa đơn mua khi còn Nháp/Mới — không đổi NCC/kho, chỉ sửa dòng sản phẩm/giảm giá/phí ship/ghi chú.
function EditPurchaseModal({ purchase, products, stock, onProductCreated, onClose, onSaved }) {
  const [items, setItems] = useState(null);
  const [note, setNote] = useState(purchase.note || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    purchasesService.getPurchase(purchase.id).then((full) => {
      setItems(full.items.map((it) => ({ productId: it.product_id, variantId: it.variant_id || "", qty: it.qty, price: it.price })));
    }).catch((e) => setError(e.message));
  }, [purchase.id]);

  const subtotal = (items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const total = subtotal;

  function updateItem(idx, field, value) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: value };
      if (field === "productId") {
        const p = products.find((pp) => String(pp.id) === String(value));
        next.variantId = "";
        if (p && !p.has_variants) next.price = p.cost || 0;
      }
      if (field === "variantId") {
        const p = products.find((pp) => String(pp.id) === String(it.productId));
        const v = p?.variants?.find((vv) => String(vv.id) === String(value));
        if (v) next.price = v.cost || 0;
      }
      return next;
    }));
  }
  function addLine() { setItems((prev) => [...prev, { productId: "", variantId: "", qty: 1, price: 0 }]); }
  function removeLine(idx) { setItems((prev) => prev.filter((_, i) => i !== idx)); }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (items.some((it) => !it.productId || !it.qty)) return setError("Vui lòng chọn sản phẩm và số lượng cho mọi dòng");
    setSaving(true);
    try {
      await purchasesService.updatePurchase(purchase.id, {
        items: items.map((it) => ({ productId: it.productId, variantId: it.variantId || null, qty: Number(it.qty), price: Number(it.price) })),
        discount: 0, shippingFee: 0, note: note || null,
      });
      onSaved();
    } catch (e2) { setError(e2.message); } finally { setSaving(false); }
  }

  return (
    <Modal title={`Sửa đơn mua — ${purchase.code}`} onClose={onClose} size="xl">
      {items === null ? (
        <p className="text-sm text-slate-400 py-6 text-center">Đang tải…</p>
      ) : (
        <form onSubmit={submit} className="space-y-4 text-base">
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
          <div className="text-sm text-slate-500">
            Nhà cung cấp: <span className="font-medium text-slate-700">{purchase.supplier_name || "—"}</span> ·
            Kho: <span className="font-medium text-slate-700">{purchase.warehouse_name}</span>
            <span className="text-xs text-slate-400"> (không đổi được khi sửa)</span>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-500">Sản phẩm</label>
            {items.map((it, idx) => (
              <div key={idx} className="flex gap-2 items-center flex-wrap">
                <span className="text-xs text-slate-400 w-5 flex-none text-right">{idx + 1}</span>
                <ProductLinePicker products={products} stock={stock} warehouseId={purchase.warehouse_id}
                  productId={it.productId} variantId={it.variantId} onProductCreated={onProductCreated}
                  onChangeProduct={(v) => updateItem(idx, "productId", v)} onChangeVariant={(v) => updateItem(idx, "variantId", v)} />
                <input type="number" min="0" value={it.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)}
                  placeholder="SL" className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                <MoneyInput value={it.price} onChange={(v) => updateItem(idx, "price", v)}
                  placeholder="Giá nhập" className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                <span className="text-sm text-slate-600 font-medium w-28 text-right whitespace-nowrap">
                  {fmt((Number(it.qty) || 0) * (Number(it.price) || 0))}
                </span>
                {items.length > 1 && (
                  <button type="button" onClick={() => removeLine(idx)} className="text-red-500 text-xs">Xoá</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addLine} className="text-indigo-600 text-xs font-medium">+ Thêm dòng</button>
          </div>

          <div className="text-base text-right space-y-1 border-t border-slate-100 pt-3">
            <div className="font-semibold text-lg">Tổng cộng: {fmt(total)}</div>
            {purchase.status === "Mới" && <div className="text-xs text-slate-400">Đã trả trước đó giữ nguyên: {fmt(purchase.paid)}</div>}
          </div>

          <div><label className="text-xs text-slate-500">Ghi chú</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
            <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">{saving ? "Đang lưu…" : "Lưu thay đổi"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// Xác nhận đơn mua Nháp: nhập số tiền trả ngay (nếu có) rồi áp dụng tăng tồn kho + cập nhật giá vốn + tính VAT.
function ConfirmPurchaseModal({ purchase, bankAccounts, onClose, onSaved }) {
  const [paidNow, setPaidNow] = useState("");
  const [method, setMethod] = useState("Tiền mặt");
  const [bankAccountId, setBankAccountId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await purchasesService.confirmPurchase(purchase.id, {
        paidNow: Number(paidNow) || 0, method,
        bankAccountId: method === "Chuyển khoản" ? (bankAccountId || null) : null,
      });
      onSaved();
    } catch (e2) { setError(e2.message); } finally { setSaving(false); }
  }

  return (
    <Modal title={`Xác nhận đơn mua — ${purchase.code}`} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <p className="text-sm text-slate-500">Xác nhận sẽ tăng tồn kho theo các dòng đã lưu và cập nhật giá vốn. Tạm tính: <span className="font-semibold text-slate-700">{fmt(purchase.total)}</span>.</p>
        <div><label className="text-xs text-slate-500">Trả tiền ngay (tuỳ chọn)</label>
          <MoneyInput value={paidNow} onChange={setPaidNow} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Phương thức</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option>Tiền mặt</option><option>Chuyển khoản</option>
          </select></div>
        {method === "Chuyển khoản" && (
          <div><label className="text-xs text-slate-500">Tài khoản ngân hàng</label>
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">— Không chọn —</option>
              {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving} className="bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">{saving ? "Đang xử lý…" : "Xác nhận đơn"}</button>
        </div>
      </form>
    </Modal>
  );
}

// Xem chi tiết đơn mua (chỉ đọc) — hiện đủ dòng sản phẩm, tổng tiền, thanh toán.
function ViewPurchaseModal({ purchase, onClose }) {
  const [full, setFull] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    purchasesService.getPurchase(purchase.id).then(setFull).catch((e) => setError(e.message));
  }, [purchase.id]);

  const remaining = Number(purchase.total) - Number(purchase.paid);

  return (
    <Modal title={`Chi tiết đơn mua — ${purchase.code}`} onClose={onClose} size="xl">
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}
      {!full ? (
        <p className="text-sm text-slate-400 py-6 text-center">Đang tải…</p>
      ) : (
        <div className="space-y-4 text-base">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>Nhà cung cấp: <span className="font-medium text-slate-700">{full.supplier_name || "—"}</span></div>
            <div>Kho nhập: <span className="font-medium text-slate-700">{full.warehouse_name}</span></div>
            <div>Trạng thái: <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[full.status]}`}>{full.status}</span></div>
            <div>Ngày tạo: <span className="font-medium text-slate-700">{new Date(full.created_at).toLocaleString("vi-VN")}</span></div>
          </div>

          <div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-400 text-xs border-b border-slate-100">
                <th className="py-1.5 w-8">STT</th><th className="py-1.5">Sản phẩm</th><th className="py-1.5">ĐVT</th><th className="py-1.5 text-right">SL</th>
                <th className="py-1.5 text-right">Giá</th><th className="py-1.5 text-right">Thành tiền</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {full.items.map((it, idx) => (
                  <tr key={it.id}>
                    <td className="py-1.5 text-slate-400">{idx + 1}</td>
                    <td className="py-1.5">{it.product_name}{it.variant_attrs ? <span className="text-slate-400"> ({Object.values(it.variant_attrs).join(" / ")})</span> : ""}</td>
                    <td className="py-1.5 text-slate-500">{it.unit}</td>
                    <td className="py-1.5 text-right">{it.qty}</td>
                    <td className="py-1.5 text-right">{fmt(it.price)}</td>
                    <td className="py-1.5 text-right font-medium">{fmt(it.qty * it.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-base text-right space-y-1 border-t border-slate-100 pt-3">
            <div className="font-semibold text-lg">Tổng cộng: {fmt(full.total)}</div>
            <div className="text-sm text-emerald-600">Đã trả: {fmt(full.paid)}</div>
            {remaining > 0 && <div className="text-sm text-red-500">Còn lại: {fmt(remaining)}</div>}
          </div>

          {full.note && <div className="text-sm text-slate-500">Ghi chú: {full.note}</div>}

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Đóng</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PayPurchaseModal({ purchase, bankAccounts, onClose, onSaved }) {
  const remaining = Number(purchase.total) - Number(purchase.paid);
  const [amount, setAmount] = useState(remaining);
  const [method, setMethod] = useState("Tiền mặt");
  const [bankAccountId, setBankAccountId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return setError("Số tiền không hợp lệ");
    setSaving(true);
    try {
      await purchasesService.addPurchasePayment(purchase.id, {
        amount: Number(amount), method,
        bankAccountId: method === "Chuyển khoản" ? (bankAccountId || null) : null,
      });
      onSaved();
    } catch (e2) { setError(e2.message); } finally { setSaving(false); }
  }

  return (
    <Modal title={`Trả tiền — ${purchase.code}`} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="text-sm text-slate-500">Còn lại: <span className="font-semibold text-slate-800">{fmt(remaining)}</span></div>
        <div><label className="text-xs text-slate-500">Số tiền trả</label>
          <MoneyInput value={amount} onChange={setAmount} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-slate-500">Phương thức</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option>Tiền mặt</option><option>Chuyển khoản</option>
          </select></div>
        {method === "Chuyển khoản" && (
          <div><label className="text-xs text-slate-500">Tài khoản ngân hàng</label>
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">— Không chọn —</option>
              {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">{saving ? "Đang lưu…" : "Xác nhận"}</button>
        </div>
      </form>
    </Modal>
  );
}
