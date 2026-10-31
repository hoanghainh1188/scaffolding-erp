# Kế hoạch deploy bản demo

> Trạng thái: **đã chốt nơi chạy: Vercel + Neon** (31/10/2026). Chưa deploy, chưa sửa code.
> Issue tổng: [#82](https://github.com/hoanghainh1188/scaffolding-erp/issues/82).
> Kế hoạch production: [`deploy-production-plan.md`](deploy-production-plan.md).
> Mục tiêu: một bản chạy trên internet để khách hàng / nhân viên thử, dữ liệu giả, tự dựng lại định kỳ. **Không phải production** (production cần thêm K4, `data-migration` và các change nghiệp vụ còn lại).

## 0. Hiện trạng liên quan (đã kiểm tra trong repo)

| Mục | Hiện trạng | Ảnh hưởng tới deploy |
|---|---|---|
| Nhánh | `main` sạch; K3 `login-lockout-hardening` đã merge và archive (PR #72, #73) | Không còn change dở chặn deploy |
| Build | `npm run build` chạy **không cần DB** (job `static` của CI không có Postgres) | Vercel build được mà không cần mở DB lúc build |
| Cấu hình | `src/lib/env.ts` kiểm tra khi server khởi động (`instrumentation.ts`); production **bắt buộc** `BETTER_AUTH_URL` | Thiếu biến là function lỗi ngay, báo tên biến. Bản preview có URL khác → xem mục 2 |
| Kết nối DB | `src/db/client.ts`: `postgres` (postgres.js), một pool mỗi tiến trình, `connect_timeout: 3`, mặc định 10 kết nối, prepared statement bật | Trên serverless phải giảm số kết nối, đi qua pooler của Neon, cho kết nối rảnh tự đóng → **cần change** (mục 7) |
| Migration | `npm run db:migrate` (`src/db/migrate.mts`, SQL trong `drizzle/`, 0000–0010), đọc `DATABASE_URL` | Phải chạy bằng URL **trực tiếp** (không qua pooler) |
| Seed | `npm run db:seed:dev`: 5 tài khoản (`giamdoc`, `ketoan`, `kinhdoanh`, `thukho`, `xuong`, không bắt đổi mật khẩu) + dữ liệu mẫu D3/D3b/D9–D13/D16/D18. **Từ chối chạy khi `NODE_ENV=production`**. Không có CCCD/STK thật (nhật ký mẫu chỉ có STK đã che) | Chạy từ máy local hoặc GitHub Actions với `NODE_ENV=development`, trỏ vào nhánh Neon `seed` |
| Header bảo mật | `next.config.ts`: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (camera cho phép). CSP nonce ở `src/proxy.ts`, có `upgrade-insecure-requests` khi production | Vercel tự có HTTPS và HSTS trên tên miền của nó; giữ nguyên CSP |
| Giới hạn đăng nhập | 20 lần/phút/IP; IP lấy từ **mục cuối** của `X-Forwarded-For` (`src/lib/auth/rate-limit.ts`); khóa sai mật khẩu theo (tài khoản, IP) | Vercel **ghi đè** `X-Forwarded-For` bằng IP thật của người dùng (chống giả mạo) → code hiện tại đúng. Không đặt proxy khác (Cloudflare đám mây cam) phía trước |
| Sổ kho | Trigger chặn UPDATE/DELETE/TRUNCATE `inventory_ledger` | Reset demo = dựng lại cả DB → dùng **reset nhánh Neon** (mục 4) |
| Kiểm tra sống | `GET /api/health` (không cần đăng nhập, hỏi DB thật) | Dùng cho giám sát và kiểm tra sau deploy |
| PWA `/m` | Có `manifest.webmanifest`, **chưa có service worker**; quét QR dùng camera + `public/vendor/zxing_reader.wasm` (chép khi `npm install` qua `postinstall`) | Vercel chạy `npm install` nên file `.wasm` có mặt; HTTPS có sẵn nên camera chạy được |
| Trang `/dev/components` | Trả 404 ở production (trừ `E2E=1`) | Không đặt `E2E=1` trên Vercel |

## 1. Nơi chạy: Vercel + Neon

Lý do người dùng chọn / điểm mạnh:

- Không phải quản trị máy chủ (hệ điều hành, chứng chỉ, tường lửa).
- Next.js 16 + Cache Components chạy tốt nhất trên Vercel; mỗi lần đẩy `main` là tự deploy.
- Neon có Postgres 17 và **nhánh DB** (branch): dựng lại dữ liệu demo bằng một lệnh "reset từ nhánh cha", mất vài giây.

Cấu hình đề xuất:

| Thành phần | Chọn | Ghi chú |
|---|---|---|
| Vercel | **Pro** (~20 USD/người/tháng) | Gói Hobby chỉ cho dùng cá nhân, phi thương mại; demo cho khách là dùng thương mại → nên dùng Pro (đọc lại điều khoản trước khi chọn) |
| Vùng function | `sin1` (Singapore) | Gần Việt Nam; đặt trong Project Settings hoặc `vercel.json` |
| Neon | Gói **Free** cho demo, lên gói trả phí theo mức dùng nếu thiếu | Vùng `aws-ap-southeast-1` (Singapore), Postgres **17**. Free có giới hạn dung lượng và giờ chạy: kiểm tra lại trên trang giá Neon |
| Fluid compute | Bật (mặc định cho project mới) | Một instance phục vụ nhiều request cùng lúc → pool kết nối được dùng lại |

Chi phí ước lượng: **~20–40 USD/tháng** (Vercel Pro + Neon Free hoặc gói thấp nhất), tên miền riêng tính thêm nếu có.

So với VPS (phương án đã cân nhắc): đắt hơn ~2–4 lần và cần một change nhỏ cho kết nối DB, nhưng ít việc vận hành hơn.

## 2. Biến môi trường và secret

Đặt trong Vercel → Project → Settings → Environment Variables (đánh dấu **Sensitive** cho secret).

| Biến | Production | Preview | Ghi chú |
|---|---|---|---|
| `DATABASE_URL` | URL **pooled** của nhánh Neon `demo` (host có `-pooler`, `sslmode=require`) | URL pooled của nhánh `preview` (hoặc tắt preview) | App dùng URL này |
| `DATABASE_URL_UNPOOLED` | URL trực tiếp nhánh `demo` | URL trực tiếp nhánh `preview` | Chỉ cho migrate (mục 5) |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | giá trị **khác** production | Không dùng lại giá trị `.env.example` |
| `BETTER_AUTH_URL` | `https://demo.<tên-miền>` hoặc `https://<project>.vercel.app` | xem dưới | Bắt buộc ở production |
| `NODE_ENV` | — | — | Vercel tự đặt `production` |
| `DEV_SEED_PASSWORD` | — | — | Chỉ đặt ở nơi chạy seed (GitHub Secrets), không đặt trên Vercel |
| `AUTH_SIGN_IN_LIMIT_PER_MINUTE`, `E2E`, `E2E_PASSWORD`, `TEST_DATABASE_URL` | — | — | **Không đặt** |

Bản preview (mỗi PR một URL): `BETTER_AUTH_URL` cố định không khớp URL preview → cookie/redirect của Better Auth có thể lỗi. Chọn một:

- **Khuyến nghị cho demo: tắt preview deployment** (Settings → Git → chỉ deploy nhánh `main`), hoặc bật Vercel Deployment Protection cho preview và chấp nhận chỉ dùng để xem giao diện.
- Sau này cần preview đăng nhập được: trong change `demo-environment`, lấy `BETTER_AUTH_URL` từ `VERCEL_URL` khi `VERCEL_ENV=preview`, mỗi preview một nhánh Neon (tích hợp Neon ↔ Vercel tự tạo).

Secret khác (GitHub Secrets, environment `demo`): `NEON_API_KEY`, `NEON_PROJECT_ID`, `DEMO_SEED_DATABASE_URL` (URL trực tiếp nhánh `seed`), `DEV_SEED_PASSWORD`, `BETTER_AUTH_SECRET` (cho seed tạo mật khẩu).

## 3. HTTPS, tên miền, header

- Vercel tự cấp HTTPS và HSTS cho `*.vercel.app` và tên miền riêng.
- Tên miền riêng (tùy chọn): thêm `demo.<tên-miền>` trong Project → Domains, tạo bản ghi CNAME theo hướng dẫn. Khi đổi tên miền nhớ đổi `BETTER_AUTH_URL` rồi deploy lại.
- Không bật proxy Cloudflare phía trước (giữ IP thật cho giới hạn đăng nhập).
- CSP: giữ `src/proxy.ts`, không thêm CSP trong `vercel.json`. **Tắt Vercel Toolbar** cho production/preview (script của toolbar không có nonce, CSP sẽ chặn và báo lỗi trong console).
- Thêm `X-Robots-Tag: noindex, nofollow` (qua `headers` trong `vercel.json`, hoặc trong change `demo-environment`) để Google không lập chỉ mục bản demo.

## 4. Dữ liệu demo và reset định kỳ

### Bố trí nhánh Neon

```
main (trống, không dùng trực tiếp)
└── seed      ← migrate + seed; "ảnh chụp" dữ liệu demo sạch
    ├── demo     ← Production của Vercel dùng
    └── preview  ← (tùy chọn) bản preview dùng
```

- `seed`: chạy `db:migrate` rồi `db:seed:dev` một lần (và lại sau mỗi migration mới).
- `demo`: nhánh con của `seed`. Người thử ghi vào đây.
- **Reset** = "reset `demo` từ nhánh cha" (`neonctl branches reset demo --parent`, hoặc API Neon). `demo` trở về đúng dữ liệu của `seed`, giữ nguyên URL kết nối nên **không phải sửa biến trên Vercel**. Sổ kho chỉ ghi thêm không ảnh hưởng: reset thay cả nhánh, không chạy DELETE/TRUNCATE.

### Seed

- **Giai đoạn 1 (không cần change):** `db:seed:dev` như hiện có, chạy với `NODE_ENV=development`, `DATABASE_URL` = URL trực tiếp nhánh `seed`. Đủ 5 vai trò và dữ liệu khớp ảnh thiết kế. Hạn chế: ngày mẫu cố định 27–28/10/2026 (sẽ trông cũ dần).
- **Giai đoạn 2 (change `demo-environment`):** lệnh `db:seed:demo` dời ngày mẫu theo ngày chạy, tên dễ hiểu cho khách.

### Tài khoản demo (5 vai trò)

| Tài khoản | Vai trò | Vào màn |
|---|---|---|
| `giamdoc` | DIRECTOR | `/dashboard` (duyệt, nhật ký D18, người dùng D17) |
| `ketoan` | ACCOUNTANT | `/dashboard` (sửa chữa D12, điều chỉnh giá) |
| `kinhdoanh` | SALES | `/dashboard` (đơn thu mua D2/D3) |
| `thukho` | WAREHOUSE | `/m` (nhập hàng M1–M3, kiểm kê M6) — thử trên điện thoại |
| `xuong` | WORKSHOP | `/m` |

Rủi ro dùng chung tài khoản:

- Người thử **đổi mật khẩu**, hoặc dùng `giamdoc` **khóa / đặt lại mật khẩu** người khác ở D17 → người sau không vào được. Giảm: reset hằng đêm + chạy tay workflow reset; triệt để bằng `DEMO_MODE` trong change `demo-environment`.
- Nhập sai mật khẩu nhiều lần chỉ khóa theo (tài khoản, IP), không chặn người ở IP khác. Gỡ nhanh: chạy `npm run auth:unlock -- --all` với `DATABASE_URL` của nhánh `demo`.

### Lịch reset

- Workflow GitHub Actions `demo-reset.yml`: `schedule` lúc **17:00 UTC (0:00 giờ Việt Nam)** + `workflow_dispatch` (bấm tay khi cần).
- Bước: `neonctl branches reset demo --parent` → gọi `/api/health` = 200 → chạy `npm run inventory:check` trên nhánh `demo` = 0.
- Đặt ở GitHub thay vì Vercel Cron: không phải thêm route API có quyền xóa DB vào app, khóa API Neon không nằm trên Vercel.
- Sau reset mọi người bị đăng xuất (session nằm trong DB). Kết nối cũ trong pool bị Neon cắt; postgres.js tự mở kết nối mới ở request sau (cần kiểm tra khi thử lần đầu, mục 9 bước 6).

## 5. Build, migrate, deploy

### Build và deploy

- Vercel Git integration: đẩy `main` → Vercel tự `npm install` → `npm run build` → bật bản mới. Không cần Dockerfile.
- Node 24: đặt Node.js Version = 24.x trong Project Settings (khớp `engines` và `.nvmrc`).
- Chỉ deploy khi CI xanh: bật "Ignored Build Step"/chờ checks, hoặc đơn giản là chỉ merge PR khi CI xanh (quy trình hiện tại đã như vậy).

### Migration

Thứ tự: **migrate trước, code mới sau**. Hai cách:

1. **Khuyến nghị:** workflow `deploy-demo.yml` (GitHub Actions) chạy khi CI trên `main` xanh:
   1. `db:migrate` trên nhánh `seed` (URL trực tiếp), seed lại nếu có bảng mới cần dữ liệu mẫu.
   2. `db:migrate` trên nhánh `demo` (hoặc reset `demo` từ `seed` để lấy luôn schema mới).
   3. Gọi Vercel Deploy Hook (hoặc `vercel deploy --prod`) để bật bản mới; tắt auto-deploy của Git integration cho `main` để tránh code mới chạy trước migration.
   4. Chờ `/api/health` = 200.
2. Đơn giản hơn: đặt Build Command = `npm run db:migrate && npm run build` chỉ cho Production (`DATABASE_URL` lúc build trỏ URL trực tiếp). Nhược điểm: migration chạy ngay trong lúc bản cũ còn phục vụ, và lỗi build sau migration để DB đi trước code. Chấp nhận được cho demo nếu migration chỉ **thêm** (không đổi tên / xóa cột).

Migration lỗi: Drizzle chạy migration trong transaction nên DB không bị nửa vời; bản cũ vẫn chạy; sửa rồi chạy lại. Tệ nhất: reset `demo` từ `seed`.

Quay lui code: Vercel → Deployments → **Instant Rollback** bản trước (chỉ an toàn khi migration mới không phá bản cũ).

## 6. Backup, giám sát, log

- **Backup:** dữ liệu demo bỏ được. Neon có khôi phục theo thời điểm (point-in-time restore, cửa sổ tùy gói) — đủ cho demo. Nhánh `seed` chính là bản sạch để dựng lại.
- **Giám sát sống:** UptimeRobot hoặc Better Stack (miễn phí) gọi `/api/health` mỗi 5 phút. Lưu ý Neon Free **tự tắt compute khi rảnh** (vài phút không dùng): request đầu sau đó chậm hơn ~vài trăm ms tới 1–2 giây; giám sát 5 phút/lần sẽ giữ compute thức nhưng tốn giờ chạy của gói Free → cân nhắc 15–30 phút/lần.
- **Log:** Vercel → Logs (runtime log, lỗi function). Gói Pro giữ log ngắn ngày; đủ cho demo. Lỗi server đã `console.error` (ví dụ `[auth] session renewal failed`). Theo dõi thao tác người thử qua Nhật ký D18 trong app.
- **Theo dõi lỗi (Sentry…)**: thêm thư viện mới → phải hỏi trước theo `CLAUDE.md`; để sau.
- Bật cảnh báo chi tiêu (Spend Management) trên Vercel và giới hạn mức dùng trên Neon để không phát sinh bất ngờ.

## 7. Phần nào cần OpenSpec change

| Việc | Cần change? | Lý do |
|---|---|---|
| Tạo project Vercel, Neon, nhánh `seed`/`demo`, biến môi trường, tên miền | Không | Cấu hình bên ngoài repo |
| `vercel.json` (vùng `sin1`, header `noindex`), workflow `demo-reset.yml`, `deploy-demo.yml`, tài liệu vận hành `docs/ops/demo.md` | Không (PR hạ tầng thường) | Không đụng `src/`, không đổi nghiệp vụ; vẫn review qua PR |
| **`serverless-db-connection`** (đề xuất K8): `src/db/client.ts` đọc cấu hình pool từ biến môi trường — `max` nhỏ (ví dụ 5), `idle_timeout` (ví dụ 20 giây) để kết nối rảnh tự đóng trước khi function ngủ, `connect_timeout` dài hơn (Neon thức dậy có thể > 3 giây), `prepare` bật/tắt theo pooler; `src/db/migrate.mts` ưu tiên `DATABASE_URL_UNPOOLED`; `src/lib/env.ts` thêm luật cho biến mới | **Có** | Đổi tầng truy cập DB, quy ước 0.2 #33 mục 2 ("mọi truy cập DB đi qua `src/db/client.ts`"), cần test integration. Không thêm `@vercel/functions` (thư viện mới) trừ khi người dùng đồng ý; `idle_timeout` của postgres.js thay được `attachDatabasePool` |
| **`demo-environment`** (đề xuất K9): `DEMO_MODE`, banner "Bản demo — dữ liệu làm mới 0:00 mỗi ngày", chặn đổi mật khẩu / khóa / đặt lại mật khẩu 5 tài khoản demo, `db:seed:demo` (dời ngày), `BETTER_AUTH_URL` theo `VERCEL_URL` cho preview, `noindex` trong metadata | **Có** | Đổi hành vi app và quyền; cần unit + E2E |

K8 phải xong **trước** khi mở demo; K9 làm sau đợt thử đầu được.

## 8. Rủi ro và việc cần làm trước

- **Kết nối DB trên serverless** (lớn nhất): pool hiện tại 10 kết nối/instance, không tự đóng → khi Vercel mở nhiều instance có thể vượt giới hạn kết nối của Neon, hoặc giữ compute Neon thức (tốn giờ chạy). Xử lý bằng K8 + luôn dùng URL `-pooler`.
- **Neon thức dậy chậm** vs `connect_timeout: 3`: request đầu sau khi compute ngủ có thể lỗi "connect timeout" → K8 tăng timeout; hoặc tắt auto-suspend (tốn phí hơn).
- **Prepared statement qua pooler:** postgres.js mặc định dùng prepared statement có tên; PgBouncer của Neon ở chế độ transaction hỗ trợ kiểu này ở bản mới, nhưng phải thử thật. Lỗi kiểu `prepared statement "…" does not exist` → đặt `prepare: false` (K8 cho bật/tắt bằng biến).
- **Cache Components trên Vercel:** hiện `src/` chưa có `"use cache"` nên reset DB không để lại dữ liệu cũ trong cache. Khi thêm `"use cache"` cho dữ liệu nghiệp vụ: khóa cache phải gồm được công ty (0.2 #33 mục 3) và workflow reset phải xóa cache (revalidate hoặc deploy lại).
- **Tài khoản dùng chung bị phá** (đổi mật khẩu, khóa nhau): reset đêm + reset tay; triệt để bằng K9.
- **Người thử nhập dữ liệu thật** (CCCD, STK nhà cung cấp): ghi rõ "chỉ nhập dữ liệu giả" khi gửi link; dữ liệu nằm ở Singapore (Vercel/Neon).
- **App còn thiếu nghiệp vụ:** hợp đồng, xuất kho, thu hồi, tính tiền thuê, công nợ (change 10–15) chưa làm, bị chặn bởi #44. Người thử chỉ thấy thu mua, nhập kho, tồn kho, sửa chữa, kiểm kê, điều chỉnh giá, nhật ký.
- **Mật khẩu tạm không hết hạn** (K4 chưa làm): không ảnh hưởng demo, phải xong trước production.
- **Chưa có service worker:** PWA cài được nhưng không chạy offline; nháp nhập hàng vẫn lưu IndexedDB.
- **Chi phí theo mức dùng:** đặt giới hạn chi tiêu ở cả Vercel và Neon (mục 6).
- **Đường lui SaaS (0.2 #33):** "mỗi công ty một DB" trên Neon = mỗi công ty một project/nhánh Neon + một project Vercel (hoặc chọn DB theo tên miền phụ) — vẫn đi được, không chặn.

## 9. Các bước theo thứ tự và ước lượng

| # | Bước | Loại | Ước lượng |
|---|---|---|---|
| 1 | Chốt tên miền, ngân sách, người thử, giờ reset (mục 10) | Quyết định | — |
| 2 | Change **K8 `serverless-db-connection`**: propose → duyệt → apply (pool, timeout, `prepare`, URL unpooled cho migrate, test) | **OpenSpec change** | 0,5–1 ngày |
| 3 | Tạo project Neon (Postgres 17, Singapore), nhánh `seed` → migrate → `db:seed:dev`; tạo nhánh `demo` từ `seed` | Hạ tầng | 1–2 giờ |
| 4 | Tạo project Vercel (Pro, Node 24, vùng `sin1`, tắt preview hoặc bảo vệ preview, tắt Toolbar), đặt biến môi trường, (tùy chọn) tên miền riêng | Hạ tầng | 1–2 giờ |
| 5 | PR hạ tầng: `vercel.json`, `demo-reset.yml`, `deploy-demo.yml`, `docs/ops/demo.md` | Hạ tầng, không change | 0,5 ngày |
| 6 | Deploy lần đầu và thử: đăng nhập 5 vai trò, quét QR trên điện thoại thật, `/api/health`, chạy reset tay rồi đăng nhập lại, xem console không có lỗi CSP, đo request đầu sau khi Neon ngủ | Kiểm tra | 2–3 giờ |
| 7 | Giám sát `/api/health`, giới hạn chi tiêu Vercel/Neon | Hạ tầng | 30 phút |
| 8 | Change **K9 `demo-environment`** (DEMO_MODE, banner, chặn đổi mật khẩu/khóa tài khoản demo, `db:seed:demo`, preview đăng nhập được) | **OpenSpec change** | 1–2 ngày |
| 9 | Gửi link + hướng dẫn thử ngắn cho khách / nhân viên; thu phản hồi | Vận hành | 1 giờ |

Tổng: **~2 ngày công** cho bản demo chạy được (bước 2–7), thêm **~1–2 ngày** cho K9. Bước 3–4 làm song song với bước 2 được (chỉ mở demo khi K8 đã merge).

## 10. Điểm cần chốt

1. **Tên miền:** dùng `<project>.vercel.app` hay tên miền công ty (`demo.…`)? Đã có tên miền chưa?
2. **Ngân sách:** đồng ý Vercel Pro (~20 USD/tháng) + Neon Free (lên gói trả phí khi thiếu)? Trần chi tiêu mỗi tháng?
3. **Người thử:** chỉ nhân viên hay cả khách ngoài? Gửi mật khẩu riêng từng người hay một mật khẩu chung?
4. **Reset:** 0:00 mỗi ngày có ổn không? Có cần giữ dữ liệu khách nhập qua đêm không?
5. **Preview deployment:** tắt (đơn giản) hay cần preview đăng nhập được cho từng PR (làm trong K9)?
6. **Cách migrate:** workflow `deploy-demo.yml` (khuyến nghị) hay Build Command chạy migrate (đơn giản hơn)?
