import { useEffect, useState } from "react";
import { useAuth } from "../store/auth.store.jsx";
import * as partnersService from "../services/partners.service.js";
import * as ordersService from "../services/orders.service.js";
import * as purchasesService from "../services/purchases.service.js";
import { fmt } from "../utils/format.js";
import Modal from "../components/Modal.jsx";
import Toolbar, { ToolbarButton } from "../components/Toolbar.jsx";
import MoneyInput from "../components/MoneyInput.jsx";
import { readCsvFile } from "../utils/importCsv.js";

const TYPE_LABEL = { customer: "Khách hàng", supplier: "Nhà cung cấp", other: "Khác" };
const DOC_STATUS_COLOR = {
  "Nháp": "bg-slate-100 text-slate-600",
  "Mới": "bg-amber-100 text-amber-700",
  "Hoàn thành": "bg-emerald-100 text-emerald-700",
  "Đã hủy": "bg-red-100 text-red-700",
};

export default function PartnersPage() {
  const { can } = useAuth();
  const [partners, setPartners] = useState([]);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [debtTarget, setDebtTarget] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  async function reload() {
    try { setPartners(await partnersService.listPartners()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);

  const filtered = partners
    .filter((p) => !typeFilter || p.type === typeFilter)
    .filter((p) => !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.phone || "").includes(search) ||
      p.code.toLowerCase().includes(search.toLowerCase()));
  const totalDebt = filtered.reduce((s, p) => s + Number(p.debt), 0);

  async function remove(id) {
    if (!confirm("Xoá đối tượng này?")) return;
    try { await partnersService.removePartner(id); reload(); }
    catch (e) { setError(e.message); }
  }

  // Nhập CSV công nợ đầu kỳ: cột Mã, Tên, Loại (KH/NCC), Công nợ. SET công nợ tuyệt đối,
  // upsert theo Mã — chạy lại nhiều lần không bị trùng.
  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportResult(null); setError("");
    try {
      const rows = await readCsvFile(file);
      const payload = rows.map((r) => ({
        code: r["Mã"], name: r["Tên"],
        type: (r["Loại"] || "").trim().toUpperCase() === "NCC" ? "supplier" : "customer",
        debt: r["Công nợ"],
      }));
      const result = await partnersService.importDebt(payload);
      setImportResult(result);
      reload();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  function downloadSampleCsv() {
    const csv = "Mã,Tên,Loại,Công nợ\n"
      + "KH-DAOLC,Chị Đào - Nội thất Anh Đào,KH,176697130\n"
      + "NCC-HOAPHAT,Công ty cổ phần nội thất Hòa Phát,NCC,388470042\n";
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mau_nhap_cong_no.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <Toolbar
        title="Công nợ khách hàng / nhà cung cấp"
        filters={
          <>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, SĐT hoặc mã…"
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm min-w-[220px]" />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
              <option value="">— Tất cả —</option>
              <option value="customer">Khách hàng</option>
              <option value="supplier">Nhà cung cấp</option>
              <option value="other">Khác</option>
            </select>
          </>
        }
        actions={can("partners_edit") && (
          <>
            <ToolbarButton variant="primary" onClick={() => setCreating(true)}>+ Thêm đối tượng</ToolbarButton>
            <ToolbarButton onClick={downloadSampleCsv}>Tải mẫu CSV</ToolbarButton>
            <label className="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 cursor-pointer hover:bg-slate-50">
              {importing ? "Đang nhập…" : "Nhập CSV công nợ"}
              <input type="file" accept=".csv" onChange={handleImportFile} disabled={importing} className="hidden" />
            </label>
          </>
        )}
      />
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
      {importResult && (
        <div className={`text-sm rounded-lg px-3 py-2 space-y-1 ${importResult.failed.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
          <div>Đã tạo {importResult.created} mới, cập nhật {importResult.updated} đối tượng. {importResult.failed.length > 0 ? `${importResult.failed.length} lỗi:` : ""}</div>
          {importResult.failed.map((f, i) => <div key={i} className="text-xs">{f}</div>)}
        </div>
      )}

      <div className="bg-white rounded-xl px-4 py-2 shadow-sm border border-slate-100 text-sm inline-block">
        Tổng công nợ: <span className="font-bold text-slate-800">{fmt(totalDebt)}</span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs">
              <th className="py-2 px-3">Mã</th>
              <th className="py-2 px-3">Tên</th>
              <th className="py-2 px-3">Loại</th>
              <th className="py-2 px-3">Điện thoại</th>
              <th className="py-2 px-3 text-right">Công nợ</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((p) => (
              <tr key={p.id}>
                <td className="py-2 px-3 font-medium whitespace-nowrap">{p.code}</td>
                <td className="py-2 px-3">
                  <button onClick={() => setViewing(p)} className="text-indigo-600 hover:underline font-medium">{p.name}</button>
                </td>
                <td className="py-2 px-3 text-slate-500">{TYPE_LABEL[p.type]}</td>
                <td className="py-2 px-3 text-slate-500">{p.phone || "—"}</td>
                <td className="py-2 px-3 text-right font-medium">{fmt(p.debt)}</td>
                <td className="py-2 px-3 flex gap-2 justify-end">
                  <button onClick={() => setViewing(p)} className="text-slate-600 text-xs hover:underline">Xem</button>
                  {can("partners_edit") && (
                    <button onClick={() => setDebtTarget(p)} className="text-indigo-600 text-xs hover:underline">Ghi/thu nợ</button>
                  )}
                  {can("partners_delete") && (
                    <button onClick={() => remove(p.id)} className="text-red-500 text-xs hover:underline">Xoá</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-slate-400 text-sm p-4">Chưa có đối tượng nào.</p>}
      </div>

      {creating && <CreatePartnerModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {debtTarget && <DebtModal partner={debtTarget} onClose={() => setDebtTarget(null)} onSaved={() => { setDebtTarget(null); reload(); }} />}
      {viewing && <PartnerDetailModal partner={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

// Chi tiết đối tác (chỉ đọc): thông tin + lịch sử đơn (mua nếu là NCC, bán nếu là KH) + lịch sử công nợ.
function PartnerDetailModal({ partner, onClose }) {
  const isSupplier = partner.type === "supplier";
  const [tab, setTab] = useState("docs");
  const [docs, setDocs] = useState(null);
  const [debtEntries, setDebtEntries] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchDocs = isSupplier ? purchasesService.listPurchases() : ordersService.listOrders();
    fetchDocs
      .then((all) => setDocs(all.filter((o) => String(isSupplier ? o.supplier_id : o.customer_id) === String(partner.id))))
      .catch((e) => setError(e.message));
    partnersService.debtHistory(partner.id).then(setDebtEntries).catch((e) => setError(e.message));
  }, [partner.id, isSupplier]);

  const totalDocs = (docs || []).length;
  const totalValue = (docs || []).reduce((s, o) => s + Number(o.total), 0);

  return (
    <Modal title={`${TYPE_LABEL[partner.type]} — ${partner.name}`} onClose={onClose} size="xl">
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><span className="text-slate-400">Mã</span><div className="font-medium">{partner.code}</div></div>
          <div><span className="text-slate-400">Điện thoại</span><div className="font-medium">{partner.phone || "—"}</div></div>
          <div><span className="text-slate-400">Địa chỉ</span><div className="font-medium">{partner.address || "—"}</div></div>
          <div><span className="text-slate-400">Công nợ hiện tại</span><div className="font-semibold text-red-500">{fmt(partner.debt)}</div></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl px-4 py-2 text-sm">Số đơn {isSupplier ? "đã mua" : "đã bán"}: <span className="font-semibold">{totalDocs}</span></div>
          <div className="bg-slate-50 rounded-xl px-4 py-2 text-sm">Tổng giá trị: <span className="font-semibold">{fmt(totalValue)}</span></div>
        </div>

        <div className="flex gap-1 border-b border-slate-100">
          {[["docs", isSupplier ? "Lịch sử mua hàng" : "Lịch sử bán hàng"], ["debt", "Lịch sử công nợ"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 py-1.5 text-sm font-medium ${tab === id ? "text-indigo-600 border-b-2 border-indigo-600" : "text-slate-400"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "docs" && (
          docs === null ? <p className="text-sm text-slate-400 py-6 text-center">Đang tải…</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-400 text-xs border-b border-slate-100">
                <th className="py-1.5">Mã đơn</th><th className="py-1.5 text-right">Tổng tiền</th>
                <th className="py-1.5 text-right">{isSupplier ? "Đã trả" : "Đã thu"}</th><th className="py-1.5">Trạng thái</th><th className="py-1.5">Ngày</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {docs.map((o) => (
                  <tr key={o.id}>
                    <td className="py-1.5 font-medium">{o.code}</td>
                    <td className="py-1.5 text-right">{fmt(o.total)}</td>
                    <td className="py-1.5 text-right text-emerald-600">{fmt(o.paid)}</td>
                    <td className="py-1.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DOC_STATUS_COLOR[o.status]}`}>{o.status}</span></td>
                    <td className="py-1.5 text-slate-400 whitespace-nowrap">{new Date(o.created_at).toLocaleDateString("vi-VN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
        {tab === "docs" && docs?.length === 0 && <p className="text-slate-400 text-sm py-4 text-center">Chưa có đơn nào.</p>}

        {tab === "debt" && (
          debtEntries === null ? <p className="text-sm text-slate-400 py-6 text-center">Đang tải…</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-400 text-xs border-b border-slate-100">
                <th className="py-1.5">Mã phiếu</th><th className="py-1.5">Loại</th>
                <th className="py-1.5 text-right">Số tiền</th><th className="py-1.5">Ghi chú</th><th className="py-1.5">Ngày</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {debtEntries.map((d) => (
                  <tr key={d.id}>
                    <td className="py-1.5 font-medium">{d.code}</td>
                    <td className="py-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.direction === "increase" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {d.direction === "increase" ? "Ghi tăng nợ" : "Giảm nợ"}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">{fmt(d.amount)}</td>
                    <td className="py-1.5 text-slate-500">{d.note || "—"}</td>
                    <td className="py-1.5 text-slate-400 whitespace-nowrap">{new Date(d.created_at).toLocaleDateString("vi-VN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
        {tab === "debt" && debtEntries?.length === 0 && <p className="text-slate-400 text-sm py-4 text-center">Chưa có biến động công nợ.</p>}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Đóng</button>
        </div>
      </div>
    </Modal>
  );
}

function CreatePartnerModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("customer");
  const [phone, setPhone] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!name) return setError("Thiếu tên");
    setSaving(true);
    try {
      await partnersService.createPartner({ name, type, phone: phone || null, contact: contact || null, address: address || null });
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Thêm đối tượng công nợ" onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="text-xs text-slate-500">Tên</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Loại</label>
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="customer">Khách hàng</option>
            <option value="supplier">Nhà cung cấp</option>
            <option value="other">Khác</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Điện thoại</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Người liên hệ</label>
          <input value={contact} onChange={(e) => setContact(e.target.value)}
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
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu…" : "Thêm"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// direction=increase: ghi nợ thuần (không tiền mặt). direction=decrease: thu/trả nợ (tạo kèm phiếu Thu/Chi).
function DebtModal({ partner, onClose, onSaved }) {
  const [direction, setDirection] = useState("decrease");
  const [amount, setAmount] = useState(Number(partner.debt) > 0 ? String(partner.debt) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const decreaseLabel = partner.type === "supplier" ? "Trả nợ (tạo phiếu Chi)" : "Thu nợ (tạo phiếu Thu)";

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!amount || Number(amount) <= 0) return setError("Số tiền không hợp lệ");
    setSaving(true);
    try {
      await partnersService.adjustDebt(partner.id, { amount: Number(amount), direction, note: note || null });
      onSaved();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Ghi/thu nợ — ${partner.name}`} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="text-sm text-slate-500">Công nợ hiện tại: <span className="font-semibold text-slate-800">{fmt(partner.debt)}</span></div>
        <div>
          <label className="text-xs text-slate-500">Loại điều chỉnh</label>
          <select value={direction} onChange={(e) => setDirection(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="increase">Ghi tăng nợ (không có dòng tiền)</option>
            <option value="decrease">{decreaseLabel}</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Số tiền</label>
          <MoneyInput value={amount} onChange={setAmount}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Ghi chú</label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
          <button type="submit" disabled={saving}
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50">
            {saving ? "Đang lưu…" : "Xác nhận"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
