#!/usr/bin/env bash
# ============================================================================
# Script NÂNG CẤP cho accounting-app — chạy mỗi khi có code mới (sau khi
# `git push` lên GitHub). Trên VPS: cd /opt/accounting/deploy && bash deploy-accounting.sh
# ============================================================================
set -e

APP_DIR="/opt/accounting"
BACKEND_DIR="$APP_DIR/accounting-app/backend"
FRONTEND_DIR="$APP_DIR/accounting-app/frontend"

echo "==> 1) Lấy code mới nhất"
cd "$APP_DIR"
git pull

echo "==> 2) Cập nhật backend (cài lib mới nếu có + chạy migration DB)"
cd "$BACKEND_DIR"
npm install --omit=dev
npm run db:schema   # idempotent — chỉ áp thay đổi mới, không xoá dữ liệu cũ

echo "==> 3) Build lại frontend"
cd "$FRONTEND_DIR"
npm install
npm run build

echo "==> 4) Khởi động lại backend"
pm2 restart accounting-backend

echo ""
echo "✓ NÂNG CẤP XONG — kiểm tra lại trang web để chắc chắn."
