#!/usr/bin/env bash
# ============================================================================
# Script cài đặt LẦN ĐẦU cho Kế toán nội bộ (accounting-app) trên VPS Ubuntu
# 22.04 (BizFly Cloud Server). Chạy với quyền root: sudo bash setup-accounting.sh
#
# Trước khi chạy, SỬA biến REPO_URL/DOMAIN dưới đây cho đúng với VPS/domain của bạn.
# Có thể chạy song song với ERP trên cùng VPS — dùng APP_DIR, DB, PM2 process,
# port và Nginx site KHÁC TÊN với ERP nên không đụng nhau.
# ============================================================================
set -e  # dừng ngay nếu có lệnh nào lỗi

# ---------- CHỈNH CÁC GIÁ TRỊ NÀY TRƯỚC KHI CHẠY ----------
REPO_URL="https://github.com/nqtrung93/erp-noi-that.git"
REPO_BRANCH="master"
APP_DIR="/opt/accounting"          # nơi chứa code trên VPS (khác /opt/erp)
DOMAIN=""                          # vd: ketoan.congtycuaban.com — để trống "" nếu chỉ dùng IP
BACKEND_PORT=4100
DB_NAME="accounting"
DB_USER="accounting_user"
DB_PASSWORD="$(openssl rand -hex 16)"
JWT_SECRET="$(openssl rand -hex 32)"
SEED_ADMIN_USERNAME="admin"
SEED_ADMIN_PASSWORD="$(openssl rand -hex 8)"
# ------------------------------------------------------------

echo "==> 1) Cập nhật hệ thống"
apt update && apt upgrade -y

echo "==> 2) Cài Node.js 20.x (bỏ qua nếu đã cài cho ERP)"
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi
node -v

echo "==> 3) Cài PostgreSQL (bỏ qua nếu đã cài cho ERP)"
apt install -y postgresql postgresql-contrib
systemctl enable postgresql --now

echo "==> 4) Tạo database + user RIÊNG cho kế toán (khác hẳn DB của ERP)"
sudo -u postgres psql <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
SQL

echo "==> 5) Cài Nginx + PM2 + Certbot (bỏ qua nếu đã cài cho ERP)"
apt install -y nginx
npm install -g pm2
apt install -y certbot python3-certbot-nginx

echo "==> 6) Clone source code (dùng chung repo với ERP, thư mục riêng)"
mkdir -p "$(dirname "$APP_DIR")"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR" && git pull
else
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
fi

BACKEND_DIR="$APP_DIR/accounting-app/backend"
FRONTEND_DIR="$APP_DIR/accounting-app/frontend"

echo "==> 7) Tạo file .env cho backend"
cat > "$BACKEND_DIR/.env" <<ENV
PORT=${BACKEND_PORT}
DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=8h
SEED_ADMIN_USERNAME=${SEED_ADMIN_USERNAME}
SEED_ADMIN_PASSWORD=${SEED_ADMIN_PASSWORD}
CORS_ORIGIN=*
ENV

echo "==> 8) Cài dependencies + tạo schema + seed admin"
cd "$BACKEND_DIR"
npm install --omit=dev
npm run db:schema
npm run db:seed

echo "==> 9) Build frontend"
cd "$FRONTEND_DIR"
echo "VITE_API_URL=/api" > .env
npm install
npm run build

echo "==> 10) Chạy backend bằng PM2 (process riêng, tên khác ERP)"
cd "$BACKEND_DIR"
pm2 start src/server.js --name accounting-backend
pm2 save
pm2 startup systemd -u root --hp /root | tail -n1 | bash || true

echo "==> 11) Cấu hình Nginx (site riêng, KHÔNG đụng site ERP)"
NGINX_SERVER_NAME="${DOMAIN:-_}"
cat > /etc/nginx/sites-available/accounting <<NGINX
server {
    listen 8080;
    server_name ${NGINX_SERVER_NAME};

    root ${FRONTEND_DIR}/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location / {
        try_files \$uri /index.html;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/accounting /etc/nginx/sites-enabled/accounting
nginx -t && systemctl reload nginx

if [ -n "$DOMAIN" ]; then
  echo "==> 12) Cài SSL miễn phí cho domain ${DOMAIN}"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@${DOMAIN}" || \
    echo "⚠️  Certbot lỗi — domain phải trỏ DNS về IP VPS này TRƯỚC khi chạy certbot. Chạy lại: certbot --nginx -d ${DOMAIN}"
fi

echo ""
echo "================================================================"
echo "✓ CÀI ĐẶT XONG — Kế toán nội bộ"
echo "  Truy cập:        http://<IP_VPS>:8080  (hoặc http://${DOMAIN} nếu đã trỏ DNS, cổng 80 qua domain)"
echo "  Tài khoản admin: ${SEED_ADMIN_USERNAME}"
echo "  Mật khẩu admin:  ${SEED_ADMIN_PASSWORD}"
echo "  (Đã lưu trong:   ${BACKEND_DIR}/.env — GHI LẠI MẬT KHẨU NÀY rồi đổi sau khi đăng nhập lần đầu)"
echo "  Lưu ý: cổng 8080 cần mở trong Security Group/Firewall của BizFly Cloud."
echo "================================================================"
