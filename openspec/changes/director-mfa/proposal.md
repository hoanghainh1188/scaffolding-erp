# Proposal: Xác thực 2 lớp cho Giám đốc và Kế toán (`director-mfa`) [MVP, K13, bắt buộc trước production]

## Why

- Rà soát bảo mật 01/11/2026: Giám đốc có quyền cao nhất (tạo và khóa người dùng, duyệt hợp đồng, đền bù, xem nhật ký) nhưng chỉ cần mật khẩu. Lộ mật khẩu là mất quyền toàn hệ thống. Kế toán giữ công nợ, phiếu thu, phiếu chi nên cũng được bảo vệ như vậy (0.2 #133).
- Thêm một lớp mà kẻ gian có mật khẩu vẫn không qua được: mã 6 số đổi mỗi 30 giây trên điện thoại của chính người dùng (TOTP, dùng app như Google Authenticator).
- `docs/roadmap.md` xếp K13 vào nhóm phải xong trước production. K14 `session-management` chờ change này.

## What Changes

- **Bắt buộc cho Giám đốc và Kế toán.** Chưa bật thì chỉ mở được màn bật xác thực 2 lớp (`/two-factor`), giống cách bắt đổi mật khẩu tạm. Vai trò khác không bị hỏi. Bản demo (`DEMO_MODE=true`) không dùng tính năng này.
- **Đăng nhập 2 bước ở `/login`.** Đúng mật khẩu thì form chuyển sang ô nhập mã. **Chưa có phiên đăng nhập nào cho tới khi nhập đúng mã.**
- **Tin thiết bị 30 ngày** (ô tick ở bước nhập mã, mặc định không chọn): máy đã tin chỉ cần mật khẩu. Đổi mật khẩu, đổi điện thoại, lệnh cứu hộ hoặc nút "Quên mọi thiết bị đã tin" làm mọi máy mất tin.
- **Nhập sai mã đếm chung với nhập sai mật khẩu:** 5 lần trên một (tên đăng nhập + IP) thì khóa 15 phút. Thêm trần 10 lần sai liên tiếp trên một tài khoản dù đổi IP. Đúng mật khẩu không xóa bộ đếm, chỉ đúng mã mới xóa.
- **Một mã đã đăng nhập thành công không dùng lại được** trong thời gian mã còn hiệu lực.
- **10 mã dự phòng** hiện đúng một lần, lưu dạng băm, mỗi mã dùng một lần. Tạo lại thì bộ cũ mất hiệu lực.
- **Đổi điện thoại** tự làm được trên `/two-factor` (cần mật khẩu và mã hiện tại hoặc mã dự phòng).
- **Cờ Admin hệ thống** trên từng tài khoản (0.2 #138), chỉ đặt bằng lệnh `npm run auth:set-admin`. Người có cờ bắt buộc bật 2 lớp và gỡ được 2 lớp cho người khác trên D17, phải nhập lại mật khẩu và mã của mình. Không thêm vai trò mới.
- **Mất cả điện thoại lẫn mã dự phòng, không còn admin nào gỡ được:** lệnh mới `npm run auth:reset-2fa -- --username <tên>` theo runbook, ghi nhật ký, đăng xuất mọi máy.
- `npm run auth:unlock` gỡ cả khóa do nhập sai mã.
- **Nhật ký** ghi khi bật, tắt, đổi điện thoại, tạo lại mã dự phòng, đăng nhập bằng mã dự phòng. Không bao giờ ghi bí mật hay mã.
- **Mọi route của thư viện cho xác thực 2 lớp đều đóng ở HTTP.** Thao tác đi qua code riêng trong `src/lib/auth/`, như đăng nhập hiện nay.

## Capabilities

### New Capabilities

- `two-factor-auth`: bật, đăng nhập 2 bước, mã dự phòng, đổi điện thoại, cứu hộ khi mất điện thoại.

### Modified Capabilities

- `auth`: quy tắc tạm khóa tính cả mã sai; thêm quyền `twoFactor.manage`.
- `user-management`: admin hệ thống mở được D17 để gỡ 2 lớp.
- `activity-log`: thêm các dòng nhật ký xác thực 2 lớp.

## Màn hình

- **Đăng nhập, bước nhập mã:** `Login-TwoFactor.dc.html` (mới).
- **`/two-factor`** (mới, `TwoFactor.dc.html`): trang đứng riêng như `/change-password`, không nằm trong D1–D18.
- **D17:** thêm mục "Gỡ xác thực 2 lớp" trong menu của dòng, chỉ admin hệ thống thấy; admin không phải Giám đốc chỉ có mục này. **D18** hiện thêm các dòng nhật ký mới.
- Hai màn trên đã vẽ trong `docs/design/screens/` (0.2 #136), đã duyệt 09/11/2026. Riêng hộp thoại gỡ 2 lớp trên D17 vẽ thêm sau, **chờ duyệt**.

## Ngoài phạm vi

- Xác thực 2 lớp cho Kinh doanh, Thủ kho, Xưởng.
- Mã gửi qua SMS, email; khóa bảo mật phần cứng, passkey.
- Vai trò `ADMIN` riêng trong bảng 5 vai trò.
- Xem và đăng xuất thiết bị từ xa (K14 `session-management`).
- Sổ kho, giá vốn, tiền thuê: không đổi, không ảnh hưởng số liệu đã có.

## Impact

- **DB:** bảng mới `two_factor`, cột `user.two_factor_enabled`, `user.system_admin`.
- **Code:** `src/lib/auth/` (cấu hình plugin, `sign-in.ts`, `guard.ts`, `session.ts`), `src/domain/two-factor.ts` (mới), `src/domain/permissions.ts`, `src/app/login/`, `src/app/two-factor/` (mới), `src/app/api/me/two-factor/` (mới), `scripts/`, `src/components/shell/user-menu.tsx`, `src/locales/`, `src/lib/auth/change-password.ts`, `src/lib/users/service.ts`, `src/components/users/`, `src/app/api/users/[id]/two-factor/` (mới).
- **Phụ thuộc:** không thêm gói nào cho TOTP (plugin nằm sẵn trong `better-auth`). Hiện mã QR thêm gói `uqr` (0.2 #132, design D6).
- **Vận hành:** `docs/ops/production.md` thêm quy trình mất điện thoại và sửa quy trình đổi `BETTER_AUTH_SECRET` (bí mật TOTP được mã hóa bằng khóa này).
- **Dev và E2E:** chạy local với `DEMO_MODE=true` để bỏ qua bước này; E2E bật 2 lớp thật cho tài khoản `e2e.*` Giám đốc và Kế toán (design D9).
