# Vận hành & Ứng phó Sự cố Production (Production Runbook)

Tài liệu quy chuẩn vận hành, bảo mật và quy trình ứng phó khẩn cấp cho hệ thống **Scaffolding ERP Production** trên hạ tầng **Vercel + Neon**.

---

## 1. Kiến trúc & Nguyên tắc Vận hành

### 1.1. Hạ tầng tách biệt hoàn toàn
- **Vercel Project**: `scaffolding-erp-prod` (Vùng serverless `sin1` - Singapore).
- **Neon Project**: `scaffolding-erp-prod` (Postgres 17, `aws-ap-southeast-1` - Singapore).
- **Tên miền chính**: `https://erp.<tên-miền-công-ty>` (HTTPS & HSTS tự động).
- **Quy tắc bất biến**:
  - Không bao giờ kết nối chéo giữa Demo/Staging và Production.
  - Sổ kho `inventory_ledger` chỉ ghi thêm (`INSERT`), nghiêm cấm mọi thao tác sửa (`UPDATE`), xóa (`DELETE`), hay dọn sạch (`TRUNCATE`).

### 1.2. Danh mục Biến Môi trường & GitHub Secrets

#### Vercel Production Environment Variables
| Biến | Ý nghĩa | Ghi chú |
|---|---|---|
| `DATABASE_URL` | URL kết nối có Pooler của Neon | Chứa `-pooler`, `sslmode=require` |
| `DATABASE_URL_UNPOOLED` | URL kết nối trực tiếp không qua Pooler | Phục vụ migration |
| `BETTER_AUTH_SECRET` | Khóa ký phiên đăng nhập (32 bytes) | Độc lập, không trùng Demo |
| `BETTER_AUTH_URL` | `https://erp.<tên-miền-công-ty>` | Bắt buộc ở Production |
| `DEMO_MODE` | `false` | Giữ nguyên mặc định |
| `DB_POOL_MAX` | `5` | Tối ưu tài nguyên serverless |
| `DB_CONNECT_TIMEOUT_SECONDS` | `10` | Chống timeout khi mạng chập chờn |

#### GitHub Secrets (Environment: `production`)
- `PROD_DATABASE_URL_UNPOOLED`: URL trực tiếp chạy migration & sao lưu.
- `PROD_DATABASE_URL`: URL kiểm tra số dư kho hằng đêm.
- `NEON_API_KEY`: API Key quyền quản trị project Neon.
- `NEON_PROJECT_ID`: Project ID của `scaffolding-erp-prod`.
- `VERCEL_DEPLOY_HOOK`: Webhook kích hoạt deploy Production trên Vercel.
- `BACKUP_ENCRYPTION_KEY`: Khóa mã hóa file sao lưu (AES-256-CBC).
- `PROD_URL`: Đường dẫn URL Production để kiểm tra trạng thái (`/api/health`).

---

## 2. Quy trình Triển khai Bản mới (`deploy-production.yml`)

1. **Chuẩn bị bản phát hành**:
   - Merge các tính năng/chores đã kiểm thử vào nhánh `main`.
   - Gắn thẻ phiên bản Git tag theo chuẩn Semantic Versioning:
     ```bash
     git tag v1.0.0
     git push origin v1.0.0
     ```
2. **Xét duyệt bắt buộc (Environment Protection)**:
   - Workflow `Deploy Production` được kích hoạt và chuyển vào trạng thái **Waiting for review**.
   - Người phụ trách kỹ thuật hoặc Giám đốc kiểm tra changelog và bấm **Approve and deploy**.
3. **Các bước tự động**:
   - Tạo nhánh sao lưu tức thời trên Neon: `pre-deploy-<tag>-<run_id>`.
   - Chạy migration an toàn trên `DATABASE_URL_UNPOOLED`.
   - Kích hoạt Vercel Deploy Hook để cập nhật mã nguồn mới.
   - Xác thực trạng thái ứng dụng qua endpoint `/api/health`.
   - Kiểm tra tính toàn vẹn sổ kho sau deploy bằng `npm run inventory:check`.

---

## 3. Lịch Sao lưu & Giám sát Tự động

### 3.1. Sao lưu định kỳ (`backup.yml`)
- Chạy tự động lúc **02:00 AM (giờ Việt Nam)** mỗi ngày (19:00 UTC).
- Xuất toàn bộ dữ liệu ra định dạng nhị phân nén của PostgreSQL (`pg_dump -Fc`).
- Mã hóa tệp tin bằng thuật toán AES-256-CBC với `BACKUP_ENCRYPTION_KEY`.
- Tạo mã băm kiểm tra toàn vẹn SHA-256.
- Lưu trữ an toàn trên GitHub Artifacts với thời hạn lưu trữ 30 ngày (và đồng bộ sang kho lưu trữ đám mây ngoài).

