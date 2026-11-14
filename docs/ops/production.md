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
| `DATABASE_URL` | URL có Pooler của Neon, **role app `erp_app`** | Chứa `-pooler`, `sslmode=require`. Không dùng `neondb_owner` |
| `BETTER_AUTH_SECRET` | Khóa ký phiên đăng nhập (32 bytes) | Độc lập, không trùng Demo |
| `BETTER_AUTH_URL` | `https://erp.<tên-miền-công-ty>` | Bắt buộc ở Production |
| `PII_ENCRYPTION_KEYS` | Khóa mã hóa CCCD, dạng `1:<base64 của 32 byte>` | Bắt buộc, thiếu là không khởi động. Riêng cho từng công ty. Xem `docs/ops/personal-data.md` |
| `DEMO_MODE` | `false` | Giữ nguyên mặc định |
| `DB_POOL_MAX` | `5` | Tối ưu tài nguyên serverless |
| `DB_CONNECT_TIMEOUT_SECONDS` | `10` | Chống timeout khi mạng chập chờn |

**Không bao giờ** đặt `DATABASE_URL_MIGRATE` (hay URL của `neondb_owner`) trên Vercel: app production từ chối khởi động khi thấy biến này (change `db-least-privilege`, 0.2 #36). Bỏ `DATABASE_URL_UNPOOLED` nếu còn.

#### Hai role DB (change `db-least-privilege`)
| Role | Dùng cho | Tạo thế nào |
|---|---|---|
| `neondb_owner` (owner) | Migration, sao lưu, khôi phục | Có sẵn khi tạo project Neon |
| `erp_app` (app) | App, `inventory:check`, `auth:unlock`, `auth:create-director` | **Bằng SQL**, một lần, trên nhánh gốc: SQL Editor (role `neondb_owner`) → `CREATE ROLE erp_app LOGIN PASSWORD '<≥12 ký tự, có hoa, thường, số, ký hiệu>';`. Không tạo qua Console/Roles: role tạo ở đó tự có `neon_superuser` (đọc/ghi mọi bảng) |

- Quyền của `erp_app` do `npm run db:migrate` cấp lại mỗi lần chạy: đọc/ghi mọi bảng, **chỉ `SELECT, INSERT`** trên `inventory_ledger`, `activity_log`, `scrap_price`; không TRUNCATE, không đổi cấu trúc bảng. Role chưa có thì migrate báo lỗi.
- Lấy URL `erp_app`: Neon Console → **Connect** → chọn role `erp_app` (bật Connection pooling cho `PROD_DATABASE_URL`/Vercel), hoặc thay user/mật khẩu trong URL của owner.
- Kiểm tay sau khi tạo (bằng URL `erp_app`): `UPDATE inventory_ledger SET quantity = quantity`, `DELETE FROM activity_log`, `ALTER TABLE inventory_ledger DISABLE TRIGGER ALL`, `SET session_replication_role = replica` đều phải báo `permission denied` / `must be owner`; `SELECT count(*) FROM item` chạy được.

#### GitHub Secrets (Environment: `production`)
- `PROD_DATABASE_URL_MIGRATE`: URL trực tiếp (không pooler) của **owner** `neondb_owner`, chạy migration & sao lưu.
- `PROD_DATABASE_URL`: URL của **`erp_app`**, kiểm tra số dư kho hằng đêm.
- `NEON_API_KEY`: API Key quyền quản trị project Neon.
- `NEON_PROJECT_ID`: Project ID của `scaffolding-erp-prod`.
- `VERCEL_DEPLOY_HOOK`: Webhook kích hoạt deploy Production trên Vercel.
- `BACKUP_ENCRYPTION_KEY`: Khóa mã hóa file sao lưu (AES-256-CBC).
- `PROD_URL`: Đường dẫn URL Production để kiểm tra trạng thái (`/api/health`).

#### GitHub Secrets (Environment: `production-pii`)

Chỉ workflow `pii-maintenance.yml` dùng. Environment này bắt buộc chủ repo duyệt từng lần chạy và chỉ chạy từ `main`. **Không** đặt khóa CCCD ở environment `production`.

- `PROD_PII_ENCRYPTION_KEYS`: cùng giá trị `PII_ENCRYPTION_KEYS` trên Vercel Production.
- `PROD_DATABASE_URL`: cùng URL `erp_app` như ở environment `production` (không dùng URL owner).

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
   - Chạy migration bằng owner (`PROD_DATABASE_URL_MIGRATE` → biến `DATABASE_URL_MIGRATE`), rồi cấp lại quyền cho `erp_app`.
   - Kích hoạt Vercel Deploy Hook để cập nhật mã nguồn mới.
   - Xác thực trạng thái ứng dụng qua endpoint `/api/health`.
   - Kiểm tra tính toàn vẹn sổ kho sau deploy bằng `npm run inventory:check`.

---

## 3. Lịch Sao lưu & Giám sát Tự động

### 3.0. Bật lịch chạy hằng đêm
- Lịch của `backup.yml` và `inventory-check.yml` chỉ chạy khi biến repo **`PRODUCTION_READY`** = `true`; chưa đặt thì job bị bỏ qua (không báo lỗi).
- Bật sau khi đã thêm secret ở mục 1.2: GitHub → Settings → Secrets and variables → Actions → tab **Variables** → New repository variable `PRODUCTION_READY` = `true`. Rồi chạy tay hai workflow (Run workflow) để kiểm tra.
- Chạy tay luôn chạy, kể cả khi chưa bật; thiếu secret thì fail.

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

  # 2. Phục hồi vào PostgreSQL bằng role OWNER của DB đích
  pg_restore -v --clean --no-owner --no-privileges -d "<URL owner của DB đích>" restore.dump

  # 3. Cấp lại quyền cho erp_app (bản sao lưu không mang theo quyền)
  DATABASE_URL_MIGRATE="<URL owner của DB đích>" npm run db:migrate
  ```
- Bản sao lưu chạy `--no-privileges`: khôi phục xong, `erp_app` **không có quyền gì** cho tới khi chạy bước 3. DB/nhánh đích phải có sẵn role `erp_app` (chưa có thì tạo bằng SQL như mục 1.2). Chỉ trỏ `DATABASE_URL` trên Vercel vào DB đích sau bước 3.
- Cách 1 (PITR) và nhánh `pre-deploy-*` chép cả role lẫn quyền, không cần bước 3.

> **Dữ liệu cá nhân:** khôi phục bản sao lưu phải có `PII_ENCRYPTION_KEYS` còn hiệu lực lúc sao lưu. Trước khi mở cho người dùng, ẩn danh lại những người trong sổ yêu cầu xóa (`docs/ops/personal-data.md` mục 8).

### Sự cố 5: Khóa tài khoản do nhập sai mật khẩu quá 5 lần
- **Cách xử lý**:
  Quản trị viên chạy lệnh mở khóa tài khoản:
  ```bash
  # Mở khóa cho một tài khoản cụ thể
  DATABASE_URL="<PROD_DATABASE_URL>" npm run auth:unlock -- --username <tên_đăng_nhập>

  # Mở khóa toàn bộ hệ thống
  DATABASE_URL="<PROD_DATABASE_URL>" npm run auth:unlock -- --all
  ```

### Sự cố: Mất điện thoại xác thực 2 lớp

Giám đốc, Kế toán và tài khoản có cờ Admin hệ thống phải bật xác thực 2 lớp.

**Trước khi gỡ, luôn xác minh đúng người yêu cầu:** gặp mặt hoặc gọi vào số đã biết. Không làm theo tin nhắn.

1. Người đó **còn mã dự phòng**: đăng nhập bằng mã dự phòng, vào **Xác thực 2 lớp → Đổi điện thoại**. Không cần ai giúp.
2. Hết mã dự phòng: **admin hệ thống** vào **Cài đặt → Người dùng**, chọn **Gỡ xác thực 2 lớp** ở dòng của người đó, nhập mật khẩu và mã của chính admin.
3. Admin cũng mất điện thoại, hoặc chưa ai có cờ: người giữ quyền vào DB chạy lệnh cứu hộ:
   ```bash
   DATABASE_URL="<PROD_DATABASE_URL>" npm run auth:reset-2fa -- --username <tên_đăng_nhập>
   ```
4. Sau khi gỡ, người đó đăng nhập và bật lại ngay. Kiểm tra dòng nhật ký ở **Nhật ký thao tác** (D18).

Nhập sai mã nhiều lần thì chờ 15 phút hoặc chạy `auth:unlock` (mục trên); lệnh này gỡ cả khóa do sai mã.

**Cờ Admin hệ thống** chỉ đặt bằng lệnh, không có trên giao diện. Khi lên production, đặt cho ít nhất một người:

```bash
DATABASE_URL="<PROD_DATABASE_URL>" npm run auth:set-admin -- --username <tên_đăng_nhập>
```

Gỡ cờ: thêm `--off`. Nên đặt cho hơn một người để khi một người mất máy vẫn có người gỡ giúp.

### Sự cố 6: Quy trình Xoay vòng Khóa bảo mật (Secret Rotation)
Khi có sự cố rò rỉ secret hoặc nhân sự quản trị rời khỏi dự án:
1. **Đổi khóa ký phiên** (bí mật xác thực 2 lớp được mã hóa bằng khóa này, đổi sai cách thì Giám đốc và Kế toán không đăng nhập được):
   - Sinh chuỗi ngẫu nhiên mới: `openssl rand -base64 32`.
   - **Không xóa `BETTER_AUTH_SECRET` cũ.** Thêm biến `BETTER_AUTH_SECRETS` trên Vercel Production: lần đầu `1:<khóa mới>`; lần sau `2:<khóa mới hơn>,1:<khóa trước>`. Redeploy.
   - *Xoay định kỳ*: làm như trên là đủ, dữ liệu cũ vẫn đọc được.
   - *Nghi lộ khóa*: bí mật xác thực 2 lớp coi như đã lộ. Sau khi đổi khóa, chạy `npm run auth:reset-2fa` cho mọi Giám đốc, Kế toán, admin rồi yêu cầu họ bật lại.
   - *Hệ quả*: Toàn bộ phiên đăng nhập của người dùng sẽ hết hạn và buộc phải đăng nhập lại.
2. **Đổi Mật khẩu Database trên Neon**:
   - Role app: SQL Editor (owner) → `ALTER ROLE erp_app PASSWORD '<mật khẩu mới>';` → cập nhật `DATABASE_URL` trên Vercel và secret `PROD_DATABASE_URL`, Redeploy.
   - Role owner: Neon Console → **Roles** → `neondb_owner` → **Reset Password** → cập nhật secret `PROD_DATABASE_URL_MIGRATE`. Vercel không chứa URL owner nên không cần redeploy.
3. **Đổi `NEON_API_KEY`**: Neon Console → Account settings → **API keys** → tạo khóa mới, cập nhật GitHub Secret, rồi **Revoke** khóa cũ.
4. **Đổi `VERCEL_DEPLOY_HOOK`**: Vercel → Project → Settings → Git → **Deploy Hooks** → tạo hook mới, cập nhật GitHub Secret, xóa hook cũ.
5. **Đổi `PII_ENCRYPTION_KEYS`**: theo `docs/ops/personal-data.md` mục 2. Nghi lộ dữ liệu thì làm theo `docs/ops/data-breach.md`.
6. **Đổi `BACKUP_ENCRYPTION_KEY`**: sinh khóa mới (`openssl rand -base64 32`), cập nhật GitHub Secret. **Giữ khóa cũ** ở nơi an toàn cho tới khi các bản sao lưu mã hóa bằng nó hết hạn lưu giữ, nếu không sẽ không giải mã được.

#### Lịch xoay vòng định kỳ (kể cả khi không có sự cố)

| Secret | Chu kỳ | Ghi chú |
|---|---|---|
| `BETTER_AUTH_SECRET` | 12 tháng | Mọi người phải đăng nhập lại: làm ngoài giờ làm việc |
| Mật khẩu DB `erp_app` và `neondb_owner` | 6 tháng | |
| `NEON_API_KEY` | 6 tháng | |
| `VERCEL_DEPLOY_HOOK` | 12 tháng | |
| `BACKUP_ENCRYPTION_KEY` | 12 tháng | Giữ khóa cũ như bước 6 |
| `PII_ENCRYPTION_KEYS` | 12 tháng | Giữ khóa cũ tới khi bản sao lưu dùng khóa đó hết hạn |

#### Lịch việc dữ liệu cá nhân

| Việc | Chu kỳ | Cách làm |
|---|---|---|
| `pii:purge`: xóa CCCD, hồ sơ thuế quá hạn | 12 tháng | Workflow **Personal Data Maintenance** → `purge`; lưu log vào hồ sơ tuân thủ |

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
