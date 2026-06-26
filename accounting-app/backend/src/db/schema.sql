-- Schema cho phần mềm kế toán nội bộ (dùng nội bộ thuần, không theo chuẩn kế toán/double-entry).
-- Mục tiêu: sổ quỹ thu/chi, công nợ khách hàng & nhà cung cấp, danh mục chi phí/thu nhập, báo cáo lãi/lỗ đơn giản.

CREATE TABLE IF NOT EXISTS roles (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL REFERENCES roles(name),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Đối tượng công nợ: khách hàng, nhà cung cấp, hoặc khác.
CREATE TABLE IF NOT EXISTS partners (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('customer', 'supplier', 'other')),
  phone TEXT,
  contact TEXT,
  address TEXT,
  -- Công nợ hiện tại: với customer = số tiền KH còn nợ mình; với supplier = số tiền mình còn nợ họ.
  debt NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Danh mục thu/chi (vd: Lương, Mặt bằng, Nguyên vật liệu, Bán hàng, Thu khác...)
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Thu', 'Chi')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, type)
);

-- Sổ quỹ: mọi phiếu thu/chi tiền mặt thực tế (không bao gồm ghi nợ thuần không có dòng tiền).
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('Thu', 'Chi')),
  category_id INTEGER REFERENCES categories(id),
  category_name TEXT, -- lưu kèm tên lúc tạo để không vỡ báo cáo cũ khi danh mục đổi tên/xoá
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT, -- Tiền mặt / Chuyển khoản / Thẻ...
  partner_id INTEGER REFERENCES partners(id),
  partner_name TEXT,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ghi nợ thuần không kèm dòng tiền (vd: bán hàng cho KH ghi nợ, nhập hàng từ NCC ghi nợ).