### 3.2. Đối soát sổ kho hằng đêm (`inventory-check.yml`)
- Chạy tự động lúc **03:00 AM (giờ Việt Nam)** mỗi ngày (20:00 UTC).
- Đối chiếu số lượng vật tư tồn kho thực tế so với tổng luồng phát sinh nhập/xuất trong `inventory_ledger`.
- Báo động ngay lập tức nếu phát hiện bất kỳ sai lệch số liệu nào.

---

## 4. Cẩm nang Xử lý Sự cố Khẩn cấp (Troubleshooting Runbook)

### Sự cố 1: Ứng dụng báo lỗi 500 / 502 / Không truy cập được
- **Dấu hiệu**: Người dùng không vào được trang hoặc nhận thông báo lỗi máy chủ.
- **Quy trình xử lý**:
  1. Kiểm tra trạng thái endpoint giám sát:
     ```bash
     curl -i https://erp.<tên-miền>/api/health
     ```
  2. Xem nhật ký thời gian thực trên Vercel Dashboard (**Project → Logs**) để xác định nguyên nhân (lỗi cấu hình, thiếu biến môi trường, hay lỗi kết nối database).
  3. **Quay lui khẩn cấp (Instant Rollback)**:
     - Trên Vercel Console: Chọn **Deployments** → Chọn bản deploy thành công gần nhất → Bấm menu `...` → Chọn **Promote to Production** (quá trình rollback diễn ra trong dưới 10 giây).
     - Nếu lỗi do migration database gây ra: Vào Neon Console khôi phục trạng thái database về nhánh `pre-deploy-<tag>` đã tạo trước khi deploy.

### Sự cố 2: Lỗi kết nối Database ("Connection Terminated" / "Timed Out")
- **Nguyên nhân**:
  - Số lượng kết nối vượt quá ngưỡng giới hạn pool của Neon.
  - Database compute bị ngắt quãng hoặc gặp sự cố mạng xuyên biên giới.
