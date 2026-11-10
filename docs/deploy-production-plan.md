# Kế hoạch deploy production

> Trạng thái: **bản nháp, chờ chốt** (31/10/2026). Chưa deploy, chưa sửa code.
> Issue tổng: [#82](https://github.com/hoanghainh1188/scaffolding-erp/issues/82).
> Nền tảng: **Vercel + Neon**, giống bản demo ([`deploy-demo-plan.md`](deploy-demo-plan.md)). Demo làm luôn **môi trường thử (staging)** trước production.
> Production = công ty dùng thật hằng ngày, dữ liệu thật (tiền, tồn kho, CCCD/STK nhà cung cấp). Sai số tiền hay mất sổ kho là lỗi nghiêm trọng.

## 0. Khác gì so với demo

| Mục | Demo | Production |
|---|---|---|
| Dữ liệu | Giả, reset mỗi đêm | **Thật, không bao giờ reset**; sổ kho chỉ ghi thêm |
| Tài khoản | 5 tài khoản chung, mật khẩu chung | Mỗi người một tài khoản; Giám đốc đầu tiên tạo bằng `auth:create-director`, các tài khoản khác do Giám đốc tạo ở D17 |
| Seed | `db:seed:dev` | **Không seed**. Dữ liệu đầu vào từ change `data-migration` (Excel) |
| Neon | Gói Free, compute tự ngủ | Gói trả phí, compute **không ngủ** (hoặc ngủ rất ít), khôi phục theo thời điểm ≥ 7 ngày |
| Backup | Không cần | Bắt buộc, có bản ngoài Neon, có diễn tập khôi phục |
| Giám sát | Ping `/api/health` | Ping + theo dõi lỗi + đối chiếu sổ kho hằng đêm + cảnh báo |
| Deploy | Tự động khi `main` xanh | Có bước duyệt người, giờ deploy cố định, có kế hoạch quay lui |
| Pháp lý | Ghi "chỉ nhập dữ liệu giả" | Dữ liệu cá nhân thật → xem mục 6 |

## 1. Điều kiện trước khi lên production

Chưa đủ các mục dưới thì **chưa** lên production (chạy song song Excel cũng chưa nên).

### Change nghiệp vụ (theo `docs/roadmap.md`)

| Cần có | Change | Trạng thái 31/10/2026 |
|---|---|---|
| Đã có | 01–08, 17, K1, K2, K3, K6, K7 | ✅ |
| Danh mục mở rộng | 09 `catalog-extensions` | 🔒 chờ Q3, Q9, Q10 (#44) |
| Hợp đồng → xuất → thu hồi → tính tiền thuê → công nợ | 10–14 | 10 và 13 🔒 chờ #44; 11, 12, 14 chưa làm |
| Dashboard | 15 `dashboard-basic` | chưa làm |
| Chuyển dữ liệu Excel | 18 `data-migration` | chưa làm, **bắt buộc** |
| Sản xuất | 16 `production-orders` | 🔒 Q11 — hỏi chủ có cần ngay ngày đầu không |
| Mật khẩu tạm hết hạn 48 giờ | K4 `temp-password-expiry` | đang làm (31/10/2026), **bắt buộc** (người dùng thật nhận mật khẩu tạm) |
| Nhãn QR | K5 `qr-labels` | chưa làm; cần nếu thủ kho quét QR từ ngày đầu |

Có thể lên production **theo giai đoạn** (hỏi chủ): giai đoạn 1 chỉ thu mua + nhập kho + tồn kho + sửa chữa + kiểm kê (đã có), giai đoạn 2 thêm hợp đồng/cho thuê. Nhưng tồn kho thật phải nhập đúng ngay từ đầu (change 18), nên change 18 đi trước dù chọn cách nào.

### Change kỹ thuật cho hạ tầng

| Change | Nội dung | Ghi chú |
|---|---|---|
| K8 `serverless-db-connection` | Pool kết nối cho Vercel + Neon (xem kế hoạch demo mục 7) | Làm cho demo, dùng lại |
| **K10 `company-settings`** | Bảng cài đặt công ty: tên, MST, địa chỉ, logo trên phiếu in (0.2 #33 mục 4) | Cần trước khi in phiếu/hợp đồng thật |
| **K11 `error-monitoring`** | Theo dõi lỗi phía server và trình duyệt (ví dụ Sentry), lọc bỏ CCCD/STK/mật khẩu khỏi báo lỗi | Thêm thư viện mới → hỏi người dùng trước; có thể thay bằng Vercel log drain nếu không muốn thêm thư viện |
| (tùy) K12 `ops-checks` | Route hoặc script cron chạy `inventory:check` và báo lỗi; trang "Tình trạng hệ thống" cho Giám đốc | Có thể làm bằng GitHub Actions, không cần change |

### Kiểm tra tay và rà soát

- Làm hết mục kiểm tra tay ở issue **#33** trên bản demo/staging.
- Rà soát bảo mật toàn bộ (`security-reviewer`): phân quyền server mọi route (`route-guards.test.ts` đã bắt chỗ quên), lộ CCCD/STK, CSRF của server action, giới hạn đăng nhập sau Vercel.
- Chạy thử song song 1–2 tuần với Excel trên dữ liệu thật đã chuyển (ở staging), so số tồn kho, giá vốn, tiền thuê với Excel.

## 2. Môi trường

```
Vercel project: scaffolding-erp-prod   (tên miền: erp.<tên-miền>)
Neon project:   scaffolding-erp-prod   (Postgres 17, Singapore)
  └── main      ← production, không bao giờ reset
      └── (nhánh tạm khi cần: thử migration, khôi phục, điều tra)

Vercel project: scaffolding-erp-demo   ← staging + demo (kế hoạch demo)
Neon project:   scaffolding-erp-demo
```

- **Tách project** (không chỉ tách nhánh) giữa production và demo: khác khóa API, khác người có quyền, demo reset không bao giờ chạm production.
- Đúng hướng 0.2 #33: mỗi công ty sau này = một cặp project Vercel + Neon (hoặc một Vercel chọn DB theo tên miền phụ).
- Vùng: Vercel `sin1`, Neon `aws-ap-southeast-1` (cùng Singapore để mỗi truy vấn chỉ vài ms).

### Gói dịch vụ

| Dịch vụ | Gói | Lý do |
|---|---|---|
| Vercel | Pro | Dùng thương mại; log, giới hạn chi tiêu, bảo vệ deployment |
| Neon | Gói trả phí (Launch/Scale) | Compute không ngủ (tránh request đầu chậm/lỗi lúc 7 giờ sáng), khôi phục theo thời điểm 7–30 ngày, nhiều dung lượng hơn |
| GitHub | Hiện tại | Environment `production` có **người duyệt bắt buộc** |

Chi phí ước lượng: Vercel Pro ~20 USD/người/tháng + Neon ~20–70 USD/tháng tùy mức dùng + tên miền. Xem lại bảng giá trước khi mua.

## 3. Biến môi trường và secret

Giống demo (kế hoạch demo mục 2), khác ở:

- `BETTER_AUTH_SECRET` **riêng cho production**, không dùng lại của demo. Đổi giá trị này = mọi người bị đăng xuất.
- `BETTER_AUTH_URL=https://erp.<tên-miền>`.
- `PII_ENCRYPTION_KEYS` **riêng cho production** (và `PROD_PII_ENCRYPTION_KEYS` trên GitHub, cùng giá trị). Thiếu là app không khởi động. Mất khóa là mất hết CCCD: xem `docs/ops/personal-data.md`.
- Không đặt `DEV_SEED_PASSWORD`, `E2E*`, `AUTH_SIGN_IN_LIMIT_PER_MINUTE`.
- Ai giữ secret: chủ repo + một người dự phòng (Giám đốc). Lưu trong trình quản lý mật khẩu của công ty, không gửi qua chat.
- Bật 2FA cho tài khoản Vercel, Neon, GitHub, nhà cung cấp tên miền.
- Xoay vòng: `BETTER_AUTH_SECRET` và mật khẩu DB đổi ngay khi có người rời nhóm có quyền.

## 4. Tên miền, HTTPS, header

- Tên miền công ty, subdomain `erp.` (hoặc tương tự). Vercel cấp HTTPS và HSTS.
- Có thể thêm `preload` cho HSTS khi chắc chắn mọi subdomain đều HTTPS.
- Giữ CSP nonce của `src/proxy.ts`; tắt Vercel Toolbar trên production.
- `noindex` cho toàn bộ app (ERP nội bộ, không cần Google).
- (Tùy) Vercel Firewall: chặn quốc gia ngoài Việt Nam cho trang đăng nhập nếu công ty chỉ làm việc trong nước — hỏi chủ về nhân viên đi công tác nước ngoài trước khi bật.

## 5. Dữ liệu ban đầu và ngày chạy thật

1. Tạo DB trống → `db:migrate` (URL trực tiếp).
2. `npm run auth:create-director -- --username <tên> --name "<Họ tên>"`: in mật khẩu tạm một lần, gửi tận tay Giám đốc.
3. Giám đốc đăng nhập, đổi mật khẩu, tạo tài khoản cho từng người (D17).
4. Nhập cài đặt công ty (K10), danh mục (vật tư, bộ, bãi, đối tác) — bằng change 18 `data-migration` từ Excel.
5. **Tồn đầu kỳ** (`OPENING`) theo một ngày chốt sổ: kiểm kê thực tế ngày chốt, nhập qua công cụ của change 18. Sổ kho không sửa được nên làm thử trên staging trước, đối chiếu xong mới chạy trên production.
6. `npm run inventory:check` = 0, so tổng giá trị tồn với Excel.
7. Ngày bắt đầu dùng thật: thống nhất với chủ (nên đầu tháng, sau ngày chốt sổ); Excel chỉ còn để đối chiếu 1–2 tuần.

## 6. Dữ liệu cá nhân và pháp lý

- App lưu CCCD, số tài khoản của nhà cung cấp cá nhân và thông tin nhân viên → là **dữ liệu cá nhân** theo pháp luật Việt Nam về bảo vệ dữ liệu cá nhân (Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân có hiệu lực từ 01/01/2026).
- Vercel và Neon lưu dữ liệu ở **Singapore** → là chuyển dữ liệu cá nhân ra nước ngoài; có thể phải lập hồ sơ đánh giá tác động và thông báo cơ quan quản lý.
- **Đã chốt (0.2 #156–#159, 10/11/2026):** tuân theo luật Việt Nam (Luật 91/2025, Nghị định 356/2025) và PDPA Singapore; mã hóa CCCD trong DB; số tài khoản chỉ lưu 4 số cuối; Claude soạn nháp hồ sơ đánh giá tác động và chuyển dữ liệu ra nước ngoài, luật sư duyệt và nộp. **Chưa đưa dữ liệu cá nhân thật lên production khi chưa có ý kiến luật sư.**
- **Việc cần làm:** hỏi tư vấn pháp lý / kế toán của công ty trước khi đưa dữ liệu thật lên. Nếu yêu cầu dữ liệu nằm ở Việt Nam → phương án VPS / cloud trong nước (đã cân nhắc ở kế hoạch demo) thay cho Neon; code không phải đổi nhiều vì mọi truy cập DB đi qua `src/db/client.ts`.
- Trong app đã có (change `personal-data-protection`): CCCD mã hóa AES-256-GCM trong DB, chỉ form sửa cần `partners.manage` mới giải mã; số tài khoản chỉ lưu 4 số cuối; ghi nhận đã thông báo; ẩn danh người bán khi được yêu cầu; nhật ký và sổ kho ghi mã thay tên người bán cá nhân; báo lỗi (K11) quét cả nội dung chuỗi.
- Quy trình: `docs/ops/personal-data.md` (khóa, yêu cầu xóa, thời hạn giữ, khôi phục), `docs/ops/data-breach.md` (sự cố lộ dữ liệu).
- Thứ tự chuyển dữ liệu: thêm cột → deploy → `pii:backfill` → kiểm còn 0 → xóa nhánh `pre-deploy-*`, chờ bản sao lưu cũ hết hạn → mới đưa dữ liệu thật lên.

## 7. Migration, build, deploy

### Quy tắc migration cho DB thật

- Chỉ **thêm** (bảng, cột cho phép trống, index) trong một lần deploy. Đổi tên / xóa cột / đổi kiểu làm 2 bước qua 2 lần deploy (thêm mới → chuyển dữ liệu và code → bỏ cũ ở lần sau), để bản cũ vẫn chạy được khi quay lui.
- Không bao giờ sửa file migration đã chạy; sai thì viết migration mới.
- Không động tới trigger chặn UPDATE/DELETE của `inventory_ledger` và `activity_log`.
- Index trên bảng lớn (`inventory_ledger`, `activity_log`): dùng `CREATE INDEX CONCURRENTLY` (ngoài transaction) khi bảng đã nhiều dòng.

### Quy trình deploy (workflow `deploy-production.yml`)

1. Merge vào `main` → CI xanh → **tự deploy lên staging (demo)** như kế hoạch demo.
2. Kiểm tra trên staging: E2E chính, đăng nhập theo vai trò, màn có thay đổi.
3. Tạo **tag** `vX.Y.Z` (hoặc bấm `workflow_dispatch`) → workflow production chờ **người duyệt** (GitHub environment `production`).
4. Sau khi duyệt:
   1. Tạo nhánh Neon `pre-deploy-<tag>` từ `main` (điểm quay lui tức thì cho DB).
   2. Chạy `db:migrate` trên nhánh tạm đó trước để chắc migration chạy được trên dữ liệu thật, rồi chạy trên `main`.
   3. Deploy Vercel production (Deploy Hook hoặc `vercel deploy --prod` từ commit của tag).
   4. Chờ `/api/health` = 200, chạy `inventory:check` = 0.
   5. Lỗi → Vercel **Instant Rollback** về bản trước (an toàn nhờ quy tắc migration chỉ thêm).
5. Giờ deploy: ngoài giờ làm việc của kho (ví dụ sau 18:00), không deploy vào ngày chốt sổ / ngày tính tiền thuê.
6. Ghi lại mỗi lần deploy: tag, migration nào, ai duyệt (trong release note của GitHub).

## 8. Backup và khôi phục

| Lớp | Cách | Giữ |
|---|---|---|
| Khôi phục theo thời điểm | Neon (PITR) | 7–30 ngày tùy gói |
| Nhánh trước mỗi deploy | `pre-deploy-<tag>` (mục 7) | Xóa sau 14 ngày |
| **Bản ngoài Neon** | GitHub Actions hằng đêm `pg_dump -Fc` (URL trực tiếp, user chỉ đọc) → mã hóa (`age`/GPG) → lưu ở dịch vụ khác (S3/R2/Google Drive của công ty) | 30 bản ngày + 12 bản tháng |
| Bí mật | Bản sao biến môi trường trong trình quản lý mật khẩu | Luôn cập nhật |

- **Diễn tập khôi phục** mỗi quý: lấy bản `pg_dump` mới nhất → khôi phục vào một nhánh / DB tạm → `inventory:check` = 0 → so số tồn với production. Ghi kết quả vào tài liệu vận hành.
- Mục tiêu (cần chủ xác nhận): mất tối đa **vài phút** dữ liệu (nhờ PITR), khôi phục trong **≤ 4 giờ**.
- Sổ kho chỉ ghi thêm nên khôi phục là khôi phục cả DB về một thời điểm; các phiếu nhập sau thời điểm đó phải nhập lại → giữ phiếu giấy / ảnh phiếu trong thời gian đầu.

## 9. Giám sát, log, cảnh báo

| Theo dõi | Cách | Báo cho |
|---|---|---|
| App sống | UptimeRobot/Better Stack gọi `/api/health` mỗi 1–5 phút | Người phụ trách kỹ thuật (Telegram/email) |
| Lỗi server và trình duyệt | K11 (Sentry hoặc Vercel log drain) | Như trên |
| Sổ kho khớp giá vốn | GitHub Actions hằng đêm `inventory:check`; lệch → workflow đỏ + email | Kỹ thuật + Kế toán |
| Backup chạy | Workflow backup đỏ → email | Kỹ thuật |
| Chi phí | Giới hạn chi tiêu Vercel + Neon | Chủ tài khoản |
| Dung lượng DB, số kết nối | Bảng điều khiển Neon + cảnh báo | Kỹ thuật |
| Thao tác người dùng | Nhật ký D18 trong app | Giám đốc |
| Tài khoản bị khóa | `auth:unlock` (có ghi nhật ký) | Giám đốc báo kỹ thuật |

- Log Vercel giữ ngắn ngày; nếu cần giữ lâu (điều tra, kiểm toán) → log drain sang dịch vụ lưu log.
- Viết **runbook** `docs/ops/production.md`: app không lên, DB không kết nối được, `inventory:check` lệch, khôi phục backup, khóa/gỡ khóa tài khoản, đổi secret, ai gọi ai.

## 10. Rủi ro chính

- **Lên quá sớm:** thiếu hợp đồng/cho thuê/công nợ thì công ty vẫn phải dùng Excel song song lâu → dữ liệu hai nơi lệch nhau. Chốt phạm vi giai đoạn 1 với chủ.
- **Tồn đầu kỳ sai:** sổ kho không sửa được, chỉ điều chỉnh bằng phiếu → làm thử trên staging, kiểm kê thật ngày chốt.
- **Dữ liệu ra nước ngoài** (mục 6): có thể buộc đổi nơi chạy → hỏi sớm, trước khi làm change 18.
- **Một người giữ mọi quyền kỹ thuật:** có người dự phòng giữ 2FA/secret; runbook viết đủ để người khác làm theo.
- **Migration phá dữ liệu thật:** quy tắc "chỉ thêm", chạy thử trên nhánh tạm từ dữ liệu thật, nhánh `pre-deploy`.
- **Phụ thuộc Vercel/Neon** (giá, sự cố): code không dùng tính năng riêng của Vercel (không `@vercel/*`) và DB là Postgres chuẩn → chuyển sang VPS + Docker Compose được trong 1–2 ngày (cần viết Dockerfile).
- **Mạng ở bãi/xưởng yếu:** nháp nhập hàng đã lưu IndexedDB; chưa có service worker nên mất mạng thì không mở được app → cân nhắc change PWA offline sau giai đoạn 1.

## 11. Các bước theo thứ tự

| # | Bước | Loại | Ước lượng |
|---|---|---|---|
| 1 | Hỏi tư vấn pháp lý về dữ liệu cá nhân ra nước ngoài (mục 6) | Quyết định | — (làm sớm nhất) |
| 2 | Chủ trả lời #44; chốt phạm vi giai đoạn 1 và ngày chạy thật | Quyết định | — |
| 3 | Demo/staging chạy ổn (kế hoạch demo, gồm K8) | Theo kế hoạch demo | ~2 ngày |
| 4 | Các change nghiệp vụ còn thiếu cho phạm vi giai đoạn 1 (09–15 tùy phạm vi) | **OpenSpec change** | nhiều tuần (theo roadmap) |
| 5 | K4 `temp-password-expiry`, K10 `company-settings`, K11 `error-monitoring` (+ K5 nếu cần QR) | **OpenSpec change** | 2–4 ngày |
| 6 | Change 18 `data-migration`; xin file Excel mẫu sớm | **OpenSpec change** | 3–5 ngày |
| 7 | Tạo project Vercel + Neon production, 2FA, biến môi trường, tên miền | Hạ tầng | 2–3 giờ |
| 8 | Workflow `deploy-production.yml`, `backup.yml`, `inventory-check.yml`; runbook `docs/ops/production.md` | Hạ tầng, không change | 1 ngày |
| 9 | Diễn tập khôi phục lần đầu (trên dữ liệu staging) | Kiểm tra | 2–3 giờ |
| 10 | Kiểm tra tay #33 + rà soát bảo mật trên staging | Kiểm tra | 1–2 ngày |
| 11 | Chuyển dữ liệu thử trên staging, chạy song song Excel 1–2 tuần | Vận hành | 1–2 tuần |
| 12 | Ngày chốt sổ: kiểm kê, chuyển dữ liệu thật lên production, `inventory:check`, mở cho người dùng | Vận hành | 1 ngày |
| 13 | Theo dõi sát 2 tuần đầu; sau đó deploy theo lịch | Vận hành | — |

Phần hạ tầng riêng cho production (bước 7–9): **~2 ngày công**. Thời gian tới ngày chạy thật phụ thuộc chủ yếu vào bước 2, 4, 6.

## 12. Điểm cần chốt

1. **Phạm vi giai đoạn 1:** lên production với phần đã có (thu mua, nhập kho, tồn kho, sửa chữa, kiểm kê) hay chờ đủ hợp đồng/cho thuê/công nợ?
2. **Nơi lưu dữ liệu:** chấp nhận Singapore (Vercel + Neon) sau khi hỏi pháp lý, hay phải ở Việt Nam?
3. **Mục tiêu khôi phục:** chấp nhận mất tối đa vài phút dữ liệu và khôi phục trong 4 giờ?
4. **Theo dõi lỗi:** đồng ý thêm Sentry (thư viện mới) hay chỉ dùng log Vercel?
5. **Người duyệt deploy và người giữ secret dự phòng** là ai?
6. **Ngân sách production:** ~40–100 USD/tháng có ổn không?
