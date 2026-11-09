# Design: `director-mfa`

## Context

Động cơ: xem `proposal.md`. Hiện trạng ảnh hưởng tới thiết kế (đã đọc code và `better-auth@1.7.14`):

- `signIn` (`src/lib/auth/sign-in.ts`) gọi `auth.api.signInUsername` ở server. Route HTTP `/sign-in/*` đã nằm trong `DISABLED_PATHS`; danh sách này chỉ chặn HTTP, không chặn `auth.api`.
- Plugin `twoFactor` có sẵn. Hook của plugin chạy sau `/sign-in/username`: nếu `user.twoFactorEnabled` thì **xóa phiên vừa tạo**, đặt cookie `two_factor` (10 phút) và trả `{ twoFactorRedirect: true }`, không có `token`, `user`.
- Plugin đã có: mã hóa bí mật bằng khóa của Better Auth; khóa 5 lần sai trên một lượt nhập; khóa 10 lần sai liên tiếp trên một tài khoản (`failedVerificationCount`, `lockedUntil`, 15 phút); cập nhật mã dự phòng kiểu so-rồi-ghi nên hai yêu cầu cùng lúc không dùng được cùng một mã.
- Plugin có sẵn "tin thiết bị" (`trustDevice`, cookie ký + dòng `verification` tên `trust-device-*`, gia hạn sau mỗi lần đăng nhập). Khi tắt 2 lớp, plugin **chỉ xóa dấu tin của máy đang gửi yêu cầu**, các máy khác còn nguyên.
- Plugin **thiếu**: (1) không chống dùng lại mã (`verifyTOTP` chấp nhận lệch ±1 bước, một mã sống tới 90 giây); (2) mã dự phòng mặc định mã hóa, không băm.
- `user.email` là `<username>@users.invalid`, plugin dùng nó làm nhãn trong app tạo mã.
- Mã QR: repo chưa có thư viện tạo QR (`barcode-detector` chỉ đọc).

## Goals / Non-Goals

**Goals:** trả lời 7 điểm cần chốt của issue #97; kẻ gian có mật khẩu không vào được; người dùng không bị khóa ngoài vĩnh viễn; không có phiên nào trước khi qua lớp hai.

**Non-Goals:** xem `proposal.md` mục Ngoài phạm vi.

## Decisions

### D1. Bắt buộc cho `DIRECTOR`, `ACCOUNTANT`, không áp dụng khi `DEMO_MODE` (điểm 1, đã chốt 0.2 #133)

- **Chọn:** hàm thuần `isTwoFactorRequired(role, demoMode)` trong `src/domain/two-factor.ts`. `CurrentUser` thêm `mustEnrollTwoFactor`, đọc mỗi yêu cầu trong `resolveCurrentUser`. `requireUser` và `withAuth` chặn như `mustChangePassword`, với tùy chọn `allowPendingTwoFactor` cho `/two-factor` và API của nó. Thứ tự: đổi mật khẩu tạm → bật 2 lớp.
- **Lý do:** Giám đốc có quyền cao nhất, Kế toán giữ công nợ, phiếu thu, phiếu chi; tùy chọn thì sẽ không ai bật. Danh sách vai trò chỉ đặt một chỗ trong `isTwoFactorRequired`. Dùng lại đúng mẫu cổng đã có.
- **Demo:** 5 tài khoản demo dùng chung; một khách bật 2 lớp cho `giamdoc` sẽ khóa mọi người khác.
- **Người rời vai trò bắt buộc:** vẫn bị hỏi mã vì `twoFactorEnabled` còn bật. Muốn gỡ thì dùng lệnh cứu hộ (D5). Trường hợp hiếm, không thêm màn hình.
- **Đã cân nhắc:** chỉ Giám đốc (bỏ ngỏ người giữ công nợ); tùy chọn mọi vai trò (Thủ kho, Xưởng dùng điện thoại chung, thêm việc hỗ trợ, rủi ro thấp hơn); bắt buộc mọi vai trò (quá nặng cho công ty 5 vai trò); cờ môi trường riêng để tắt (thêm một lối tắt có thể lỡ bật ở production).

### D2. Code riêng gọi `auth.api`, đóng mọi route `/two-factor/*` (điểm 2)

