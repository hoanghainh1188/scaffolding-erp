# Tasks: director-mfa

## 1. Migration, schema, quyền

- [ ] 1.1 Migration: `user.two_factor_enabled`, bảng `two_factor` (design D8); thêm `twoFactor` vào schema Drizzle và adapter. Integration test: `user_id` trùng bị DB từ chối; role `erp_app` đọc ghi được.
- [ ] 1.2 Thêm `twoFactor.manage` (`DIRECTOR`, `ACCOUNTANT`) vào `src/domain/permissions.ts`. Test bảng quyền theo spec `auth` xanh.
- [ ] 1.3 Bật plugin `twoFactor` (trước `nextCookies`), thêm 8 đường dẫn vào `DISABLED_PATHS`. Test chống lệch: mọi endpoint HTTP `/two-factor/*` của plugin đều bị đóng; integration test `POST /api/auth/two-factor/verify-totp` trả 404.

## 2. Hàm thuần và unit test

- [ ] 2.1 `src/domain/two-factor.ts`: `isTwoFactorRequired`, hằng số (10 mã, 10 phút, 120 giây, 5 lần/phút). Unit test: `DIRECTOR`, `ACCOUNTANT` + không demo = bắt buộc; `DIRECTOR` + demo, `ACCOUNTANT` + demo, `SALES`, `WAREHOUSE`, `WORKSHOP` = không.
- [ ] 2.2 `classifyCode`, `normalizeBackupCode`, `formatBackupCode`. Unit test: `492817` là TOTP; `3jw8 r2nb f7vc q5ky` chuẩn hóa thành `3JW8R2NBF7VCQ5KY`; O→0, I/L→1; `12345` và chuỗi rỗng bị từ chối.
- [ ] 2.3 `generateBackupCodes` (crypto ngẫu nhiên, 16 ký tự Crockford), `hashBackupCodes` và `storeBackupCodes`. Unit test: băm hai lần không đổi kết quả; danh sách lưu không chứa mã gốc; chạy `encrypt` trên danh sách đã băm giữ nguyên.
- [ ] 2.4 Đếm sai: unit test bộ `recordFailure` hiện có với chuỗi 3 sai mật khẩu + 2 sai mã = khóa; 4 sai mã + đúng mã = reset (`src/domain/login-throttle.ts` không đổi).
- [ ] 2.5 `relabelTotpUri` đổi nhãn sang `<công ty>:<username>`, giữ `secret`, `issuer`, `digits`, `period`; `secretTextOf` chia nhóm 4 ký tự. Unit test.

## 3. Service và integration test

- [ ] 3.1 `signIn` nhận phản hồi `twoFactorRedirect`, ghi dòng `verification` `erp-2fa:*`, không xóa `login_throttle`. Integration test: đúng mật khẩu không tạo phiên, không có `session` trong DB; tài khoản khóa và mật khẩu tạm hết hạn không nhận cookie `two_factor`.
- [ ] 3.2 `completeTwoFactorSignIn` (TOTP): giới hạn IP, kiểm khóa, chống dùng lại, gọi plugin, đúng thì xóa throttle, áp `remember`, `recordSignIn`. Integration test đủ scenario "Đăng nhập hai bước": đúng mã; quá 10 phút; không giữ đăng nhập thành phiên 12 giờ; `usernameKey` lấy từ server, cookie giả bị từ chối.
- [ ] 3.3 Đếm sai và khóa: integration test 3 sai mật khẩu + 2 sai mã bị khóa theo (tên, IP); đúng mật khẩu không xóa bộ đếm; 10 sai mã từ 3 IP thì IP thứ tư bị khóa; hết 15 phút mở lại.
- [ ] 3.4 Chống dùng lại: integration test mã đã dùng bị từ chối trong 120 giây; hai yêu cầu cùng lúc với cùng mã chỉ một lần qua.
- [ ] 3.5 Mã dự phòng khi đăng nhập: integration test dùng được một lần; dùng lần hai bị từ chối; hai yêu cầu cùng lúc chỉ một lần qua; số mã còn lại đúng.
- [ ] 3.6 `startTwoFactorSetup`, `confirmTwoFactorSetup`: integration test sai mật khẩu; sai mã không bật; bỏ dở làm lại ra bí mật mới; bật xong phiên khác bị xóa, phiên hiện tại giữ `persistent`; cột `secret`, `backup_codes` không chứa bản gốc; từ chối khi demo.
- [ ] 3.7 `regenerateBackupCodes`, `replaceTwoFactor`: integration test bộ cũ mất hiệu lực; đổi điện thoại bằng mã 6 số và bằng mã dự phòng; sai mã thì 2 lớp giữ nguyên.
- [ ] 3.8 Nhật ký: integration test đủ scenario `activity-log`, không dòng nào chứa mã, bí mật; ghi nhật ký lỗi thì hoàn tác bật 2 lớp. `coverage.test.ts` xanh (`startTwoFactorSetup` vào `NOT_LOGGED`).
- [ ] 3.9 `mustEnrollTwoFactor` trong `resolveCurrentUser`, chặn trong `requireUser`, `withAuth` (thứ tự sau đổi mật khẩu). Integration test đủ scenario "Giám đốc bắt buộc bật", gồm đổi vai trò sang `DIRECTOR`. Helper `src/test/auth.ts` đặt cờ 2 lớp cho vai trò bắt buộc sau khi đăng nhập (design D9); toàn bộ integration test hiện có xanh.
- [ ] 3.10 Đổi khóa: integration test đọc được bí mật cũ khi cấu hình `BETTER_AUTH_SECRETS` có khóa cũ; khóa sai thì báo lỗi rõ ràng, không 500.

