# Tasks: auth-and-roles

## 1. Cấu hình và cơ sở dữ liệu

- [x] 1.1 Cài `better-auth` (ghim bản chính xác); `src/lib/env.ts` thêm `BETTER_AUTH_SECRET` (≥ 32 ký tự), `BETTER_AUTH_URL`, `DEV_SEED_PASSWORD`, `E2E_PASSWORD`, bỏ `DEV_ROLE`; cập nhật `.env.example`, `ci.yml`, `update-snapshots.yml` — kiểm tra: unit test env (thiếu secret, secret 31 ký tự, URL sai) xanh, lỗi không in giá trị
- [x] 1.2 Drizzle schema `src/db/schema/auth.ts` cho `user`, `session`, `account`, `verification`, `rate_limit`, `login_throttle`, `auth_rate_limit` theo design D10 (CHECK vai trò/trạng thái/thiết bị, UNIQUE `username`, FK cascade, cột `persistent`); sinh `drizzle/0001_auth.sql` và đọc lại tay — kiểm tra: `npm run db:migrate` trên DB rỗng thành công; integration test chèn `role = 'ADMIN'` bị CHECK từ chối

## 2. Better Auth

- [x] 2.1 `src/lib/auth/auth.ts` theo design D10 (drizzle adapter, plugin `username`, `nextCookies`, `cookieCache` tắt, `disableSignUp`, `disabledPaths`, email `<username>@users.invalid`); route `src/app/api/auth/[...all]/route.ts` — kiểm tra (spike): integration test gọi `auth.api.signInUsername` từ server thành công, còn `POST /api/auth/sign-in/username` và `/api/auth/sign-up/email` qua HTTP trả 404; nếu không, đổi sang `hooks.before` và ghi lại vào design D10
- [x] 2.2 Helper test `src/test/auth.ts`: `resetAuthTables`, `createTestUser({ role, status?, mustChangePassword?, password? })`, `signInAs(user)` trả header `Cookie` — kiểm tra: một integration test tạo user rồi `auth.api.getSession` với cookie đó trả đúng user

## 3. Logic thuần + unit test (viết test trước)

- [x] 3.1 `src/domain/permissions.ts` (`PERMISSIONS`, `Permission`, `can`) theo design D7 — kiểm tra: unit test mọi cặp (vai trò × quyền) khớp bảng; `users.manage` chỉ `DIRECTOR`
- [x] 3.2 `src/lib/navigation.ts` đổi `roles` → `permission`, lọc bằng `can()` — kiểm tra: `navigation.test.ts` hiện có vẫn xanh không sửa kỳ vọng (DIRECTOR 9, SALES 6, ACCOUNTANT có Công nợ, WAREHOUSE rỗng)
- [x] 3.3 `src/domain/password.ts` `validateNewPassword({ password, confirm, username, currentPassword })` + danh sách mật khẩu phổ biến — kiểm tra: unit test `kho123` (ngắn), 8 ký tự vừa đủ, 129 ký tự, trùng tên, trùng hiện tại, `12345678`, `MatKhau123` (phổ biến, khác hoa thường), `bai sau kho` hợp lệ, nhập lại không khớp; thông báo đúng chữ trong spec
- [x] 3.4 `src/domain/temp-password.ts` (256 từ, `crypto.randomInt`, dạng `<từ>-<4 số>`, có tham số nguồn ngẫu nhiên để test) — kiểm tra: unit test khớp `/^[a-z]{3,6}-\d{4}$/`, đủ 256 từ không trùng, số `0007` giữ 4 chữ số
- [x] 3.5 `src/domain/login-throttle.ts` (`evaluateLoginThrottle`, `recordFailure`, `recordSuccess`) theo design D3 — kiểm tra: unit test sai 4 lần cho qua, lần 5 khóa tới +15 phút, lần 6 với mật khẩu đúng vẫn khóa, 08:03 + 16 phút mở lại, lần sai cách lần đầu > 15 phút đếm lại từ 1
- [x] 3.6 `src/domain/device.ts` `detectDevice(ua)` + `formatLastLogin(at, now)` ("Hôm nay, HH:mm" / "Hôm qua, HH:mm" / "dd/MM/yyyy, HH:mm" / "Chưa đăng nhập") theo giờ Việt Nam — kiểm tra: unit test UA Android, iPhone, Edge Windows, Safari macOS, chuỗi rỗng; `2026-10-26T23:48:00Z` xem ngày 27/10 → "Hôm nay, 06:48"; qua nửa đêm giờ VN; coverage `src/domain` ≥ 80%

