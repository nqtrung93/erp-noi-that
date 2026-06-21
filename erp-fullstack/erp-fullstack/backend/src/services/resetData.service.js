import { withTransaction } from "../config/db.js";

const TX_SEQUENCES = [
  "order_seq", "tx_seq", "inbound_seq", "adjust_seq", "transfer_seq",
  "shipment_seq", "saleout_seq", "warranty_seq",
];

// Xoá toàn bộ dữ liệu GIAO DỊCH, giữ nguyên dữ liệu nền (sản phẩm, khách hàng, NCC, kho, nhân
// viên, cài đặt). Dùng khi muốn "làm sạch" số liệu để bắt đầu vận hành thật, không phải reset hệ thống.
export async function resetTransactions() {
  return withTransaction(async (c) => {
    await c.query(`DELETE FROM order_items`);
    await c.query(`DELETE FROM shipments`);
    await c.query(`DELETE FROM stock_movements`);
    await c.query(`DELETE FROM warehouse_stock`);
    await c.query(`DELETE FROM warranties`);
    await c.query(`DELETE FROM transactions`);
    await c.query(`DELETE FROM orders`);
    await c.query(`UPDATE suppliers SET debt = 0`);
    for (const seq of TX_SEQUENCES) {
      await c.query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
    }
  });
}

const DEFAULT_WAREHOUSES = [
  { code: "WH01", name: "Kho Hà Nội", address: "Hà Nội" },
  { code: "WH02", name: "Kho TP.HCM", address: "TP. Hồ Chí Minh" },
  { code: "WH03", name: "Kho Đà Nẵng", address: "Đà Nẵng" },
  { code: "WH04", name: "Kho Cần Thơ", address: "Cần Thơ" },
];
const DEFAULT_CUSTOMER_GROUPS = ["Khách lẻ", "Đại lý", "Doanh nghiệp"];
const DEFAULT_ORDER_SOURCES = ["Hotline", "Facebook", "Tự gọi điện"];

// Xoá SẠCH mọi dữ liệu (sản phẩm, khách hàng, NCC, kho, nhân viên khác...) về trạng thái như
// mới cài đặt — CHỈ giữ roles/role_permissions (cấu hình phân quyền) và tài khoản Admin đang
// thực hiện reset (không thể tự xoá chính mình khi đang đăng nhập).
export async function resetAll(currentUserId) {
  return withTransaction(async (c) => {
    await c.query(`DELETE FROM order_items`);
    await c.query(`DELETE FROM shipments`);
    await c.query(`DELETE FROM stock_movements`);
    await c.query(`DELETE FROM warehouse_stock`);
    await c.query(`DELETE FROM warranties`);
    await c.query(`DELETE FROM transactions`);
    await c.query(`DELETE FROM orders`);
    await c.query(`DELETE FROM product_variants`);
    await c.query(`DELETE FROM products`);
    await c.query(`DELETE FROM customers`);
    await c.query(`DELETE FROM suppliers`);
    await c.query(`DELETE FROM carriers`);
    await c.query(`DELETE FROM shops`);
    await c.query(`DELETE FROM order_sources`);
    await c.query(`DELETE FROM customer_groups`);
    // Phải gỡ tham chiếu warehouse_id của user trước khi xoá users khác rồi mới xoá warehouses (FK).
    await c.query(`UPDATE users SET warehouse_id = NULL`);
    await c.query(`DELETE FROM users WHERE id != $1`, [currentUserId]);
    await c.query(`DELETE FROM warehouses`);

    for (const seq of TX_SEQUENCES) {
      await c.query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
    }
    await c.query(`ALTER SEQUENCE customer_seq RESTART WITH 1`);
    await c.query(`ALTER SEQUENCE product_seq RESTART WITH 1`);

    for (const w of DEFAULT_WAREHOUSES) {
      await c.query(`INSERT INTO warehouses(code, name, address) VALUES($1,$2,$3)`, [w.code, w.name, w.address]);
    }
    for (const g of DEFAULT_CUSTOMER_GROUPS) {
      await c.query(`INSERT INTO customer_groups(name) VALUES($1)`, [g]);
    }
    for (const s of DEFAULT_ORDER_SOURCES) {
      await c.query(`INSERT INTO order_sources(name) VALUES($1)`, [s]);
    }
  });
}
