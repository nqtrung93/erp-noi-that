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

-- ---------- Thu / chi ------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,
  type          TEXT NOT NULL,                  -- Thu | Chi
  category      TEXT,
  amount        NUMERIC(14,2) NOT NULL,
  date          DATE NOT NULL DEFAULT now(),
  method        TEXT,
  party_type    TEXT,                           -- Khách hàng | Nhà cung cấp | Khác
  party_id      UUID,
  party_name    TEXT,
  ref_type      TEXT,                           -- order | supplier | ...
  ref_id        UUID,
  note          TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK trễ cho ship_cost_voucher (transactions tạo sau orders trong file này)
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_ship_cost_voucher_fkey;
ALTER TABLE orders
  ADD CONSTRAINT orders_ship_cost_voucher_fkey
  FOREIGN KEY (ship_cost_voucher) REFERENCES transactions(id);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_movements_ref ON stock_movements(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_tx_ref ON transactions(ref_type, ref_id);