## 4. Đăng nhập, phiên và đổi mật khẩu (service + integration test)

- [x] 4.1 `src/lib/auth/rate-limit.ts` (fixed window theo IP, `INSERT ... ON CONFLICT`) và lấy IP từ phần tử cuối của `x-forwarded-for` — kiểm tra: integration test 20 lần qua, lần 21 trong cùng phút bị chặn, phút sau qua lại
- [x] 4.2 `src/lib/auth/sign-in.ts` `signIn({ username, password, remember, ip, userAgent, now })`: giới hạn IP → tạm khóa theo tên → `auth.api.signInUsername` → kiểm tra `status` → `persistent`/`expires_at` 12 giờ khi không tick → ghi `last_login_*` (lỗi thì log, không chặn) → trả kết quả có mã lỗi — kiểm tra: **integration test đăng nhập sai**: sai mật khẩu và tên không tồn tại cùng thông báo, không có phiên trong DB, `last_login_at` không đổi; sai 5 lần → lần 6 mật khẩu đúng bị từ chối; tên không tồn tại cũng bị tạm khóa; đúng sau khi hết hạn khóa; ghi đúng `DESKTOP`/`MOBILE`
- [x] 4.3 **Integration test tài khoản bị khóa**: user `LOCKED` mật khẩu đúng → "Tài khoản đã bị khóa. Liên hệ Giám đốc", mật khẩu sai → thông báo sai thông thường, không tạo phiên — kiểm tra: `npm run test:int` xanh
- [x] 4.4 `src/lib/current-user.ts` thay thân hàm: đọc phiên Better Auth, từ chối phiên `persistent = false` quá 12 giờ, từ chối user không `ACTIVE`; xóa nhánh dev và test cũ của người dùng giả lập — kiểm tra: integration test phiên tick vẫn hợp lệ ngày 29, phiên không tick hết sau 12 giờ 1 phút, phiên của user vừa bị khóa trả null
- [x] 4.5 `src/lib/auth/change-password.ts` + `POST /api/me/password`: kiểm mật khẩu hiện tại, `validateNewPassword`, băm, `must_change_password = false`, xóa phiên khác giữ phiên hiện tại, một transaction — kiểm tra: integration test sai mật khẩu hiện tại → 400 không đổi; đổi xong mật khẩu cũ không đăng nhập được; phiên thứ hai bị xóa, phiên hiện tại còn
- [x] 4.6 **Integration test bắt đổi mật khẩu lần đầu**: user `must_change_password = true` đăng nhập được, `requireUser()` chuyển `/change-password`, `GET /api/users` trả 403 "Cần đổi mật khẩu trước khi tiếp tục", `POST /api/me/password` được phép; đổi xong thì các route trên chạy bình thường — kiểm tra: `npm run test:int` xanh

## 5. Phân quyền phía server

- [x] 5.1 `src/lib/auth/guard.ts`: `requireUser`, `requirePermission` (dùng `forbidden()`, bật `experimental.authInterrupts`, trang `src/app/forbidden.tsx` "Bạn không có quyền xem trang này" + nút về trang mặc định), `withAuth(handler, { permission, allowPendingPasswordChange })` với 401/403 envelope và kiểm `Origin` cho POST/PATCH/DELETE — kiểm tra: integration test gọi một route mẫu: không cookie → 401 "Bạn cần đăng nhập"; sai `Origin` → 403
- [x] 5.2 `src/proxy.ts`: không có cookie phiên → trang chuyển `/login?next=...`, `/api/*` trả 401; danh sách đường công khai theo design D7; đã đăng nhập mở `/login` thì trang login tự chuyển theo vai trò — kiểm tra: unit test hàm `isPublicPath` + `buildLoginRedirect` (bỏ `next` trỏ ra ngoài, `//evil.example`); `curl -I /m/history` khi chưa đăng nhập thấy 307 tới `/login?next=%2Fm%2Fhistory`; `/api/health` vẫn 200
- [x] 5.3 Gắn `requirePermission` vào mọi `page.tsx` của `(desktop)` (quyền `*.view` tương ứng) và `requireUser` vào khu `/m`, bọc `<Suspense>` cho Cache Components; layout Desktop đọc user thật — kiểm tra: `npm run build` thành công không lỗi "uncached data outside Suspense"
- [x] 5.4 Test quét `src/app/route-guards.test.ts`: mọi `page.tsx` dưới `(desktop)` và `settings/users` có `requirePermission`, mọi `route.ts` dưới `src/app/api` (trừ `health`, `auth`) dùng `withAuth` — kiểm tra: test xanh; thử xóa guard một trang thì test đỏ

