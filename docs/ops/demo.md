# Vận hành Môi trường Demo (Runbook)

Tài liệu hướng dẫn thiết lập, vận hành, kiểm tra và khắc phục sự cố cho môi trường thử nghiệm công khai (**Demo Environment**) của Scaffolding ERP trên hạ tầng **Vercel + Neon**.

---

## 1. Kiến trúc & Đặc tả hạ tầng

- **Chi phí**: 0 USD — Vercel **Hobby** + Neon **Free** + GitHub Actions (chốt 01/11/2026). Hobby chỉ cho dùng phi thương mại: thử nội bộ / vài người xem; mở rộng cho khách hoặc production thì lên Vercel Pro.
- **Ứng dụng Web / API**: Vercel (gói Hobby), Node.js 24.x, vùng serverless function `sin1` (Singapore).
- **Cơ sở dữ liệu**: Neon Serverless Postgres 17, vùng `aws-ap-southeast-1` (Singapore), tính năng phân nhánh (Database Branching).
- **Bảo vệ chỉ mục**: Header `X-Robots-Tag: noindex, nofollow` được cấu hình trong `vercel.json` và metadata robots (`isDemoMode()`) chặn 100% bot tìm kiếm.
- **Bảo vệ quyền truy cập**: Chế độ `DEMO_MODE=true` khóa tính năng đổi mật khẩu, xóa/khóa tài khoản quản trị viên và gắn banner cảnh báo trên giao diện.

```
Neon Project: scaffolding-erp-demo
├── main (nhánh gốc trống)
└── seed (ảnh chụp sạch: migrate + seed dữ liệu mẫu)
    └── demo (nhánh chạy thực tế phục vụ Vercel)
```

---

## 2. Hướng dẫn thiết lập ban đầu

### Bước 1: Tạo Project & Nhánh trên Neon