- **Chọn:** service `src/lib/auth/two-factor.ts` gọi `auth.api.enableTwoFactor`, `verifyTOTP`, `verifyBackupCode`, `generateBackupCodes`, `disableTwoFactor` (tin thiết bị xem D11). Thêm vào `DISABLED_PATHS`: `/two-factor/enable`, `/two-factor/disable`, `/two-factor/get-totp-uri`, `/two-factor/verify-totp`, `/two-factor/send-otp`, `/two-factor/verify-otp`, `/two-factor/verify-backup-code`, `/two-factor/generate-backup-codes`.
- **Test chống lệch:** duyệt mọi endpoint của plugin có đường dẫn `/two-factor/`, không phải `serverOnly`, phải nằm trong `DISABLED_PATHS`. Nâng cấp thư viện thêm route thì test đỏ.
- **Lý do:** `/api/auth/*` là đường dẫn công khai. Mở route plugin thì đếm sai, kiểm quyền, nhật ký đều bị vòng qua.
- **Đã cân nhắc:** mở route plugin kèm hook (khó ghi nhật ký cùng logic, phụ thuộc giới hạn 3 lần/10 giây của plugin); tự viết toàn bộ (phải tự làm mã hóa, phiên chờ; "phiên chờ xác thực" có nguy cơ quên kiểm ở một chỗ, còn plugin không tạo phiên nên an toàn từ gốc).

**Luồng đăng nhập mới**

1. `signIn`: giới hạn IP, kiểm khóa, `signInUsername` như cũ. Kiểu kết quả thêm nhánh `{ ok: true, twoFactorRequired: true }`.
2. Phản hồi có `twoFactorRedirect`: đọc tài khoản theo `usernameKey`, kiểm `status` và hạn mật khẩu tạm như cũ. Sai thì trả lỗi và không gửi cookie `two_factor` về trình duyệt. **Không xóa `loginThrottle`** (D3).
3. Ghi một dòng vào bảng có sẵn `verification`: định danh `erp-2fa:<sha256 của cookie two_factor>`, giá trị `{ userId, usernameKey, remember }`, hết hạn cùng cookie. Lý do: kết quả sai của plugin không cho biết người dùng là ai, mà đếm sai cần `usernameKey`. Lấy từ client thì kẻ gian đổi tên để né đếm. Việc này cũng giữ `remember` ở server.
4. Server action `verifyTwoFactorAction` (mới, cạnh `signInAction`) gọi `completeTwoFactorSignIn`: không có dòng trên hoặc đã hết hạn thì báo hết hạn, form về bước mật khẩu. Đúng mã thì xóa `loginThrottle`, áp `remember` lên phiên như nhánh hiện có, gọi `recordSignIn`, xóa dòng `verification`.
5. Đi qua server action nên **không thêm đường dẫn công khai nào**; form giữ nguyên `/login`, tải lại trang thì về bước mật khẩu.

Ô nhập phân biệt bằng hình dạng: đúng 6 chữ số là mã TOTP, còn lại là mã dự phòng (`classifyCode`, hàm thuần).

### D3. Mã sai đếm chung với `login_throttle` và IP (điểm 3)

- **Chọn:** mỗi lần gửi mã: `consumeSignInAttempt` (chung ngân sách 20 lần/phút/IP) → kiểm `evaluateLoginThrottle` → gọi plugin → sai thì `recordFailedAttempt` đúng như sai mật khẩu. Lỗi khóa tài khoản của plugin map sang thông báo tạm khóa hiện có.
- **Đúng mật khẩu không xóa bộ đếm** với tài khoản 2 lớp. Nếu xóa, kẻ có mật khẩu đăng nhập lại sau mỗi 4 lần sai là dò mã không giới hạn.
- **Ba lớp, mỗi lớp một việc:** (tên + IP) 5 lần/15 phút; 20 lần/phút/IP; 10 lần sai liên tiếp/tài khoản khi đổi IP liên tục (`accountLockout` của plugin, để mặc định). Lớp thứ ba cho phép người đã có mật khẩu làm chậm Giám đốc 15 phút; chấp nhận vì người đó đã giữ mật khẩu, và `auth:unlock` gỡ được.
- **Chống dùng lại:** trước khi kiểm mã 6 số, gọi `consumeRateLimit(db, "totp-used:<userId>:<sha256 của mã>", now, 1, 120)`. Câu lệnh đơn nên hai yêu cầu cùng lúc chỉ một lần qua. Trả về false thì coi như mã sai. 120 giây > 90 giây sống của mã. Không cần cột mới. Áp cho đăng nhập và đổi điện thoại; không áp cho bước xác nhận khi bật, để Giám đốc đăng nhập ngay sau khi bật không bị từ chối oan.
- **Đã cân nhắc:** lưu `last_used_step` (phải tự kiểm TOTP vì plugin không cho biết bước nào khớp); bỏ qua chống dùng lại (RFC 6238 mục 5.2 yêu cầu, và chi phí chỉ vài dòng).

