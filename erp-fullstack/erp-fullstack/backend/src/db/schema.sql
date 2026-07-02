-- ============================================================================
--  ERP nội thất công thái học — PostgreSQL schema
--  Yêu cầu: ID dùng UUID (gen_random_uuid) hoặc sequence, KHÔNG dùng array.length+1
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- cung cấp gen_random_uuid()

-- ---------- Vai trò & phân quyền (kiểm tra ở backend) ----------------------
CREATE TABLE IF NOT EXISTS roles (
  name        TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role        TEXT NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
  permission  TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

-- ---------- Người dùng (không hardcode ở frontend) -------------------------
CREATE TABLE IF NOT EXISTS warehouses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,           -- WH01...
  name        TEXT NOT NULL,
  address     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,                 -- bcrypt hash, KHÔNG bao giờ trả ra API
  role          TEXT NOT NULL REFERENCES roles(name),
  warehouse_id  UUID REFERENCES warehouses(id),
  phone         TEXT,
  email         TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Danh mục & sản phẩm & biến thể ---------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  contact       TEXT,
  phone         TEXT,
  email         TEXT,
  debt          NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  sku           TEXT,                          -- chỉ cho SP không biến thể
  category_id   UUID REFERENCES categories(id),
  supplier_id   UUID REFERENCES suppliers(id),
  has_variants  BOOLEAN NOT NULL DEFAULT false,
  price         NUMERIC(14,2) NOT NULL DEFAULT 0,  -- giá đại diện (min của biến thể)
  cost          NUMERIC(14,2) NOT NULL DEFAULT 0,
  image         TEXT,
  options       JSONB NOT NULL DEFAULT '[]',   -- [{name, values[]}]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku           TEXT,
  attrs         JSONB NOT NULL DEFAULT '{}',   -- {"Màu":"Đen","Size":"B"}
  price         NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost          NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- ---------- Tồn kho theo (product, variant, warehouse) ---------------------
CREATE TABLE IF NOT EXISTS warehouse_stock (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id    UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id  UUID NOT NULL REFERENCES warehouses(id),
  qty           INTEGER NOT NULL DEFAULT 0
);
-- variant_id có thể NULL (SP không biến thể) → unique theo COALESCE
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock
  ON warehouse_stock (product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), warehouse_id);

-- ---------- Stock movement (audit trail mọi biến động tồn) -----------------
CREATE TABLE IF NOT EXISTS stock_movements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id),
  variant_id    UUID REFERENCES product_variants(id),
  warehouse_id  UUID NOT NULL REFERENCES warehouses(id),
  qty_change    INTEGER NOT NULL,              -- âm = xuất, dương = nhập
  type          TEXT NOT NULL,                 -- sale, return, inbound, adjust, transfer_in, transfer_out
  ref_type      TEXT,                          -- order, grn, adjustment, transfer
  ref_id        UUID,
  reason        TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Khách hàng -----------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_groups (
  name        TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  group_name    TEXT REFERENCES customer_groups(name),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Đơn hàng -------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS order_seq START 1;       -- mã đơn ORD-000001
CREATE SEQUENCE IF NOT EXISTS tx_seq START 1;          -- mã phiếu thu/chi

CREATE TABLE IF NOT EXISTS orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT UNIQUE NOT NULL,
  customer_id        UUID REFERENCES customers(id),
  warehouse_id       UUID NOT NULL REFERENCES warehouses(id),
  status             TEXT NOT NULL DEFAULT 'Chờ xác nhận',
  subtotal           NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  shipping           NUMERIC(14,2) NOT NULL DEFAULT 0,   -- phí thu khách (nếu có)
  ship_cost          NUMERIC(14,2) NOT NULL DEFAULT 0,   -- phí trả ĐVVC (chi phí)
  ship_cost_voucher  UUID,                                -- FK -> transactions (thêm ở cuối file)
  requires_vat       BOOLEAN NOT NULL DEFAULT false,
  vat_rate           INTEGER NOT NULL DEFAULT 0,
  vat_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_invoice_status TEXT,
  vat_invoice_no     TEXT,
  total              NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid               NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment            TEXT,
  note               TEXT,
  delivery_method    TEXT NOT NULL DEFAULT 'carrier',    -- carrier | self
  carrier            TEXT,
  delivery_staff_id  UUID REFERENCES users(id),
  tracking_no        TEXT,
  delivery_status    TEXT NOT NULL DEFAULT 'Chưa giao',
  is_cod             BOOLEAN NOT NULL DEFAULT false,
  cod_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
  stock_applied      BOOLEAN NOT NULL DEFAULT false,     -- đã trừ tồn chưa (idempotent)
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id),
  variant_id    UUID REFERENCES product_variants(id),
  name          TEXT NOT NULL,                  -- snapshot tên (gồm biến thể)
  qty           INTEGER NOT NULL,
  price_at_sale NUMERIC(14,2) NOT NULL,          -- giá bán tại thời điểm bán
  cost_at_sale  NUMERIC(14,2) NOT NULL           -- giá vốn tại thời điểm bán
);