- [ ] 3.11 Tin thiết bị: `TRUST_DEVICE_DAYS` và truyền `trustDevice` chỉ cho mã 6 số. Integration test đủ scenario "Tin thiết bị 30 ngày": máy đã tin không hỏi mã, xóa `login_throttle`; quá 30 ngày hỏi lại; gia hạn sau mỗi lần đăng nhập; mã dự phòng không tin được; "Giữ đăng nhập" không chọn vẫn là phiên 12 giờ khi có tin thiết bị.
- [ ] 3.12 `forgetTrustedDevices` gọi trong `changePassword`, đặt lại mật khẩu, `replaceTwoFactor`, `resetTwoFactorByCli`, và nút quên (có `logActivity`). Integration test đủ scenario "Thu hồi thiết bị đã tin", gồm 2 máy cùng mất tin khi đổi điện thoại; số thiết bị chỉ đếm dòng còn hạn.

## 4. Lệnh dòng lệnh

- [ ] 4.1 `resetTwoFactorByCli` (một transaction) và `scripts/reset-two-factor.mts`, script `auth:reset-2fa`. Integration test: xóa `two_factor`, cờ tắt, mọi phiên hết, throttle hết, có dòng nhật ký; tên sai thoát mã khác 0; tài khoản chưa bật báo rõ.
- [ ] 4.2 `auth:unlock` xóa thêm `failed_verification_count`, `locked_until` (`--username`, `--all`). Mở rộng `unlock-user.int.test.ts`.

## 5. API và giao diện

- [ ] 5.1 Năm route `/api/me/two-factor/*` (design D8), validate bằng schema, `no-store`, chuyển Set-Cookie, giới hạn 5 lần/phút. Integration test từng route; `quocbao` (Kinh doanh) nhận 403; `route-guards.test.ts` xanh.
- [ ] 5.2 Thêm `uqr` ghim đúng `0.1.3` (0.2 #132), lockfile đúng để `npm ci` trên CI xanh. Component `QrCode` (design D6): component test vẽ `<svg>`, không dùng `dangerouslySetInnerHTML`; `check-colors` xanh.
- [ ] 5.3 Trang `/two-factor` theo `TwoFactor.dc.html`: các bước bật, màn mã dự phòng (Sao chép, In, ô đã lưu), trạng thái còn N mã, số thiết bị đang tin, nút quên, tạo lại, đổi điện thoại. Component test; trang trả 403 với vai trò khác; mobile 320px không tràn.
- [ ] 5.4 `/login` bước nhập mã theo `Login-TwoFactor.dc.html`: `verifyTwoFactorAction`, `inputMode="numeric"`, `autoComplete="one-time-code"`, ô "Tin thiết bị này 30 ngày" (mặc định không chọn, ẩn ở ô mã dự phòng, có dòng nhắc chỉ chọn trên máy riêng), chuyển sang ô mã dự phòng, lỗi trong `role="alert"`. Component test đủ trạng thái; `clearSessionCookies` xóa cả cookie `two_factor`.
- [ ] 5.5 Mục "Xác thực 2 lớp" trong `user-menu.tsx` theo quyền; chữ trong `src/locales/`. Component test: hiện với Giám đốc, Kế toán; ẩn với Kinh doanh.

## 6. E2E và tài liệu

- [ ] 6.1 Helper TOTP thuần trong `tests/e2e/`; `global-setup` bật 2 lớp cho tài khoản `e2e.*` Giám đốc và Kế toán; `auth.setup.ts` nhập mã. Toàn bộ E2E hiện có xanh với hai vai trò này đã bật 2 lớp.
- [ ] 6.2 E2E `two-factor.spec.ts`: đúng mật khẩu thì hiện ô mã; đúng mã vào `/dashboard`; sai mã báo lỗi; Giám đốc và Kế toán chưa bật bị chuyển `/two-factor`; bật từ đầu tới cuối; tick tin thiết bị thì lần sau không hỏi mã.
- [ ] 6.3 `docs/ops/production.md`: quy trình mất điện thoại (xác minh người yêu cầu), sửa Sự cố 6 đổi khóa, thêm `auth:reset-2fa`. `CLAUDE.md`: lệnh mới, ghi chú dev dùng `DEMO_MODE=true`, ghi chú E2E, quy ước module. Xem lại bằng mắt.
- [ ] 6.4 `npm run lint && npm run typecheck && npm test && npm run test:e2e` và `npx openspec validate director-mfa --strict` đều xanh. Gắn nhãn `update-snapshots` nếu ảnh mốc đổi.
- [ ] 6.5 Kiểm tra tay trên điện thoại thật: bật 2 lớp cho Giám đốc và Kế toán; đăng nhập cần mã; mã sai bị đếm như sai mật khẩu; một mã dự phòng dùng được đúng một lần; tin thiết bị rồi bấm quên từ máy khác thì bị hỏi lại mã; `auth:unlock` và `auth:reset-2fa` theo runbook. Chưa làm được thì ghi "làm sau, theo dõi ở #33" và thêm mục vào issue #33.

## Workflow follow-up

- Review code, merge PR apply, rồi `/opsx:archive director-mfa` trong phiên mới, PR ghi `Closes #97`.