## 6. Quản lý người dùng (service + API)

- [x] 6.1 `src/lib/users/service.ts`: `listUsers`, `createUser` (zod: họ tên 1–100, tên đăng nhập regex D2/spec, vai trò), trả `tempPassword` một lần, user + account trong một transaction — kiểm tra: integration test tạo `ducluc` → DB chỉ có mã băm (không chứa chuỗi mật khẩu tạm), `must_change_password = true`; trùng tên với tài khoản đã khóa → 409 "Tên đăng nhập đã có người dùng"; `đức lực` → 400
- [x] 6.2 `resetPassword`, `lockUser`, `unlockUser` theo design D5: một transaction đổi mật khẩu/trạng thái + xóa toàn bộ phiên + xóa `login_throttle` — kiểm tra: integration test sau khi khóa, cookie cũ gọi API trả 401; sau đặt lại, mật khẩu cũ hỏng, tạm khóa được gỡ; đặt lại cho tài khoản khóa → 409; mở khóa trả mật khẩu tạm mới, mật khẩu cũ hỏng
- [x] 6.3 `changeRole` + bảo vệ Giám đốc theo design D6 (`FOR UPDATE` các dòng Giám đốc đang dùng) — kiểm tra: integration test tự khóa → 409, tự đổi vai trò → 409, có 2 Giám đốc khóa 1 → được; hai yêu cầu khóa chéo bằng `Promise.all` trên hai kết nối → đúng một thành công, còn 1 Giám đốc đang dùng; hạ vai trò + khóa cùng lúc → tương tự
- [x] 6.4 Route handlers `GET/POST /api/users`, `PATCH /api/users/[id]`, `POST /api/users/[id]/lock|unlock|reset-password` bọc `withAuth({ permission: "users.manage" })`, `Cache-Control: no-store` khi có `tempPassword`, 404 khi id không có — kiểm tra: **integration test gọi API sai vai trò bị từ chối**: lần lượt `ACCOUNTANT`, `SALES`, `WAREHOUSE`, `WORKSHOP` gọi từng route → 403 "Bạn không có quyền thực hiện thao tác này" và DB không đổi; `DIRECTOR` gọi → 2xx; danh sách không có trường mật khẩu
- [x] 6.5 `scripts/create-director.mts` + script `auth:create-director` theo design D4 (advisory lock, chỉ khi chưa có Giám đốc đang dùng) — kiểm tra: integration test chạy hàm lõi trên DB rỗng tạo được, chạy lần hai báo "Đã có tài khoản Giám đốc..." và không tạo; chạy thử lệnh thật trên DB dev in mật khẩu một lần
- [x] 6.6 `scripts/seed-dev.mts` + script `db:seed:dev` (5 tài khoản, mật khẩu `DEV_SEED_PASSWORD`, không bắt đổi, từ chối khi `NODE_ENV=production`, chạy lại không tạo trùng) — kiểm tra: chạy hai lần liên tiếp vẫn đúng 5 tài khoản; `NODE_ENV=production` thì dừng với thông báo

## 7. Giao diện

