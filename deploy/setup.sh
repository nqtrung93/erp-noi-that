#!/usr/bin/env bash
# ============================================================================
# Script cài đặt LẦN ĐẦU cho ERP trên VPS Ubuntu 22.04 (BizFly Cloud Server).
# Chạy với quyền root: sudo bash setup.sh
#
# Trước khi chạy, SỬA 3 biến dưới đây cho đúng với VPS/domain của bạn.
# ============================================================================
set -e  # dừng ngay nếu có lệnh nào lỗi

# ---------- CHỈNH CÁC GIÁ TRỊ NÀY TRƯỚC KHI CHẠY ----------
REPO_URL="https://github.com/nqtrung93/erp-noi-that.git"
REPO_BRANCH="master"
APP_DIR="/opt/erp"                 # nơi chứa code trên VPS
DOMAIN=""                          # vd: erp.congtycuaban.com — để trống "" nếu chỉ dùng IP (chưa có domain)
DB_PASSWORD="$(openssl rand -hex 16)"   # tự sinh mật khẩu DB ngẫu nhiên, an toàn
JWT_SECRET="$(openssl rand -hex 32)"    # tự sinh JWT secret ngẫu nhiên
SEED_ADMIN_USERNAME="admin"
SEED_ADMIN_PASSWORD="$(openssl rand -hex 8)"   # đổi lại bằng mật khẩu bạn muốn nhớ, hoặc giữ random rồi đổi sau khi đăng nhập
# ------------------------------------------------------------

echo "==> 1) Cập nhật hệ thống"
apt update && apt upgrade -y

echo "==> 2) Cài Node.js 20.x"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v

echo "==> 3) Cài PostgreSQL"
apt install -y postgresql postgresql-contrib
systemctl enable postgresql --now

echo "==> 4) Tạo database + user cho ERP"
sudo -u postgres psql <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'erp_user') THEN
    CREATE ROLE erp_user LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE erp OWNER erp_user' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'erp')\gexec
SQL

echo "==> 5) Cài Nginx + PM2 + Certbot"
apt install -y nginx
npm install -g pm2
apt install -y certbot python3-certbot-nginx

echo "==> 6) Clone source code"
mkdir -p "$(dirname "$APP_DIR")"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR" && git pull
else
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
fi

BACKEND_DIR="$APP_DIR/erp-fullstack/erp-fullstack/backend"
FRONTEND_DIR="$APP_DIR/erp-fullstack/erp-fullstack/frontend"

echo "==> 7) Tạo file .env cho backend"
cat > "$BACKEND_DIR/.env" <<ENV
DATABASE_URL=postgres://erp_user:${DB_PASSWORD}@localhost:5432/erp
JWT_SECRET=${JWT_SECRET}
SEED_ADMIN_USERNAME=${SEED_ADMIN_USERNAME}
SEED_ADMIN_PASSWORD=${SEED_ADMIN_PASSWORD}
CORS_ORIGIN=*
PORT=4000
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

echo "==> 10) Chạy backend bằng PM2 (tự khởi động lại nếu crash/reboot)"
cd "$BACKEND_DIR"
pm2 start src/server.js --name erp-backend
pm2 save
pm2 startup systemd -u root --hp /root | tail -n1 | bash || true

echo "==> 11) Cấu hình Nginx"
NGINX_SERVER_NAME="${DOMAIN:-_}"
cat > /etc/nginx/sites-available/erp <<NGINX
server {
    listen 80;
    server_name ${NGINX_SERVER_NAME};

    root ${FRONTEND_DIR}/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location / {
        try_files \$uri /index.html;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/erp
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

if [ -n "$DOMAIN" ]; then
  echo "==> 12) Cài SSL miễn phí cho domain ${DOMAIN}"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@${DOMAIN}" || \
    echo "⚠️  Certbot lỗi — domain phải trỏ DNS về IP VPS này TRƯỚC khi chạy certbot. Chạy lại: certbot --nginx -d ${DOMAIN}"
fi

echo ""
echo "================================================================"
echo "✓ CÀI ĐẶT XONG"
echo "  Truy cập:        http://${NGINX_SERVER_NAME}  (hoặc https:// nếu đã có domain+SSL)"
echo "  Tài khoản admin: ${SEED_ADMIN_USERNAME}"
echo "  Mật khẩu admin:  ${SEED_ADMIN_PASSWORD}"
echo "  (Đã lưu trong:   ${BACKEND_DIR}/.env — GHI LẠI MẬT KHẨU NÀY rồi đổi sau khi đăng nhập lần đầu)"
echo "================================================================"
