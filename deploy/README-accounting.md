# Hướng dẫn deploy Kế toán nội bộ (accounting-app) lên VPS BizFly Cloud

Có thể chạy **song song** với ERP trên cùng 1 VPS — script dùng database, PM2 process,
port và Nginx site khác tên nên không đụng nhau.

## Chuẩn bị (làm trên web BizFly Cloud, không cần SSH)

1. Nếu chưa có VPS: tạo **Cloud Server** mới — Ubuntu 22.04 LTS, ghi lại IP công khai.
   (Nếu đã có VPS đang chạy ERP, dùng luôn VPS đó, không cần tạo thêm.)
2. (Tuỳ chọn) Nếu có domain riêng cho kế toán (vd `ketoan.congtycuaban.com`): tạo bản ghi DNS
   loại **A** trỏ về IP VPS, đợi 5-30 phút trước khi cài SSL.

## Bước 1 — Đẩy code lên GitHub (làm 1 lần, từ máy bạn)

```bash
git add accounting-app deploy
git commit -m "Add accounting-app + deploy scripts"
git push
```

## Bước 2 — SSH vào VPS và chạy script cài đặt (chỉ 1 lần)

```bash
ssh root@<IP_VPS_CUA_BAN>
```

Trên VPS:
```bash
curl -fsSL https://raw.githubusercontent.com/nqtrung93/erp-noi-that/master/deploy/setup-accounting.sh -o setup-accounting.sh
nano setup-accounting.sh   # sửa DOMAIN nếu có, để trống "" nếu chỉ test bằng IP
bash setup-accounting.sh
```

Script tự làm hết: cài Node/PostgreSQL/Nginx/PM2 (bỏ qua nếu đã cài cho ERP) → tạo
database riêng `accounting` → cài schema → build frontend → chạy backend bằng PM2
(process `accounting-backend`) → cấu hình Nginx site riêng ở **cổng 8080**.

**Cuối script in ra tài khoản + mật khẩu Admin — ghi lại ngay, đăng nhập rồi đổi mật khẩu.**

## Bước 3 — Mở cổng 8080 trên BizFly Cloud

Vào trang quản trị BizFly Cloud → Server → **Security Group / Firewall** → thêm rule
cho phép **TCP port 8080** (và **443** nếu dùng domain+SSL) từ `0.0.0.0/0`.

## Bước 4 — Truy cập thử

- Chỉ dùng IP: `http://<IP_VPS>:8080`
- Có domain + SSL: `https://<domain>` (cổng 80/443 do Certbot/Nginx tự cấu hình)

## Bước 5 — Mỗi lần muốn nâng cấp (sau khi có code mới)

```bash
cd /opt/accounting/deploy
bash deploy-accounting.sh
```

## Các lệnh hữu ích khi cần kiểm tra

```bash
pm2 status                        # xem cả 2 app (erp-backend, accounting-backend) chạy chưa
pm2 logs accounting-backend       # xem log lỗi backend kế toán
systemctl status nginx
sudo -u postgres psql -c "\l"     # xem danh sách database (phải có cả erp và accounting)
```