- [x] 7.1 Trang `/login` theo `Login.dc.html` (token Bright Blue Base, component shadcn có sẵn; 2 cột ≥ 1024px, 1 cột trên điện thoại), server action `signIn`, vùng lỗi `role="alert"`, ô "Giữ đăng nhập" mặc định không tick, chuyển `next`/trang mặc định — kiểm tra: E2E đăng nhập đúng/sai cho Kế toán và Thủ kho; axe không có lỗi `serious`/`critical`; không cuộn ngang ở 360 và 1366px
- [x] 7.2 Trang `/change-password` (3 ô, gợi ý, lỗi theo spec) — kiểm tra: E2E tài khoản mới đăng nhập bằng mật khẩu tạm bị đưa tới trang này, mở `/inventory` bị trả về, đổi xong vào `/dashboard`
- [x] 7.3 Header Desktop: menu người dùng (họ tên thật, vai trò, Đổi mật khẩu, Đăng xuất) bằng `DropdownMenu`; `/m/profile` hiện họ tên, tên đăng nhập, vai trò, 2 nút cao ≥ 48px — kiểm tra: E2E mở menu bằng bàn phím (Enter) rồi đăng xuất, bấm quay lại vẫn ở `/login`; E2E tab Cá nhân hiện đúng thông tin và đăng xuất được
- [x] 7.4 D17 `/settings/users`: đầu trang đếm, nút lọc theo vai trò (URL `?role=`), bảng 5 cột, "Đăng nhập gần nhất" dùng `formatLastLogin`, sắp xếp Đang dùng trước — kiểm tra: component test với 8 dòng mẫu như thiết kế hiện "7 người đang dùng · 1 tài khoản đã khóa" và lọc "Thủ kho · 3"
- [x] 7.5 D17 khung "Thêm người dùng" (màn hẹp tự xuống dưới bảng, như `D17-Users.dc.html`), chọn vai trò ("Xem cả 5 vai trò"), hộp thoại mật khẩu tạm hiện một lần + "Sao chép" + lời nhắc có họ tên — kiểm tra: E2E Giám đốc tạo `ducluc`, thấy mật khẩu tạm, đóng hộp thoại thì không xem lại được; đăng nhập bằng mật khẩu đó bị bắt đổi
- [x] 7.6 D17 menu thao tác mỗi dòng: Đổi vai trò, Đặt lại mật khẩu, Khóa (hộp thoại xác nhận), Mở khóa; dòng của chính mình ẩn Khóa/Đổi vai trò; lỗi 409 hiện bằng chữ của server — kiểm tra: E2E khóa một Thủ kho, trang của Thủ kho đó (context trình duyệt thứ hai) bị chuyển `/login` ở lần chuyển tab kế tiếp
- [x] 7.7 Trang `/settings` thêm liên kết "Người dùng"; trang 403 dùng token và giọng văn theo `docs/design-system/README.md` — kiểm tra: Kế toán mở `/settings/users` thấy "Bạn không có quyền xem trang này"

## 8. E2E, tài liệu, kiểm tra cuối

- [x] 8.1 `tests/e2e/global-setup.ts`: migrate DB E2E, seed tài khoản với `E2E_PASSWORD`, đăng nhập qua `/login` lưu `tests/e2e/.auth/<role>.json` (thêm vào `.gitignore`); các spec cũ dùng `storageState` Giám đốc, chỗ ghi chú `DEV_ROLE` đổi sang file vai trò; CI có bước migrate trước E2E — kiểm tra: `npm run test:e2e` xanh ở local; CI xanh; nếu ảnh mốc đổi thì chạy workflow Update Playwright snapshots
- [x] 8.2 Cập nhật `CLAUDE.md` (lệnh `auth:create-director`, `db:seed:dev`, bỏ `DEV_ROLE`), `README.md` (tạo Giám đốc đầu tiên, cách cứu hộ khi mọi Giám đốc bị khóa), sửa chú thích `next.config.ts` về CSP trỏ sang change `security-headers` — kiểm tra: làm theo README trên DB sạch đăng nhập được
- [x] 8.3 Chạy `npm run lint`, `typecheck`, `test`, `test:coverage` (≥ 80% `src/domain`, `src/lib`), `build`, `openspec validate auth-and-roles --strict` — kiểm tra: tất cả xanh
- [ ] 8.4 Kiểm tra tay: Edge Windows (Giám đốc tạo người, khóa, đặt lại), Chrome Android (thủ kho tick giữ đăng nhập, đóng mở lại trình duyệt vẫn vào; không tick thì phải đăng nhập lại), Safari iPhone mở `/login` không cuộn ngang — kiểm tra: ghi kết quả vào PR

## Workflow follow-up

- Sau khi merge: `/opsx:archive auth-and-roles`.
- Change phụ đã ghi vào `docs/roadmap.md` mục "Change kỹ thuật" (K1–K4).