1. Đăng nhập [Neon Console](https://console.neon.tech/), tạo project mới:
   - Tên: `scaffolding-erp-demo`
   - Phiên bản Postgres: **Postgres 17**
   - Vùng: **Asia Pacific (Singapore) - `aws-ap-southeast-1`**
2. Tạo nhánh cơ sở `seed` từ nhánh chính:
   - Chạy lệnh migration với URL kết nối trực tiếp (unpooled):
     ```bash
     DATABASE_URL="postgres://user:password@ep-seed.aws-ap-southeast-1.neon.tech/neondb?sslmode=require" npm run db:migrate
     ```
   - Chạy lệnh nạp dữ liệu mẫu ban đầu:
     ```bash
     NODE_ENV=development DATABASE_URL="postgres://user:password@ep-seed.aws-ap-southeast-1.neon.tech/neondb?sslmode=require" npm run db:seed:demo
     ```
3. Tạo nhánh con `demo` tách ra từ nhánh `seed`:
   - Mọi thao tác ghi của người dùng thử nghiệm sẽ thực hiện trên nhánh `demo`.
   - Nhánh `seed` được giữ nguyên làm bản sao sạch (baseline).

### Bước 2: Tạo Project trên Vercel

1. Import repository `scaffolding-erp` trên Vercel.
2. Cấu hình cài đặt dự án (Project Settings):
   - **Framework Preset**: Next.js
   - **Node.js Version**: `24.x`
   - **Serverless Function Region**: `sin1` (Singapore)
   - **Vercel Toolbar**: Tắt (Off) ở cả Production và Preview để tránh vi phạm chính sách CSP.
3. Cấu hình Biến Môi trường (Environment Variables) cho Production:
   - `DATABASE_URL`: URL dạng pooled của nhánh `demo` (chứa `-pooler` trong hostname, có `sslmode=require`).
   - `DATABASE_URL_UNPOOLED`: URL kết nối trực tiếp không qua pooler của nhánh `demo`.
   - `BETTER_AUTH_SECRET`: Chuỗi ngẫu nhiên bảo mật 32 byte (`openssl rand -base64 32`).
   - `BETTER_AUTH_URL`: `https://demo.<tên-miền-công-ty>` hoặc `https://<project-name>.vercel.app`.
   - `DEMO_MODE`: `true`.
   - `DB_POOL_MAX`: `5` (phù hợp serverless).
   - `DB_CONNECT_TIMEOUT_SECONDS`: `10` (cho phép compute Neon thức dậy).

### Bước 3: Cấu hình GitHub Secrets (Environment `demo`)

Trên GitHub repository, vào **Settings → Environments**, tạo environment tên `demo` và thêm các secret sau:

| Secret Name | Mô tả |
|---|---|
| `NEON_API_KEY` | API Key cá nhân từ Neon Console (Account Settings → API Keys) |
| `NEON_PROJECT_ID` | Project ID của project `scaffolding-erp-demo` trên Neon |
| `DEMO_SEED_DATABASE_URL` | URL kết nối trực tiếp (unpooled) của nhánh `seed` để migrate |
| `DEMO_DATABASE_URL_UNPOOLED` | URL kết nối trực tiếp (unpooled) của nhánh `demo` |
| `DEMO_DATABASE_URL` | URL kết nối của nhánh `demo` để kiểm tra toàn vẹn sổ kho |
| `DEV_SEED_PASSWORD` | Mật khẩu mẫu khởi tạo cho các tài khoản demo |
| `DEMO_URL` | Đường dẫn ứng dụng demo (ví dụ: `https://scaffolding-erp-demo.vercel.app`) |
| `VERCEL_DEPLOY_HOOK` | Deploy Hook URL tạo từ Vercel (Project Settings → Git → Deploy Hooks) |

---

## 3. Lịch Reset tự động & Khôi phục thủ công

### Reset tự động hằng đêm
- Workflow `.github/workflows/demo-reset.yml` được lên lịch chạy tự động lúc **17:00 UTC (00:00 giờ Việt Nam)** mỗi ngày.
- Quá trình reset thực hiện lệnh:
  ```bash
  neonctl branches reset demo --parent --project-id $NEON_PROJECT_ID
  ```
- Nhánh `demo` sẽ quay về trạng thái sạch của nhánh cha `seed` trong vài giây mà không làm thay đổi chuỗi kết nối (`DATABASE_URL`).
- Workflow sau đó tự động kiểm tra endpoint `/api/health` và tính toán toàn vẹn sổ kho bằng `npm run inventory:check`.

### Reset thủ công khi có sự cố
Khi người thử nhập dữ liệu sai lệch lớn, hoặc cần trả dữ liệu về trạng thái sạch ngay lập tức:
1. Vào tab **Actions** trên GitHub repository.
2. Chọn workflow **Demo Reset**.
3. Bấm **Run workflow** và chọn nhánh `main`.
4. Sau khoảng 30–60 giây, ứng dụng sẽ trở về trạng thái mẫu ban đầu.

---

## 4. Quy trình Cập nhật & Deploy (`deploy-demo.yml`)

Khi có thay đổi mã nguồn hoặc migration mới trên nhánh `main`:
1. Vào tab **Actions** trên GitHub.
2. Chọn workflow **Deploy Demo**.
3. Chọn các tùy chọn:
   - `reseed`: Chọn `true` nếu có bảng mới cần nạp lại dữ liệu mẫu vào nhánh `seed`.
   - `reset_demo_branch`: Chọn `true` nếu muốn làm mới nhánh `demo` theo schema mới của `seed`.
4. Bấm **Run workflow**. Quy trình sẽ chạy tuần tự:
   - Chạy `db:migrate` trên nhánh `seed`.
   - Cập nhật nhánh `demo`.
   - Kích hoạt Vercel Deploy Hook để cập nhật mã nguồn mới.
   - Kiểm tra `/api/health` sau khi hoàn tất.

---

## 5. Xử lý sự cố thường gặp (Troubleshooting)

### 1. Tài khoản bị khóa do thử sai mật khẩu quá 5 lần
- **Hiện tượng**: Báo lỗi đăng nhập tạm khóa trong 15 phút.
- **Cách xử lý tức thì**:
  Chạy lệnh mở khóa toàn bộ tài khoản với chuỗi kết nối của nhánh `demo`:
  ```bash
  DATABASE_URL="<DEMO_DATABASE_URL>" npm run auth:unlock -- --all
  ```

### 2. Request đầu tiên bị chậm hoặc Timeout
- **Nguyên nhân**: Compute của Neon ở gói Free sẽ tự động tạm ngưng (sleep) sau 5 phút không có request. Khi có request mới, Neon mất khoảng 1–2 giây để khởi động lại.
- **Khắc phục**:
  - `DB_CONNECT_TIMEOUT_SECONDS=10` trong biến môi trường đã được tăng để không bị fail kết nối.
  - Cài đặt giám sát định kỳ (UptimeRobot / Better Stack) gọi `/api/health` 15 phút/lần để giữ database sẵn sàng.

### 3. Người dùng vô tình thay đổi mật khẩu
- Khi `DEMO_MODE=true`, ứng dụng chặn hoàn toàn thao tác đổi mật khẩu trên giao diện (`/change-password` và API `/api/me/password`).
- Nếu vô tình bị đổi bằng cách khác, chỉ cần kích hoạt workflow **Demo Reset** để đưa mật khẩu 5 vai trò về mặc định.
