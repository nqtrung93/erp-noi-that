# ERP Nội Thất Công Thái Học — Full-stack (Express + PostgreSQL + React)

Tách **backend** (Node.js/Express + PostgreSQL) và **frontend** (React/Vite). Đây là bộ khung production: auth bcrypt+JWT, phân quyền kiểm ở backend, kiểm tồn theo kho/biến thể, stock movement, snapshot giá bán/giá vốn, hoá đơn chống XSS, ID dùng UUID/sequence, và API CRUD đầy đủ.

## Cấu trúc

```
erp-fullstack/
├── backend/
│   ├── src/
│   │   ├── server.js, app.js           # entry + express app
│   │   ├── config/db.js                # pool PostgreSQL + withTransaction
│   │   ├── db/schema.sql               # DDL (UUID, sequence, stock, movements)
│   │   ├── db/seed.js                  # seed roles/quyền/kho + admin (bcrypt)
│   │   ├── middleware/auth.js          # verifyToken (JWT) + requirePerm (RBAC)
│   │   ├── utils/escapeHtml.js         # chống XSS hoá đơn
│   │   ├── services/                   # auth, stock, order, report, invoice
│   │   ├── controllers/                # auth, product, order, crud.factory
│   │   └── routes/index.js             # mount toàn bộ API + gắn quyền
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── api/client.js               # fetch + JWT (KHÔNG hardcode creds)
    │   ├── services/                   # auth, products, orders, customers...
    │   ├── store/auth.store.js         # currentUser + permissions từ backend
    │   ├── utils/                      # format, escapeHtml
    │   ├── components/                 # Modal, Badge, StatCard
    │   ├── pages/                      # LoginPage, OrdersPage (mẫu)
    │   └── App.jsx, main.jsx
    ├── .env.example
    └── package.json
```

## Chạy thử

### 1) Backend
```bash
cd backend
cp .env.example .env          # sửa DATABASE_URL, JWT_SECRET, SEED_ADMIN_PASSWORD
npm install
npm run db:schema             # tạo bảng
npm run db:seed               # tạo roles/quyền/kho + tài khoản admin
npm run dev                   # http://localhost:4000
```

### 2) Frontend
```bash
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev                   # http://localhost:5173
```
Đăng nhập bằng tài khoản admin đã seed (username/mật khẩu lấy từ `backend/.env`).

## 15 yêu cầu được đáp ứng ở đâu

| # | Yêu cầu | Vị trí |
|---|---------|--------|
| 1 | Tách FE/BE | thư mục `backend/` và `frontend/` |
| 2 | Node.js/Express | `backend/src/app.js`, `server.js` |
| 3 | PostgreSQL | `backend/src/db/schema.sql`, `config/db.js` |
| 4 | Không hardcode user/pw ở FE | `frontend/src/api/client.js` (chỉ JWT), `pages/LoginPage.jsx` |
| 5 | bcrypt + JWT | `services/auth.service.js`, `db/seed.js` |
| 6 | Phân quyền ở backend | `middleware/auth.js` (`requirePerm`) gắn trong `routes/index.js` |
| 7 | Kiểm tồn theo warehouse+product+variant | `services/stock.service.js` (`assertEnoughStock`), gọi trong `order.service.js` |
| 8 | Xác nhận/hoàn thành → movement + trừ tồn | `services/order.service.js` (`setOrderStatus`) |
| 9 | Huỷ/hoàn → movement ngược | `services/order.service.js` (nhánh "Đã huỷ") |
| 10 | Lưu priceAtSale + costAtSale | bảng `order_items`, hàm `snapshotItem` |
| 11 | Báo cáo lợi nhuận dùng costAtSale | `services/report.service.js` (`profitReport`) |
| 12 | Hoá đơn escape HTML | `utils/escapeHtml.js` + `services/invoice.service.js` |
| 13 | ID dùng UUID/sequence | `schema.sql` (`gen_random_uuid`, `order_seq`, `tx_seq`) |
| 14 | Tách nhiều file | components / pages / services / store / utils |
| 15 | CRUD API các thực thể | `routes/index.js` + `controllers/` + `crud.factory.js` |

## Ghi chú chuyển đổi từ bản single-file cũ

Bản demo cũ (`erp-ergonomic.jsx`) giữ toàn bộ state trong bộ nhớ trình duyệt. Ở bản này:
- **State → API**: mỗi module gọi service tương ứng thay vì `useState` dữ liệu gốc.
- **Quy ước nghiệp vụ giữ nguyên**: giá đã gồm VAT (tách ngược 8%); `shipping` là phí thu khách, phí trả ĐVVC tách thành phiếu chi; công nợ KH = Σ(total − paid); đồng bộ "Đã giao" ↔ "Hoàn thành".
- **Còn lại để port**: các trang Dashboard, Products (builder biến thể), CRM, Warehouse (nhập/kiểm/điều chỉnh/luân chuyển), Shipping, VatInvoices, Reports, Employees — làm theo đúng mẫu `pages/OrdersPage.jsx` (gọi service + dùng `useAuth().can()` để ẩn/hiện theo quyền).

## Bảo mật cần làm thêm khi lên production
- HTTPS, đặt `JWT_SECRET` mạnh, bật rate-limit cho `/auth/login`.
- Validate input kỹ hơn (zod/express-validator).
- Phân trang cho các API list.
- Soft-delete thay vì xoá cứng nếu cần lịch sử.