### D4. 10 mã dự phòng, lưu băm, hiện một lần (điểm 4, đã chốt 0.2 #134)

- **Chọn:** 10 mã, 16 ký tự Crockford base32 (80 bit), hiện dạng `XXXX-XXXX-XXXX-XXXX`, bỏ các chữ dễ nhầm I, L, O, U. Gõ không phân biệt hoa thường, bỏ gạch, khoảng trắng (`normalizeBackupCode`, ánh xạ O→0, I/L→1).
- **Lưu băm mà vẫn dùng plugin:** cấu hình `storeBackupCodes: { encrypt, decrypt }`. `encrypt` đổi từng mã chưa băm thành `sha256:<hex>`, mã đã có tiền tố giữ nguyên (plugin ghi lại danh sách còn lại qua `encrypt` sau mỗi lần dùng). `decrypt` trả nguyên chuỗi. Service băm mã người dùng gõ rồi mới gọi `verifyBackupCode`. Route đã đóng (D2) nên không ai gửi được chuỗi băm thẳng từ trình duyệt.
- **Vì sao đủ dùng SHA-256:** mã ngẫu nhiên 80 bit không dò ngược được, không cần hàm băm chậm như mật khẩu. 10 ký tự mặc định của plugin ngắn hơn và lẫn hoa thường, khó gõ.
- **Hiện một lần:** plugin trả mã thô ở bước `enable`. Client giữ trong bộ nhớ, hiện sau khi xác nhận mã đúng, có nút Sao chép, In và ô "Tôi đã lưu các mã này". Tải lại trước khi xác nhận thì làm lại từ đầu.
- **Đã cân nhắc:** để mã hóa mặc định (issue yêu cầu băm; mã hóa thì lộ khóa là lộ hết); bảng băm riêng (phải tự kết thúc lượt nhập của plugin, đụng code nội bộ thư viện).

### D5. Mất điện thoại: lệnh CLI, cộng tự đổi điện thoại (điểm 5)

