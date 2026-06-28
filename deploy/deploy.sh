#!/usr/bin/env bash
# ============================================================================
# Script NÂNG CẤP — chạy mỗi khi có code mới (sau khi tôi sửa code và bạn
# `git push` lên GitHub). Trên VPS: cd /opt/erp/deploy && bash deploy.sh
# ============================================================================
set -e

APP_DIR="/opt/erp"
BACKEND_DIR="$APP_DIR/erp-fullstack/erp-fullstack/backend"
FRONTEND_DIR="$APP_DIR/erp-fullstack/erp-fullstack/frontend"

echo "==> 1) Lấy code mới nhất"
cd "$APP_DIR"
git pull

echo "==> 1b) Đảm bảo có đủ thư viện hệ thống cho Chrome headless (xuất PDF) — bỏ qua nếu đã có"
apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libgtk-3-0 \
  libasound2t64 2>/dev/null || apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libgtk-3-0 libasound2

echo "==> 2) Cập nhật backend (cài lib mới nếu có + chạy migration DB)"
cd "$BACKEND_DIR"
npm install --omit=dev
npm run db:schema   # idempotent — chỉ áp thay đổi mới, không xoá dữ liệu cũ

echo "==> 3) Build lại frontend"
cd "$FRONTEND_DIR"
npm install
npm run build

echo "==> 4) Khởi động lại backend"
pm2 restart erp-backend

echo ""
echo "✓ NÂNG CẤP XONG — kiểm tra lại trang web để chắc chắn."