-- ---------- Sổ quỹ (Thu / chi) + tài khoản ngân hàng -----------------------
-- Số dư tài khoản ngân hàng KHÔNG lưu cố định — luôn tính trực tiếp lúc truy vấn
-- = opening_balance + SUM(Thu) - SUM(Chi) của các transactions gắn bank_account_id này.
-- Nhờ vậy mọi nghiệp vụ phát sinh tiền (thanh toán đơn hàng, thu/trả nợ...) chỉ cần
-- gắn đúng bank_account_id vào dòng transactions là số dư tự "đồng bộ", không cần job riêng.
CREATE TABLE IF NOT EXISTS bank_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,                -- tên gợi nhớ, VD: "Vietcombank chính"
  bank_name       TEXT,
  account_number  TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,
  type          TEXT NOT NULL,                  -- Thu | Chi
  category      TEXT,
  amount        NUMERIC(14,2) NOT NULL,
  date          DATE NOT NULL DEFAULT now(),
  method        TEXT,
  bank_account_id UUID REFERENCES bank_accounts(id),  -- chỉ set khi method = 'Ngân hàng'
  party_type    TEXT,                           -- Khách hàng | Nhà cung cấp | Khác
  party_id      UUID,
  party_name    TEXT,
  ref_type      TEXT,                           -- order | supplier | ...
  ref_id        UUID,
  note          TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Cột thêm sau cho transactions đã tồn tại từ trước khi có tính năng sổ quỹ ngân hàng.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);
CREATE INDEX IF NOT EXISTS idx_tx_bank_account ON transactions(bank_account_id);

-- FK trễ cho ship_cost_voucher (transactions tạo sau orders trong file này)
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_ship_cost_voucher_fkey;
ALTER TABLE orders
  ADD CONSTRAINT orders_ship_cost_voucher_fkey
  FOREIGN KEY (ship_cost_voucher) REFERENCES transactions(id);

-- Liên kết phiếu nhập hàng với nhà cung cấp (để tính công nợ NCC)
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);

-- Danh sách đơn vị vận chuyển (để chọn khi tạo đơn + đối chiếu COD)
CREATE TABLE IF NOT EXISTS carriers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Đã đối chiếu COD với đơn vị vận chuyển hay chưa
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_reconciled BOOLEAN NOT NULL DEFAULT false;

-- Số phiếu nhập/điều chỉnh/luân chuyển (mỗi lần submit form = 1 phiếu, gồm nhiều dòng sản phẩm)
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS doc_no TEXT;
CREATE SEQUENCE IF NOT EXISTS inbound_seq START 1;
CREATE SEQUENCE IF NOT EXISTS adjust_seq START 1;
CREATE SEQUENCE IF NOT EXISTS transfer_seq START 1;
CREATE SEQUENCE IF NOT EXISTS saleout_seq START 1; -- số phiếu xuất hàng (xuất bán theo đơn)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sale_doc_no TEXT;

-- Backfill số phiếu xuất cho các đơn đã trừ tồn từ trước (chưa có sale_doc_no)
WITH numbered AS (
  SELECT id, 'PXH-' || LPAD(nextval('saleout_seq')::text, 6, '0') AS doc_no
    FROM orders WHERE stock_applied = true AND sale_doc_no IS NULL
   ORDER BY created_at
)
UPDATE orders o SET sale_doc_no = numbered.doc_no FROM numbered WHERE o.id = numbered.id;

UPDATE stock_movements sm SET doc_no = o.sale_doc_no
  FROM orders o
 WHERE sm.ref_type = 'order' AND sm.ref_id = o.id AND sm.type = 'sale' AND sm.doc_no IS NULL AND o.sale_doc_no IS NOT NULL;