- **Chọn:** `scripts/reset-two-factor.mts`, `npm run auth:reset-2fa -- --username <tên>`, chạy bằng role `erp_app` như `auth:unlock`. Gọi `resetTwoFactorByCli` trong một transaction: xóa `two_factor`, `user.two_factor_enabled = false`, xóa mọi `session`, xóa `login_throttle` của tên đó, `logActivity` với `systemActor` của chính tài khoản đó.
- `auth:unlock` thêm: đưa `failed_verification_count` về 0, xóa `locked_until` (`--username` và `--all`).
- **Tự đổi điện thoại** (còn thiết bị cũ hoặc còn mã dự phòng): kiểm mã rồi gọi `disableTwoFactor`, sau đó cổng D1 đưa về bước bật.
- **Người chạy lệnh:** admin hệ thống, tức người giữ quyền vào DB production (0.2 #137). Đây là người vận hành, không thêm vai trò mới trong app.
- **Runbook** (`docs/ops/production.md`): xác minh người yêu cầu bằng gặp mặt hoặc gọi số đã biết, không qua tin nhắn; chạy lệnh; bật lại ngay; kiểm tra D18.
- **Thường dùng nút trên D17 (D12).** Lệnh này giữ cho khi admin cũng mất điện thoại, hoặc chưa có admin nào.
- **Đã cân nhắc:** Mọi Giám đốc gỡ được trên D17 (một Giám đốc bị chiếm tài khoản gỡ được lớp bảo vệ của người còn lại); gỡ qua email (hệ thống không có email thật).

### D6. Hiện QR: thêm `uqr`, luôn có chuỗi gõ tay (điểm 6, đã chốt 0.2 #132)

- **Chọn:** thêm `uqr@0.1.3` (MIT, không phụ thuộc gói nào). `encode()` trả ma trận, component `QrCode` vẽ thành `<svg>` bằng JSX, không `dangerouslySetInnerHTML`, không `<img data:>`, không phải nới CSP. Luôn hiện cả chuỗi bí mật chia nhóm 4 ký tự để gõ tay. K5 #40 (in nhãn QR) dùng lại được.
- **Đã cân nhắc:** `qrcode` (kéo theo `yargs`, `pngjs`, `dijkstrajs`); `qrcode-generator` (không phụ thuộc, API cũ, phải tự dựng SVG từ chuỗi HTML); chỉ gõ tay (không thêm gói, nhưng chuỗi base32 dài 52 ký tự, Giám đốc gõ trên điện thoại rất dễ sai).
- Nhãn trong app: service đổi nhãn của URI thành `<tên công ty>:<username>` thay vì email giả. Tên công ty lấy `short_name` ở Cài đặt, trống thì dùng `appName` (giữ đường lui SaaS số 4).

### D7. Nhật ký (điểm 7)

- **Chọn:** dùng action sẵn có, không thêm loại mới, D18 không đổi: `UPDATE` trên `USER` với `sensitive: true`, summary "Bật xác thực 2 lớp", "Đổi điện thoại xác thực 2 lớp", "Tạo lại mã dự phòng", "Tắt xác thực 2 lớp bằng lệnh cứu hộ". Đăng nhập bằng mã dự phòng: `recordSignIn` nhận summary và `sensitive`.
- **Giao dịch:** plugin ghi DB ngoài transaction của ta, nên làm như `signIn` hiện nay (activity-log D4): gọi plugin xong, mở transaction xóa phiên khác + `logActivity`. Ghi nhật ký lỗi thì hoàn tác thao tác (xóa `two_factor`, tắt cờ) và báo lỗi. Lệnh CLI nằm trọn một transaction.
- `coverage.test.ts`: `startTwoFactorSetup` chưa bật gì nên thêm vào `NOT_LOGGED` kèm lý do; các hàm còn lại phải gọi `logActivity`.

### D8. Dữ liệu và API

**Migration:**

- `user.two_factor_enabled boolean not null default false`.
- `user.system_admin boolean not null default false` (D12).
- Bảng `two_factor`: `id text pk`, `user_id text not null unique references user on delete cascade`, `secret text not null`, `backup_codes text not null`, `verified boolean not null default false`, `failed_verification_count integer not null default 0`, `locked_until timestamptz`, `created_at`, `updated_at`. Tên JS theo field của plugin. Thêm `twoFactor` vào schema adapter. Quyền CRUD mặc định, không phải bảng chỉ ghi thêm.

**API** (bọc `withAuth`, `permission: "twoFactor.manage"`, `allowPendingTwoFactor`, `Cache-Control: no-store`):

| Route | Input | Output |
|---|---|---|
| `POST /api/me/two-factor/setup` | `{ password }` | `{ totpUri, secretText, backupCodes[] }` |
| `POST /api/me/two-factor/confirm` | `{ code }` | `{ enabled: true }` |
| `POST /api/me/two-factor/backup-codes` | `{ password }` | `{ backupCodes[] }` |
| `POST /api/me/two-factor/replace` | `{ password, code }` | `{ enabled: false }` |
| `POST /api/me/two-factor/forget-devices` | (không) | `{ forgotten: number }` |
| `POST /api/users/[id]/two-factor/reset` (D12) | `{ password, code }` | `{ reset: true }` |

Validate bằng schema. `confirm`, `replace` thêm giới hạn 5 lần/phút theo người dùng. Các route trả Set-Cookie của plugin vì plugin đổi token phiên khi bật, tắt.

**Giao diện** (bản vẽ: `Login-TwoFactor.dc.html`, `TwoFactor.dc.html`): `/login` thêm bước mã trong `LoginForm`; `/two-factor` (`requireUser` với `allowPendingTwoFactor` rồi kiểm `can`), bố cục hai cột như màn đăng nhập; mục "Xác thực 2 lớp" trong `user-menu.tsx` theo quyền. Chữ trong `src/locales/`.

### D9. Dev và E2E

- **Dev:** chạy local với `DEMO_MODE=true` thì không bị cổng. Không thêm cờ riêng. Muốn thử thật thì tắt `DEMO_MODE`.
- **Integration test:** helper `src/test/auth.ts` đăng nhập xong mới đặt `two_factor_enabled = true` cho vai trò bắt buộc, để phiên qua được cổng D1 mà không phải nhập mã trong mọi test route.
- **E2E:** `global-setup` bật 2 lớp thật cho tài khoản `e2e.*` Giám đốc và Kế toán qua service, giữ bí mật test; `auth.setup.ts` nhập mã tính bằng helper TOTP thuần trong `tests/e2e/`. Đúng tinh thần "không có người dùng giả lập" của CLAUDE.md.

### D10. Đổi `BETTER_AUTH_SECRET`

Bí mật TOTP mã hóa bằng khóa này, nên quy trình đổi khóa hiện tại sẽ làm Giám đốc và Kế toán không đăng nhập được.

- **Xoay định kỳ:** dùng `BETTER_AUTH_SECRETS` (`"2:<mới>,1:<cũ>"`), thư viện có sẵn, vẫn giải mã được dữ liệu cũ. Có integration test.
- **Nghi lộ khóa:** bí mật TOTP coi như lộ. Sau khi đổi khóa, chạy `auth:reset-2fa` cho mọi Giám đốc và Kế toán rồi bật lại.
- Không giải mã được thì báo lỗi rõ ràng, không 500 trắng.
- Sửa Sự cố 6 trong `docs/ops/production.md`.

### D11. Tin thiết bị 30 ngày (đã chốt 0.2 #135)

- **Chọn:** dùng `trustDevice` của plugin. `completeTwoFactorSignIn` chỉ truyền `trustDevice: true` với mã 6 số có tick ô. Thời hạn đặt ở `TRUST_DEVICE_DAYS` (`src/domain/two-factor.ts`), truyền vào `trustDeviceMaxAge`.
- **Máy đã tin:** hook của plugin không tạo lượt nhập mã, `signInUsername` trả kết quả thường nên `signIn` đi đúng nhánh cũ. Đây là đăng nhập trọn vẹn nên xóa `login_throttle` như bình thường.
- **Thu hồi cho mọi máy:** `forgetTrustedDevices(tx, userId)` xóa các dòng `verification` có `identifier like 'trust-device-%'` và `value = userId`. Gọi trong transaction của: `changePassword`, đặt lại mật khẩu (`src/lib/users/service.ts`), `replaceTwoFactor`, `resetTwoFactorByCli`, và nút "Quên mọi thiết bị đã tin". Không dựa vào `disableTwoFactor` vì plugin chỉ xóa máy hiện tại.
- **Đếm thiết bị:** các dòng trên còn `expires_at > now`.
- **Mã dự phòng không tin được máy:** mã này dùng lúc mất điện thoại, thường trên máy lạ.
- Plugin xóa cookie `dont_remember` khi tin thiết bị. "Giữ đăng nhập" vẫn đúng vì server áp `persistent = false` và hạn 12 giờ theo lựa chọn lưu ở server (D2).
- **Đã cân nhắc:** không có tin thiết bị (an toàn nhất, người dùng đã chọn có); hạn cứng 30 ngày không gia hạn (plugin luôn gia hạn, muốn khác phải sửa code nội bộ thư viện).

### D12. Cờ Admin hệ thống (đã chốt 0.2 #138)

- **Chọn:** cột `user.system_admin boolean not null default false`, đọc mỗi yêu cầu vào `CurrentUser.systemAdmin`. Không thêm vai trò, cùng kiểu với `contract_scope` (0.2 #51).
- **Đặt cờ:** chỉ bằng `scripts/set-system-admin.mts`, `npm run auth:set-admin -- --username <tên> [--off]`, ghi nhật ký. Giao diện và API không có đường đặt cờ, nên chiếm được một tài khoản không tự nâng quyền được.
- **Quyền một chỗ** (`src/domain/permissions.ts`, cùng kiểu `canContract`): `canManageTwoFactor(user)` = quyền vai trò hoặc có cờ; `canResetOthersTwoFactor(user)` = có cờ; `canOpenUsers(user)` = `users.manage` hoặc có cờ. `isTwoFactorRequired` thêm tham số cờ.
- **D17:** `requirePermission("users.manage", { orSystemAdmin: true })` để test route-guards vẫn bắt được. Admin không phải Giám đốc mở qua mục trong menu người dùng; `listUsers` đọc thẳng ở server nên `GET /api/users` vẫn chỉ cho `DIRECTOR`. `listUsers` trả thêm `twoFactorEnabled`, `systemAdmin`.
- **API:** `POST /api/users/[id]/two-factor/reset`, `{ password, code }`, `{ reset: true }`, bọc `withAuth`, kiểm `canResetOthersTwoFactor` trong handler, giới hạn 5 lần/phút, `no-store`.
- **Dùng chung lõi:** `clearTwoFactor(tx, targetId)` cho `resetTwoFactorByAdmin` và `resetTwoFactorByCli`, trong một transaction cùng `forgetTrustedDevices`, xóa `session`, `login_throttle`, `logActivity`. Khóa `user` của người bị gỡ `FOR UPDATE`.
- **Vì sao bắt nhập lại mật khẩu và mã:** phiên bị bỏ quên không gỡ được 2 lớp của người khác.
- **Vì sao không gỡ cho chính mình:** kẻ chiếm được admin không tự bỏ được lớp bảo vệ. Admin tự đổi máy qua Đổi điện thoại.
- **Đã cân nhắc:** vai trò `ADMIN` riêng (tách quyền rõ nhất nhưng đụng bảng quyền, D17, quy tắc Giám đốc cuối cùng; làm change riêng nếu cần); chỉ ghi tên ở lệnh (tên tự khai, không có nút); đặt cờ trên D17 (Giám đốc bị chiếm tự nâng quyền được).

## Risks / Trade-offs

- [Admin bị chiếm tài khoản thì gỡ được 2 lớp của người khác] → admin bắt buộc bật 2 lớp, phải nhập lại mật khẩu và mã, D18 có cờ; gỡ xong kẻ gian vẫn cần mật khẩu của người bị gỡ.
- [Không ai có cờ] → lệnh `auth:reset-2fa` vẫn dùng được; runbook nhắc đặt cờ cho ít nhất một người khi lên production.
- [Máy dùng đều không bao giờ bị hỏi mã lại; kẻ có cả máy đã tin lẫn mật khẩu vào được] → ô mặc định không chọn, có nút thu hồi từ máy khác, D18 có cờ khi tin máy, đổi mật khẩu tự thu hồi.
- [Tin thiết bị trên máy dùng chung] → dòng nhắc cạnh ô tick: chỉ chọn trên máy riêng.
- [Nâng cấp thư viện đổi tên `trust-device-*`] → integration test thu hồi đỏ ngay.
- [Giám đốc duy nhất mất cả điện thoại lẫn mã dự phòng khi không ai có quyền chạy lệnh] → runbook ghi admin hệ thống là người chạy lệnh và cách liên hệ; màn bật nhắc in mã dự phòng cất nơi khác.
- [Nâng cấp `better-auth` đổi hành vi hook hay `storeBackupCodes`] → integration test luồng 2 bước, test băm, test chống lệch route; repo ghim phiên bản.
- [Giờ điện thoại lệch quá 30 giây] → màn nhập mã có dòng nhắc bật giờ tự động trên điện thoại.
- [Mã mới trùng ngẫu nhiên với mã vừa dùng trong 120 giây] → xác suất khoảng 1/1.000.000, chỉ phải đợi mã kế tiếp.
- [Lúc deploy, Giám đốc và Kế toán đang đăng nhập bị chuyển ngay tới `/two-factor`] → đúng chủ đích; báo trước.
- [Ghi nhật ký lỗi sau khi plugin đã ghi DB] → hoàn tác như D7, có integration test.

## Migration Plan

1. Migration chỉ thêm bảng và cột có mặc định, app cũ vẫn chạy được.
2. Deploy; báo trước cho Giám đốc và Kế toán chuẩn bị điện thoại.
3. Mỗi người bật ngay ở lần tải trang đầu; lưu mã dự phòng.
4. **Rollback:** deploy lại bản trước. Bản cũ không có plugin nên chỉ hỏi mật khẩu; bảng `two_factor` để nguyên, không mất dữ liệu.
