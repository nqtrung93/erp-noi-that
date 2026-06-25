import { withTransaction } from "../config/db.js";

// Xoá dữ liệu giao dịch, GIỮ LẠI sản phẩm/đối tượng/kho/nhân viên/danh mục/cài đặt.
// Thứ tự xoá phải tôn trọng FK: stock_movements tham chiếu orders+transactions nên xoá trước.
export async function resetTransactions() {
  await withTransaction(async (c) => {
    await c.query(`DELETE FROM stock_movements`);
    await c.query(`UPDATE warehouse_stock SET qty = 0`);
    await c.query(`DELETE FROM order_items`);
    await c.query(`DELETE FROM orders`);
    await c.query(`DELETE FROM payslips`);
    await c.query(`DELETE FROM debt_entries`);
    await c.query(`DELETE FROM transactions`);
    await c.query(`UPDATE partners SET debt = 0`);
  });
}

// Xoá SẠCH toàn bộ dữ liệu nghiệp vụ, giữ lại roles/role_permissions và user admin đang đăng nhập.
export async function resetAll(currentUserId) {
  await withTransaction(async (c) => {
    await c.query(`DELETE FROM stock_movements`);
    await c.query(`DELETE FROM order_items`);
    await c.query(`DELETE FROM orders`);
    await c.query(`DELETE FROM warehouse_stock`);
    await c.query(`DELETE FROM product_variants`);
    await c.query(`DELETE FROM products`);
    await c.query(`DELETE FROM warehouses`);
    await c.query(`DELETE FROM payslips`);
    await c.query(`DELETE FROM debt_entries`);
    await c.query(`DELETE FROM transactions`);
    await c.query(`DELETE FROM partners`);
    await c.query(`DELETE FROM employees`);
    await c.query(`DELETE FROM bank_accounts`);
    await c.query(`DELETE FROM categories`);
    await c.query(`DELETE FROM users WHERE id != $1`, [currentUserId]);
  });
}