-- Ẩn sản phẩm (soft-delete) thay vì xoá cứng khi đã có lịch sử nhập/xuất/đơn hàng
ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- Đơn đặt hàng khi tạo lúc không đủ tồn (vẫn tạo được, chỉ chặn khi thực sự xuất hàng)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_preorder BOOLEAN NOT NULL DEFAULT false;
-- Lý do huỷ/trả hàng
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Hạn thanh toán (số ngày) để tính tuổi nợ/quá hạn cho từng khách hàng
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_term_days INTEGER NOT NULL DEFAULT 30;

-- Mã khách hàng tự sinh (KH-000001...)
CREATE SEQUENCE IF NOT EXISTS customer_seq START 1;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS code TEXT;
UPDATE customers SET code = 'KH-' || LPAD(nextval('customer_seq')::text, 6, '0') WHERE code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_code ON customers(code);

-- Mã sản phẩm ngắn, dễ đọc (SP-000001...) thay cho UUID khi hiển thị/xuất-nhập CSV
CREATE SEQUENCE IF NOT EXISTS product_seq START 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS code TEXT;
UPDATE products SET code = 'SP-' || LPAD(nextval('product_seq')::text, 6, '0') WHERE code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_code ON products(code);

-- Nguồn đơn hàng (Hotline, Facebook, Tự gọi điện...) — danh sách tự quản lý, có sẵn 3 nguồn mặc định
CREATE TABLE IF NOT EXISTS order_sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO order_sources(name) VALUES ('Hotline'), ('Facebook'), ('Tự gọi điện') ON CONFLICT DO NOTHING;

-- Shop bán hàng TMĐT (Shopee, Lazada, TikTok Shop...) — số lượng tự thêm/xoá, không cố định
CREATE TABLE IF NOT EXISTS shops (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO shops(name) VALUES ('Shop 1'), ('Shop 2'), ('Shop 3') ON CONFLICT DO NOTHING;

-- Đơn hàng: nguồn đơn + đơn TMĐT (shop bán hàng + mã đơn từ sàn, khách hàng có thể để trống)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_ecommerce BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_order_code TEXT;

-- Phiếu vận chuyển: TỰ ĐỘNG tạo 1 phiếu cho MỖI đơn hàng khi tạo đơn, để theo dõi tách biệt
-- (số phiếu VC, ĐVVC, mã vận đơn, tiền COD...) nhưng vẫn liên kết 1-1 với đơn qua order_id.
CREATE SEQUENCE IF NOT EXISTS shipment_seq START 1;
CREATE TABLE IF NOT EXISTS shipments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no          TEXT UNIQUE NOT NULL,
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier         TEXT,
  tracking_no     TEXT,
  cod_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  cod_reconciled  BOOLEAN NOT NULL DEFAULT false,
  delivery_status TEXT NOT NULL DEFAULT 'Chưa giao',
  ship_cost       NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS ship_cost_paid BOOLEAN NOT NULL DEFAULT false;

-- Backfill: tạo phiếu vận chuyển cho các đơn đã có từ trước (giữ nguyên dữ liệu carrier/COD cũ trên orders)
INSERT INTO shipments (doc_no, order_id, carrier, tracking_no, cod_amount, cod_reconciled, delivery_status, ship_cost)
SELECT 'VC-' || LPAD(nextval('shipment_seq')::text, 6, '0'), o.id, o.carrier, o.tracking_no, o.cod_amount, o.cod_reconciled, o.delivery_status, o.ship_cost
  FROM orders o
 WHERE NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id);

-- Cài đặt chung của hệ thống (key-value đơn giản) — dùng cho logo công ty (lưu base64) v.v.
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT
);

