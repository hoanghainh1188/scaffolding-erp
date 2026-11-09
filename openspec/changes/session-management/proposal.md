# Proposal: session-management

## Why

Phiên "Giữ đăng nhập" sống 30 ngày. Người dùng không xem được mình đang đăng nhập ở những máy nào và không tự đăng xuất máy khác được, vì các route `revoke-session*` của Better Auth đang tắt.

Mất điện thoại ở công trình thì hiện chỉ còn một cách: Giám đốc khóa cả tài khoản, người đó nghỉ làm cho tới khi được mở khóa. Rà soát bảo mật 01/11/2026 đã ghi điểm này (K14, issue #98). K13 đã xong nên làm tiếp được.

## What Changes

- Trang mới `/sessions` ("Thiết bị đăng nhập"), mở được từ menu người dùng trên Desktop và tab Cá nhân trên Mobile. Mọi vai trò đều dùng được, mỗi người chỉ thấy máy của mình.
- Mỗi dòng hiện tên thiết bị (ví dụ "Điện thoại · Chrome"), lần đăng nhập, hoạt động gần nhất, và nhãn "Máy này" ở máy đang dùng.
- Nút "Đăng xuất máy này" trên từng máy khác, nút "Đăng xuất mọi máy khác".
- Giám đốc có thêm mục "Đăng xuất mọi máy" ở menu dòng nhân viên trên D17. Tài khoản vẫn dùng được, chỉ phải đăng nhập lại.
- Máy bị đăng xuất mất hiệu lực ngay ở yêu cầu kế tiếp.
- Nhật ký D18 ghi mỗi lần đăng xuất từ xa, có cờ Dữ liệu nhạy cảm. Đăng xuất chính máy đang dùng vẫn không ghi.
- Bản demo: 5 tài khoản dùng chung không dùng được tính năng này, để khách thử không đá nhau ra.

Màn hình liên quan: D17, D18, trang Cá nhân Mobile, trang mới `/sessions` (chưa có thiết kế).

Giai đoạn: change kỹ thuật K14, ngoài nhãn [MVP], không chặn production.

Không đụng Sổ kho hay giá vốn, không ảnh hưởng số liệu đã có. Không có migration: dùng bảng `session` sẵn có.

## Ngoài phạm vi

- Đổi cách đăng nhập, thời hạn phiên, số phiên tối đa của một người.
- Hiện địa chỉ IP, vị trí, hệ điều hành của thiết bị.
- Giám đốc xem chi tiết từng máy của nhân viên, hoặc đăng xuất từng máy một của nhân viên.
- Tự động "Quên thiết bị đã tin" của xác thực 2 lớp khi đăng xuất từ xa (xem câu hỏi trong PR).
- Báo cho người dùng khi có máy lạ đăng nhập.

## Capabilities

### New Capabilities

- `session-management`: xem các thiết bị đang đăng nhập, đăng xuất từ xa, quyền và giới hạn của các thao tác đó.

### Modified Capabilities

- `activity-log`: ghi thao tác đăng xuất từ xa; làm rõ chỉ đăng xuất máy đang dùng mới không ghi.
- `auth`: trang Cá nhân trên Mobile có thêm lối vào "Thiết bị đăng nhập".

## Impact

- Code mới: `src/domain/device-session.ts`, `src/lib/auth/sessions.ts`, trang `src/app/sessions/page.tsx`, component trong `src/components/sessions/`.
- API mới: `POST /api/me/sessions/[id]/sign-out`, `POST /api/me/sessions/sign-out-others`, `POST /api/users/[id]/sign-out-all`.
- Sửa: `src/lib/users/service.ts`, `src/components/users/user-row-actions.tsx`, `src/components/shell/user-menu.tsx`, trang Cá nhân Mobile, `src/locales/vi/auth.ts`, `src/app/route-guards.test.ts`.
- `DISABLED_PATHS` của Better Auth giữ nguyên. Không thêm thư viện.