-- Khác với transactions (luôn có dòng tiền thực tế thu/chi).
CREATE TABLE IF NOT EXISTS debt_entries (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  direction TEXT NOT NULL CHECK (direction IN ('increase', 'decrease')), -- tăng/giảm nợ
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ============== Tài khoản ngân hàng ==============
CREATE TABLE IF NOT EXISTS bank_accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL, -- tên gợi nhớ, vd "TK chính Vietcombank"
  bank_name TEXT,
  account_number TEXT,
  opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bank_account_id INTEGER REFERENCES bank_accounts(id);

-- ============== Kho hàng: Nhập - Xuất - Tồn ==============
CREATE TABLE IF NOT EXISTS warehouses (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS warehouse_seq START 10; -- bắt đầu từ 10 để tránh trùng mã KHO01 seed sẵn

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'cái', -- đơn vị tính
  cost NUMERIC(18,2) NOT NULL DEFAULT 0, -- giá vốn (SP không biến thể; SP có biến thể thì giá đại diện)
  price NUMERIC(18,2) NOT NULL DEFAULT 0, -- giá bán (SP không biến thể; SP có biến thể thì giá đại diện)
  has_variants BOOLEAN NOT NULL DEFAULT false,
  options JSONB NOT NULL DEFAULT '[]', -- [{name, values[]}] — định nghĩa thuộc tính biến thể, vd [{"name":"Màu","values":["Đen","Trắng"]}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cột thêm sau cho products (khi bảng đã tồn tại từ trước, CREATE TABLE IF NOT EXISTS không tự thêm cột mới)
ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '[]';

-- Biến thể sản phẩm (vd: Áo size S/Đen, size M/Trắng...). Chỉ áp dụng khi products.has_variants = true.
CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT,
  attrs JSONB NOT NULL DEFAULT '{}', -- {"Màu":"Đen","Size":"M"}
  price NUMERIC(18,2) NOT NULL DEFAULT 0,
  cost NUMERIC(18,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS warehouse_stock (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  qty NUMERIC(18,3) NOT NULL DEFAULT 0
);
ALTER TABLE warehouse_stock ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE;
ALTER TABLE warehouse_stock DROP CONSTRAINT IF EXISTS warehouse_stock_product_id_warehouse_id_key;
-- variant_id có thể NULL (SP không biến thể) → unique theo COALESCE với sentinel -1
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_stock
  ON warehouse_stock (product_id, COALESCE(variant_id, -1), warehouse_id);

-- Audit trail mọi biến động tồn kho. qty_change âm = xuất, dương = nhập.
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  qty_change NUMERIC(18,3) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('inbound', 'outbound', 'adjust', 'transfer_in', 'transfer_out')),
  partner_id INTEGER REFERENCES partners(id),
  transaction_id INTEGER REFERENCES transactions(id), -- phiếu thu/chi kèm theo nếu có
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id);

-- ============== Nhân viên, Lương, BHXH ==============
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  position TEXT,
  base_salary NUMERIC(18,2) NOT NULL DEFAULT 0,
  allowance NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- Mức lương đóng BHXH (thường = lương cơ bản, có thể khác nếu thoả thuận riêng)
  insurance_base NUMERIC(18,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng lương theo tháng. Tỷ lệ BHXH/BHYT/BHTN theo quy định VN hiện hành:
-- Người lao động đóng: BHXH 8% + BHYT 1.5% + BHTN 1% = 10.5% trên insurance_base.
-- Người sử dụng lao động đóng thêm: BHXH 17.5% + BHYT 3% + BHTN 1% = 21.5% (chi phí công ty, không trừ lương).
CREATE TABLE IF NOT EXISTS payslips (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  base_salary NUMERIC(18,2) NOT NULL,
  allowance NUMERIC(18,2) NOT NULL DEFAULT 0,
  insurance_base NUMERIC(18,2) NOT NULL DEFAULT 0,
  employee_insurance NUMERIC(18,2) NOT NULL DEFAULT 0, -- khấu trừ từ lương NLĐ
  employer_insurance NUMERIC(18,2) NOT NULL DEFAULT 0, -- chi phí công ty đóng thêm, không trừ lương
  net_salary NUMERIC(18,2) NOT NULL, -- lương thực nhận = base+allowance-employee_insurance
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  salary_transaction_id INTEGER REFERENCES transactions(id), -- phiếu Chi trả lương
  insurance_transaction_id INTEGER REFERENCES transactions(id), -- phiếu Chi nộp BHXH (cả phần NLĐ+công ty)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month, year)
);

-- ============== Bán hàng: Đơn hàng đa dòng sản phẩm ==============
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES partners(id),
  customer_name TEXT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'Mới' CHECK (status IN ('Mới', 'Hoàn thành', 'Đã hủy')),
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount NUMERIC(18,2) NOT NULL DEFAULT 0,
  total NUMERIC(18,2) NOT NULL DEFAULT 0,
  paid NUMERIC(18,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0; -- % VAT áp dụng cho đơn này
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0; -- tiền VAT = (subtotal-discount) * vat_rate/100
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(18,2) NOT NULL DEFAULT 0; -- phí ship thu thêm khách, cộng vào total

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty NUMERIC(18,3) NOT NULL CHECK (qty > 0),
  price NUMERIC(18,2) NOT NULL,
  cost_at_sale NUMERIC(18,2) NOT NULL DEFAULT 0 -- giá vốn tại thời điểm bán, dùng tính lãi/lỗ
);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id);

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id);

-- ============== Mua hàng: Đơn mua đa dòng sản phẩm (thay cho "Nhập hàng" đơn giản) ==============
CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  supplier_id INTEGER REFERENCES partners(id),
  supplier_name TEXT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'Mới' CHECK (status IN ('Mới', 'Hoàn thành', 'Đã hủy')),
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount NUMERIC(18,2) NOT NULL DEFAULT 0,
  total NUMERIC(18,2) NOT NULL DEFAULT 0,
  paid NUMERIC(18,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_id INTEGER REFERENCES product_variants(id),
  qty NUMERIC(18,3) NOT NULL CHECK (qty > 0),
  price NUMERIC(18,2) NOT NULL -- giá nhập (giá vốn) tại thời điểm mua
);

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS purchase_order_id INTEGER REFERENCES purchase_orders(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(18,2) NOT NULL DEFAULT 0;

CREATE SEQUENCE IF NOT EXISTS tx_seq START 1;
CREATE SEQUENCE IF NOT EXISTS debt_seq START 1;
CREATE SEQUENCE IF NOT EXISTS partner_seq START 1;
CREATE SEQUENCE IF NOT EXISTS stock_seq START 1;
CREATE SEQUENCE IF NOT EXISTS employee_seq START 1;
CREATE SEQUENCE IF NOT EXISTS payslip_seq START 1;
CREATE SEQUENCE IF NOT EXISTS order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS purchase_seq START 1;

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_partner ON transactions(partner_id);
CREATE INDEX IF NOT EXISTS idx_transactions_bank_account ON transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_debt_entries_partner ON debt_entries(partner_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_payslips_period ON payslips(year, month);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON purchase_order_items(purchase_order_id);