- **Quy trình xử lý**:
  1. Đăng nhập [Neon Console](https://console.neon.tech/), kiểm tra trạng thái **Compute: Active** và biểu đồ **Active Connections**.
  2. Đảm bảo biến `DATABASE_URL` trên Vercel luôn sử dụng endpoint dạng pooled (`-pooler`).
  3. Tạm thời tăng biến `DB_CONNECT_TIMEOUT_SECONDS=15` trên Vercel nếu đường truyền quốc tế bị nghẽn.

### Sự cố 3: Phát hiện lệch số liệu sổ kho (`inventory:check` báo đỏ)
- **Nguyên nhân**: Sai lệch giữa tồn kho hiển thị và luồng lịch sử giao dịch.
- **Quy trình xử lý**:
  1. Chạy lệnh kiểm tra chi tiết để xác định mã vật tư và kho bãi bị lệch:
     ```bash
     DATABASE_URL="<PROD_DATABASE_URL>" npm run inventory:check
     ```
  2. Mở màn hình **Nhật ký hoạt động (`/settings/activity`)** để rà soát các phiếu nhập/sửa chữa/điều chỉnh vừa thực hiện trong ngày.
  3. Sổ kho không thể sửa hoặc xóa trực tiếp: Kế toán thực hiện lập **Phiếu điều chỉnh số dư kho (`/inventory/adjustments`)** để đưa số lượng sổ kho và giá vốn về đúng thực tế.

### Sự cố 4: Khôi phục Dữ liệu (Disaster Recovery Drill)

#### Cách 1: Khôi phục theo thời điểm trên Neon (Point-in-Time Recovery - PITR)
- Neon lưu trữ log giao dịch cho phép khôi phục về từng giây trong vòng 7–30 ngày:
  1. Vào Neon Console → Chọn Project `scaffolding-erp-prod`.
  2. Chọn tab **Branches** → Bấm **Create branch from point in time**.
  3. Chọn thời điểm chính xác trước khi xảy ra sự cố (ví dụ: `2026-11-01 14:30:00 UTC`).
  4. Sau khi kiểm tra dữ liệu trên nhánh mới chính xác, chuyển hướng `DATABASE_URL` trên Vercel sang nhánh mới này.

#### Cách 2: Khôi phục từ tệp sao lưu (`backup.dump`)
- Sử dụng file sao lưu được giải mã để phục hồi vào database mới:
  ```bash
  # 1. Giải mã tệp sao lưu
  openssl enc -d -aes-256-cbc -pbkdf2 -in scaffolding_erp_prod_*.dump.enc \
    -out restore.dump -pass env:BACKUP_ENCRYPTION_KEY

  # 2. Phục hồi vào PostgreSQL
  pg_restore -v --clean --no-owner --no-privileges -d "<TARGET_DATABASE_URL>" restore.dump
  ```

### Sự cố 5: Khóa tài khoản do nhập sai mật khẩu quá 5 lần
- **Cách xử lý**:
  Quản trị viên chạy lệnh mở khóa tài khoản:
  ```bash
  # Mở khóa cho một tài khoản cụ thể
  DATABASE_URL="<PROD_DATABASE_URL_UNPOOLED>" npm run auth:unlock -- --username <tên_đăng_nhập>

  # Mở khóa toàn bộ hệ thống
  DATABASE_URL="<PROD_DATABASE_URL_UNPOOLED>" npm run auth:unlock -- --all
  ```

### Sự cố 6: Quy trình Xoay vòng Khóa bảo mật (Secret Rotation)
Khi có sự cố rò rỉ secret hoặc nhân sự quản trị rời khỏi dự án:
1. **Đổi `BETTER_AUTH_SECRET`**:
   - Sinh chuỗi ngẫu nhiên mới: `openssl rand -base64 32`.
   - Cập nhật biến môi trường trên Vercel Production và Redeploy.
   - *Hệ quả*: Toàn bộ phiên đăng nhập của người dùng sẽ hết hạn và buộc phải đăng nhập lại.
2. **Đổi Mật khẩu Database trên Neon**:
   - Vào Neon Console → **Roles** → Chọn user `erp_prod` → Bấm **Reset Password**.
   - Cập nhật `DATABASE_URL` và `DATABASE_URL_UNPOOLED` trên Vercel và GitHub Secrets.
3. **Đổi `NEON_API_KEY`**: Neon Console → Account settings → **API keys** → tạo khóa mới, cập nhật GitHub Secret, rồi **Revoke** khóa cũ.
4. **Đổi `VERCEL_DEPLOY_HOOK`**: Vercel → Project → Settings → Git → **Deploy Hooks** → tạo hook mới, cập nhật GitHub Secret, xóa hook cũ.
5. **Đổi `BACKUP_ENCRYPTION_KEY`**: sinh khóa mới (`openssl rand -base64 32`), cập nhật GitHub Secret. **Giữ khóa cũ** ở nơi an toàn cho tới khi các bản sao lưu mã hóa bằng nó hết hạn lưu giữ, nếu không sẽ không giải mã được.

#### Lịch xoay vòng định kỳ (kể cả khi không có sự cố)

| Secret | Chu kỳ | Ghi chú |
|---|---|---|
| `BETTER_AUTH_SECRET` | 12 tháng | Mọi người phải đăng nhập lại: làm ngoài giờ làm việc |
| Mật khẩu DB `erp_prod` | 6 tháng | |
| `NEON_API_KEY` | 6 tháng | |
| `VERCEL_DEPLOY_HOOK` | 12 tháng | |
| `BACKUP_ENCRYPTION_KEY` | 12 tháng | Giữ khóa cũ như bước 5 |

Ngay lập tức (không chờ chu kỳ) khi: nghi lộ secret, người có quyền quản trị nghỉ việc, hoặc secret lỡ xuất hiện trong log, chat, commit.

### Tự host (không chạy trên Vercel)

Nếu chuyển sang máy chủ riêng, phải có đủ các điều kiện sau trước khi mở cho người dùng:

- **Reverse proxy bắt buộc** (Nginx, Caddy...) đứng trước `next start`. Proxy phải **ghi đè** header `X-Forwarded-For` bằng địa chỉ thật của máy khách (vd. Nginx `proxy_set_header X-Forwarded-For $remote_addr;`), không nối thêm vào giá trị trình duyệt gửi lên.
  - Lý do: giới hạn đăng nhập (`src/lib/auth/rate-limit.ts`) và báo lỗi lấy IP từ **phần tử cuối** của `X-Forwarded-For`. Không có proxy, hoặc qua nhiều lớp proxy mà lớp ngoài cùng không ghi đè, thì người ngoài giả được IP và lách giới hạn.
- **HTTPS** ở proxy. App đã gửi `Strict-Transport-Security` (HSTS: trình duyệt nhớ chỉ dùng https cho tên miền trong 1 năm) ở mọi bản không phải dev; chỉ bật tên miền khi chứng chỉ đã ổn định.
- Cổng của `next start` và PostgreSQL **không** mở ra internet, chỉ proxy gọi được.

---

## 5. Ma trận Phân cấp & Liên lạc Khẩn cấp (Contact Matrix)

| Cấp độ | Định nghĩa | Thời gian phản hồi | Người phụ trách chính |
|---|---|---|---|
| **S1 (Nghiêm trọng)** | Ứng dụng ngừng hoạt động hoàn toàn, mất kết nối database, nghi ngờ rò rỉ dữ liệu | ≤ 15 phút | Trưởng nhóm Kỹ thuật & Giám đốc |
| **S2 (Cao)** | Lệch sổ kho, một số vai trò kho bãi không thao tác được | ≤ 1 giờ | Kỹ sư Vận hành & Kế toán trưởng |
| **S3 (Bình thường)** | Lỗi giao diện nhỏ, yêu cầu mở khóa tài khoản đơn lẻ | ≤ 4 giờ | Kỹ thuật viên hỗ trợ |
