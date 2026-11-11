# Vận hành Môi trường Demo (Runbook)

Tài liệu hướng dẫn thiết lập, vận hành, kiểm tra và khắc phục sự cố cho môi trường thử nghiệm công khai (**Demo Environment**) của Scaffolding ERP trên hạ tầng **Vercel + Neon**.

---

## 1. Kiến trúc & Đặc tả hạ tầng

- **Chi phí**: 0 USD — Vercel **Hobby** + Neon **Free** + GitHub Actions (chốt 01/11/2026). Hobby chỉ cho dùng phi thương mại: thử nội bộ / vài người xem; mở rộng cho khách hoặc production thì lên Vercel Pro.
- **Ứng dụng Web / API**: Vercel (gói Hobby), Node.js 24.x, vùng serverless function `sin1` (Singapore).
- **Cơ sở dữ liệu**: Neon Serverless Postgres 17, vùng `aws-ap-southeast-1` (Singapore), tính năng phân nhánh (Database Branching).
- **Bảo vệ chỉ mục**: Header `X-Robots-Tag: noindex, nofollow` được cấu hình trong `vercel.json` và metadata robots (`isDemoMode()`) chặn 100% bot tìm kiếm.
- **Bảo vệ quyền truy cập**: Chế độ `DEMO_MODE=true` khóa tính năng đổi mật khẩu, xóa/khóa tài khoản quản trị viên và gắn banner cảnh báo trên giao diện.
- **Ảnh thu hồi** (0.2 #65, change `returns-and-compensation`): lưu trong Postgres (`return_photo.content`), WebP cạnh dài 1.280 px, tối đa 6 ảnh / phiếu (khoảng 100 KB / ảnh).
  - Neon Free có **0,5 GB cho cả DB**. Neon đầy thì **mọi lệnh ghi** dừng (nhập, xuất, sổ kho), không chỉ ảnh.
  - Ứng dụng cảnh báo khi tổng ảnh vượt **200 MB**: Cài đặt (Giám đốc) hiện số MB, `/api/health` trả `photoStorage: "warning"`.
  - Demo reset mỗi đêm về nhánh `seed` nên ảnh thử không dồn lại; chỉ cần để ý khi tắt reset.
  - **Mốc chuyển sang kho đối tượng riêng tư** (Vercel Blob private hoặc S3/R2): trước khi lên production trả phí, hoặc khi tổng ảnh vượt 200 MB trên gói Free. Làm bằng change riêng, giữ API xem ảnh `/api/returns/photos/[id]`.

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
   - Neon đặt tên nhánh gốc mặc định là `production` (bản cũ là `main`); tên nhánh gốc không quan trọng, chỉ nhánh `demo` phải đúng tên (workflow reset gọi theo tên).
   - Kiểm tra: host trong chuỗi kết nối có `ap-southeast-1`; `select version();` trong SQL Editor ra `PostgreSQL 17`. Vùng và phiên bản không đổi được sau khi tạo.
   - Không bật mục **Better Auth** (Neon Auth) của Neon: app có Better Auth riêng.
2. Tạo nhánh cơ sở `seed` từ nhánh gốc, chọn **Current data** và **tắt hạn tự xóa** (expiration). Nhánh có hạn xóa không làm nhánh cha được và sẽ bị xóa mất dữ liệu mẫu khi đến hạn:
   - Tạo role app `erp_app` **bằng SQL** trên nhánh `seed`: SQL Editor, chọn nhánh `seed`, role `neondb_owner`:
     ```sql
     CREATE ROLE erp_app LOGIN PASSWORD '<≥12 ký tự, có hoa, thường, số, ký hiệu>';
     ```
     Không tạo qua Console → Roles: role tạo ở đó tự có `neon_superuser` (đọc/ghi mọi bảng). Nhánh `demo` nhận role này khi tạo/reset từ `seed`; tạo trên `demo` thì reset sẽ mất.
   - Chạy lệnh migration bằng **owner** (`neondb_owner`), URL kết nối trực tiếp (unpooled). Migrate cấp luôn quyền cho `erp_app`:
     ```bash
     DATABASE_URL_MIGRATE="postgres://neondb_owner:password@ep-seed.aws-ap-southeast-1.neon.tech/neondb?sslmode=require" npm run db:migrate
     ```
   - Chạy lệnh nạp dữ liệu mẫu ban đầu:
     ```bash
     NODE_ENV=development DATABASE_URL="postgres://user:password@ep-seed.aws-ap-southeast-1.neon.tech/neondb?sslmode=require" npm run db:seed:demo
     ```
3. Tạo nhánh con `demo` tách ra từ nhánh `seed`, chọn **Current data**, **tắt hạn tự xóa**:
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
   - `DATABASE_URL`: URL dạng pooled của nhánh `demo` **với role `erp_app`** (chứa `-pooler` trong hostname, có `sslmode=require`).
   - Không đặt `DATABASE_URL_UNPOOLED` hay `DATABASE_URL_MIGRATE` (URL owner) trên Vercel.
   - `BETTER_AUTH_SECRET`: Chuỗi ngẫu nhiên bảo mật 32 byte (`openssl rand -base64 32`).
   - `BETTER_AUTH_URL`: `https://demo.<tên-miền-công-ty>` hoặc `https://<project-name>.vercel.app`.
   - `PII_ENCRYPTION_KEYS`: `1:<khóa>`, khóa riêng của demo (`openssl rand -base64 32`), không dùng lại của production. Thiếu là app không khởi động.
   - `DEMO_MODE`: `true`.
   - `DB_POOL_MAX`: `5` (phù hợp serverless).
   - `DB_CONNECT_TIMEOUT_SECONDS`: `10` (cho phép compute Neon thức dậy).

### Bước 3: Cấu hình GitHub Secrets (Environment `demo`)

Trên GitHub repository, vào **Settings → Environments**, tạo environment tên `demo` và thêm các secret sau:

| Secret Name | Mô tả |
|---|---|
| `NEON_API_KEY` | API Key cá nhân từ Neon Console (Account Settings → API Keys) |
| `NEON_PROJECT_ID` | Project ID của project `scaffolding-erp-demo` trên Neon |
| `DEMO_SEED_DATABASE_URL` | **Owner** (`neondb_owner`), URL trực tiếp (unpooled) của nhánh `seed`: migrate và seed |
| `DEMO_DATABASE_URL_UNPOOLED` | **Owner** (`neondb_owner`), URL trực tiếp (unpooled) của nhánh `demo`: migrate khi không reset |
| `DEMO_DATABASE_URL` | **Role app `erp_app`**, URL pooled của nhánh `demo`: kiểm tra toàn vẹn sổ kho |
| `DEV_SEED_PASSWORD` | Mật khẩu mẫu khởi tạo cho các tài khoản demo |
| `DEMO_URL` | Đường dẫn ứng dụng demo (ví dụ: `https://scaffolding-erp-demo.vercel.app`) |
| `VERCEL_DEPLOY_HOOK` | Deploy Hook URL tạo từ Vercel (Project Settings → Git → Deploy Hooks) |

Không cần `BETTER_AUTH_SECRET` và `PII_ENCRYPTION_KEYS` trên GitHub: bước nạp dữ liệu mẫu chỉ băm mật khẩu, không ký phiên, không lưu CCCD, nên workflow tự sinh chuỗi dùng một lần. Secret thật chỉ đặt trên Vercel.

### Bước 4: Chuyển demo đang chạy sang role app (change `db-least-privilege`, làm một lần)

Demo dựng trước 01/11/2026 chạy bằng `neondb_owner`. Làm đúng thứ tự, demo không bị ngắt cho tới bước 5:

1. SQL Editor, nhánh **`seed`**, role `neondb_owner`: `CREATE ROLE erp_app LOGIN PASSWORD '<mạnh>';`.
2. Merge PR có change `db-least-privilege`. Vercel deploy code mới; `DATABASE_URL` vẫn là owner nên app vẫn chạy.
3. Actions → **Deploy Demo**, bật `reset_demo_branch`: migrate + cấp quyền trên `seed`, rồi reset `demo` từ `seed` (nhận role + quyền). Dữ liệu người thử trên `demo` mất như reset hằng đêm.
4. Lấy URL pooled của `erp_app` trên nhánh `demo` (Neon Console → Connect, chọn role `erp_app`, bật Connection pooling; hoặc thay user/mật khẩu trong URL owner). Kiểm bằng `psql "<URL>"`:
   - `UPDATE inventory_ledger SET quantity = quantity;`, `DELETE FROM activity_log;`, `ALTER TABLE inventory_ledger DISABLE TRIGGER ALL;`, `SET session_replication_role = replica;` → đều báo `permission denied` hoặc `must be owner`.
   - `SELECT count(*) FROM item;` → chạy được.
5. Vercel: đổi `DATABASE_URL` sang URL đó, xóa `DATABASE_URL_UNPOOLED`, Redeploy. Kiểm `/api/health` trả 200 và đăng nhập `giamdoc`.
6. GitHub environment `demo`: đổi giá trị `DEMO_DATABASE_URL` sang URL `erp_app`. Chạy tay **Demo Reset** để kiểm `inventory:check` bằng role app.

**Quay lui:** đổi `DATABASE_URL` trên Vercel về URL owner cũ và Redeploy. Role và quyền để nguyên không hại gì.

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

**Tự chạy khi có migration mới:** Vercel tự deploy mỗi lần merge vào `main`. Vì vậy, khi merge có đổi `drizzle/**`, workflow **Deploy Demo** tự chạy: migrate nhánh `seed`, migrate nhánh `demo`, rồi kiểm `/api/health`. Lần tự chạy này không nạp lại dữ liệu mẫu, không reset `demo` và không gọi Deploy Hook, vì Vercel đã tự deploy. Trong khoảng một đến hai phút giữa lúc Vercel deploy xong và lúc migrate xong, demo có thể lỗi.

**Chạy tay:** dùng khi cần nạp thêm dữ liệu mẫu mới (change có thêm `sample.ts`) hoặc làm mới nhánh `demo`:
1. Vào tab **Actions** trên GitHub.
2. Chọn workflow **Deploy Demo**.
3. Chọn các tùy chọn:
   - `reseed`: Chọn `true` nếu có bảng mới cần nạp lại dữ liệu mẫu vào nhánh `seed`.
   - `reset_demo_branch`: Chọn `true` nếu muốn làm mới nhánh `demo` theo schema mới của `seed`.
4. Bấm **Run workflow**. Quy trình sẽ chạy tuần tự:
   - Chạy `db:migrate` bằng owner trên nhánh `seed` (cấp lại quyền cho `erp_app`; thiếu role thì dừng, xem Bước 1).
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

### 3. Không đăng nhập được, log Vercel báo `column ... does not exist` hoặc `relation ... does not exist`
- **Nguyên nhân**: code trên Vercel mới hơn schema của DB demo (migration chưa chạy trên Neon). Đã gặp ngày 06/11/2026: thiếu `user.contract_scope`, `return_photo`.
- **Khắc phục**: Actions → **Deploy Demo**, bật `reset_demo_branch` (và `reseed` nếu muốn có dữ liệu mẫu của change mới). Từ 06/11/2026 workflow tự chạy khi merge có đổi `drizzle/**`; nếu vẫn gặp, xem run Deploy Demo gần nhất có đỏ không.

### 4. Người dùng vô tình thay đổi mật khẩu
- Khi `DEMO_MODE=true`, ứng dụng chặn hoàn toàn thao tác đổi mật khẩu trên giao diện (`/change-password` và API `/api/me/password`).
- Nếu vô tình bị đổi bằng cách khác, chỉ cần kích hoạt workflow **Demo Reset** để đưa mật khẩu 5 vai trò về mặc định.

### 5. Mọi trang báo lỗi, `/api/health` không trả lời, log Vercel báo `Cấu hình môi trường sai`
- **Hiện tượng**: Vercel build xanh (READY) nhưng mọi request lỗi; log runtime (route `/middleware`) có `ConfigError ... Cấu hình môi trường sai: - <TÊN_BIẾN>: thiếu biến này`. Workflow **Demo Reset** đỏ ở bước kiểm `/api/health`.
- **Nguyên nhân**: change mới thêm biến bắt buộc vào `src/lib/env.ts` nhưng biến chưa đặt trên Vercel. App kiểm biến lúc khởi động nên thiếu là không chạy. Đã gặp ngày 10–11/11/2026: thiếu `PII_ENCRYPTION_KEYS` sau khi merge `personal-data-protection` bước 1.
- **Khắc phục**:
  1. Đặt biến còn thiếu cho Production (giá trị theo mục Bước 2). Với khóa bí mật, tạo và gửi thẳng qua CLI để khóa không hiện ra màn hình:
     ```bash
     printf '1:%s' "$(openssl rand -base64 32)" | vercel env add PII_ENCRYPTION_KEYS production --sensitive
     ```
  2. Redeploy bản production mới nhất (Vercel → Deployments → Redeploy, hoặc `vercel redeploy <url-deploy> --target production`).
  3. Kiểm `/api/health` trả 200 và đăng nhập `giamdoc`.
- **Phòng tránh**: PR thêm biến bắt buộc phải đặt biến trên Vercel (và GitHub environment nếu workflow cần) **trước khi merge**, ghi rõ trong mô tả PR.
