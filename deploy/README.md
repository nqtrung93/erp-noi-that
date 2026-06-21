# Hướng dẫn deploy ERP lên VPS BizFly Cloud

## Chuẩn bị (làm trên web BizFly Cloud, không cần SSH)

1. Đăng ký/đăng nhập BizFly Cloud → tạo **Cloud Server** mới:
   - Hệ điều hành: **Ubuntu 22.04 LTS**
   - Gói: **Gói 4** (2 vCPU / 4GB RAM / 40GB SSD) — hoặc gói bạn đã chọn
   - Đặt mật khẩu root hoặc SSH key
2. Sau khi tạo xong, BizFly cho bạn 1 **địa chỉ IP công khai** (vd `123.45.67.89`) — ghi lại.
3. (Tuỳ chọn) Nếu có domain riêng (vd `erp.congtycuaban.com`): vào trang quản lý domain, tạo bản ghi DNS loại **A** trỏ về IP VPS ở bước 2. Đợi 5-30 phút để DNS cập nhật trước khi chạy bước cài SSL.

## Bước 1 — Đẩy code lên GitHub (làm 1 lần, từ máy bạn)

```bash
git add .
git commit -m "Chuẩn bị deploy"
git push
```

## Bước 2 — SSH vào VPS và chạy script cài đặt (chỉ 1 lần)

Từ máy bạn (Terminal/PowerShell), SSH vào VPS:
```bash
ssh root@<IP_VPS_CUA_BAN>
```

Trên VPS, tải và chạy script cài đặt:
```bash
curl -fsSL https://raw.githubusercontent.com/nqtrung93/erp-noi-that/master/deploy/setup.sh -o setup.sh
nano setup.sh   # mở sửa 2 dòng: REPO_URL (nếu khác) và DOMAIN (điền domain nếu có, để trống "" nếu chưa có)
bash setup.sh
```

Script tự làm hết: cài Node, PostgreSQL, Nginx, PM2, Certbot → tạo database → cài đặt schema → build frontend → chạy backend → cấu hình Nginx → cài SSL (nếu có domain).

**Cuối script sẽ in ra tài khoản + mật khẩu Admin — ghi lại ngay, rồi đăng nhập và đổi mật khẩu.**

## Bước 3 — Mỗi lần muốn nâng cấp (sau khi có code mới)

1. Ở máy bạn: code mới được `git push` lên GitHub (tôi làm khi sửa xong tính năng).
2. SSH vào VPS, chạy:
   ```bash
   cd /opt/erp/deploy
   bash deploy.sh
   ```
3. Xong — kiểm tra lại trang web.

## Backup dữ liệu

Vì VPS này tự cài PostgreSQL đầy đủ (có `pg_dump`), nút **"Tải bản backup"** trong Cài đặt của ERP sẽ hoạt động bình thường ngay trên VPS này (khác với một số nền tảng PaaS không có sẵn `pg_dump`). Nên bấm backup định kỳ và lưu file ra máy khác.

## Các lệnh hữu ích khi cần kiểm tra

```bash
pm2 status                 # xem backend đang chạy không
pm2 logs erp-backend       # xem log lỗi backend
systemctl status nginx     # xem Nginx có chạy không
sudo -u postgres psql -c "\l"   # xem danh sách database
```