-- Phân quyền chi tiết theo module (Xem/Sửa/Xoá): chuyển các quyền cũ dạng "products"/"orders_edit"...
-- sang dạng mới "<module>_view/_edit/_delete" để KHÔNG mất quyền của role đã cấu hình trước đó.
DO $$
DECLARE
  -- (old_permission, new_permission) — quyền cũ dạng coarse => tương đương đầy đủ ở quyền mới
  mapping TEXT[][] := ARRAY[
    ARRAY['products','products_view'], ARRAY['products','products_edit'], ARRAY['products','products_delete'],
    ARRAY['orders','orders_view'],
    ARRAY['orders_edit','orders_edit'], ARRAY['orders_edit','orders_delete'],
    ARRAY['crm','crm_view'], ARRAY['crm','crm_edit'], ARRAY['crm','crm_delete'],
    ARRAY['suppliers','suppliers_view'], ARRAY['suppliers','suppliers_edit'], ARRAY['suppliers','suppliers_delete'],
    ARRAY['warehouse','warehouse_view'], ARRAY['warehouse','warehouse_edit'],
    ARRAY['finance','finance_view'], ARRAY['finance','finance_edit'], ARRAY['finance','finance_delete'],
    ARRAY['vatinvoice','vatinvoice_view'], ARRAY['vatinvoice','vatinvoice_edit'],
    ARRAY['shipping','shipping_view'], ARRAY['shipping','shipping_edit'], ARRAY['shipping','shipping_delete'],
    ARRAY['employees','employees_view'], ARRAY['employees','employees_edit'], ARRAY['employees','employees_delete'],
    -- Trước đây tab Cài đặt dùng tạm quyền "orders" hoặc "employees" để ẩn/hiện — giữ tương đương.
    ARRAY['orders','settings_view'], ARRAY['orders','settings_edit'],
    ARRAY['employees','settings_view'], ARRAY['employees','settings_edit']
  ];
  m TEXT[];
BEGIN
  FOREACH m SLICE 1 IN ARRAY mapping LOOP
    INSERT INTO role_permissions(role, permission)
      SELECT role, m[2] FROM role_permissions WHERE permission = m[1]
      ON CONFLICT DO NOTHING;
  END LOOP;
  DELETE FROM role_permissions WHERE permission IN ('products','orders','crm','suppliers','warehouse','finance','vatinvoice','shipping','employees');
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_movements_ref ON stock_movements(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_tx_ref ON transactions(ref_type, ref_id);

-- ---------- Bảo hành: mỗi sản phẩm có 1 nội dung bảo hành + 1 thời hạn (tháng) ----------
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_content TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_months INTEGER NOT NULL DEFAULT 0;
-- Cột cũ (dạng nhiều bộ phận) không dùng nữa — gỡ bỏ nếu còn tồn tại từ lần triển khai trước.
ALTER TABLE products DROP COLUMN IF EXISTS warranty_parts;

CREATE SEQUENCE IF NOT EXISTS warranty_seq START 1;
CREATE TABLE IF NOT EXISTS warranties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no          TEXT UNIQUE NOT NULL,
  order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_item_id   UUID REFERENCES order_items(id) ON DELETE SET NULL,
  product_id      UUID REFERENCES products(id),
  variant_id      UUID REFERENCES product_variants(id),
  product_name    TEXT NOT NULL,           -- snapshot tên SP (gồm biến thể) tại thời điểm bán
  customer_id     UUID REFERENCES customers(id),
  customer_name   TEXT,                    -- snapshot, đề phòng khách lẻ không có customer_id
  customer_phone  TEXT,
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  parts           JSONB NOT NULL DEFAULT '[]',  -- [{name, months, expiresAt}]
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warranties_order ON warranties(order_id);
CREATE INDEX IF NOT EXISTS idx_warranties_customer ON warranties(customer_id);
CREATE INDEX IF NOT EXISTS idx_warranties_phone ON warranties(customer_phone);

-- Cấp quyền Bảo hành (module mới) cho Admin để không bị khoá ngoài ngay sau khi triển khai.
INSERT INTO role_permissions(role, permission)
  SELECT 'Admin', p FROM (VALUES ('warranty_view'), ('warranty_edit')) AS t(p)
  WHERE EXISTS (SELECT 1 FROM roles WHERE name = 'Admin')
  ON CONFLICT DO NOTHING;

-- ---------- Index cho các cột tra cứu/lọc nhiều (SĐT khách, SKU, lọc theo ngày/khách hàng) ----------
-- Chưa cần thiết ở quy mô dữ liệu hiện tại, nhưng thêm sẵn để tốc độ tra cứu/báo cáo không chậm dần
-- khi dữ liệu lớn lên (nhập thêm lịch sử Haravan, bán hàng thực tế).
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_warehouse ON orders(warehouse_id);

-- Chặn nhập trùng đơn Haravan (import lại cùng file/khoảng ngày export chồng lấn) — chỉ áp dụng
-- cho đơn có external_order_code (đơn tạo tay trong ERP có giá trị NULL nên không bị ảnh hưởng).
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_order_code) WHERE external_order_code IS NOT NULL;
