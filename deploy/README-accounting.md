# Hướng dẫn deploy Kế toán nội bộ (accounting-app) lên VPS riêng (BizFly Cloud)

VPS này CHỈ chạy accounting-app (không chung với ERP), nên dùng cổng 80 mặc định —
truy cập thẳng bằng `http://<IP_VPS>`, không cần ghi thêm số cổng.

## Chuẩn bị (đã làm xong nếu bạn vừa mua VPS BizFly)

1. VPS Ubuntu 22.04 LTS — ghi lại **IP công khai** và **mật khẩu root** (hoặc SSH key).
2. (Tuỳ chọn) Nếu có domain riêng (vd `ketoan.congtycuaban.com`): tạo bản ghi DNS
   loại **A** trỏ về IP VPS, đợi 5-30 phút trước khi cài SSL.

## Bước 1 — SSH vào VPS

Từ máy bạn (Terminal/PowerShell):
```bash
ssh root@<IP_VPS_CUA_BAN>
```

## Bước 2 — Tải và chạy script cài đặt (chỉ 1 lần)

```bash
curl -fsSL https://raw.githubusercontent.com/nqtrung93/erp-noi-that/master/deploy/setup-accounting.sh -o setup-accounting.sh
nano setup-accounting.sh   # sửa DOMAIN nếu có, để trống "" nếu chỉ test bằng IP
bash setup-accounting.sh
```

Script tự làm hết: cài Node 20, PostgreSQL, Nginx, PM2, Certbot → tạo database
`accounting` → cài schema → build frontend → chạy backend bằng PM2 (process
`accounting-backend`) → cấu hình Nginx ở **cổng 80** → cài SSL nếu có domain.

**Cuối script in ra tài khoản + mật khẩu Admin — ghi lại ngay, đăng nhập rồi đổi mật khẩu.**

## Bước 3 — Mở cổng trên BizFly Cloud

Vào trang quản trị BizFly Cloud → Server → **Security Group / Firewall** → đảm bảo
cho phép **TCP port 80** (và **443** nếu dùng domain+SSL) từ `0.0.0.0/0`.
(Thường port 80/443/22 đã mở sẵn theo mặc định của BizFly — chỉ cần kiểm tra lại.)

## Bước 4 — Truy cập thử

- Chỉ dùng IP: `http://<IP_VPS>`
- Có domain + SSL: `https://<domain>`

## Bước 5 — Mỗi lần muốn nâng cấp (sau khi có code mới)

```bash
cd /opt/accounting/deploy
bash deploy-accounting.sh
```

## Backup dữ liệu

VPS tự cài PostgreSQL đầy đủ nên có thể backup bằng `pg_dump` định kỳ:
```bash
sudo -u postgres pg_dump accounting > ~/accounting_backup_$(date +%Y%m%d).sql
```
Nên tải file backup này ra máy khác để lưu trữ an toàn.

## Các lệnh hữu ích khi cần kiểm tra

```bash
pm2 status                        # xem backend đang chạy không
pm2 logs accounting-backend       # xem log lỗi backend
systemctl status nginx            # xem Nginx có chạy không
sudo -u postgres psql -c "\l"     # xem danh sách database
```
