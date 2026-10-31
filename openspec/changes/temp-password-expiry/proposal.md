# Proposal

## Why

Mật khẩu tạm (dạng `giao-7342`, khoảng 21 bit) được cấp khi tạo tài khoản, đặt lại mật khẩu hoặc mở khóa tài khoản. Hiện tại, mật khẩu tạm này không có thời hạn hết hạn. Nếu tài khoản được tạo hoặc đặt lại mật khẩu mà người dùng chưa đăng nhập, mật khẩu tạm sẽ tồn tại mãi mãi trong hệ thống, tạo nguy cơ bảo mật bị dò đoán theo thời gian.

Change này bổ sung cơ chế hết hạn sau **48 giờ** cho mật khẩu tạm. Sau 48 giờ chưa đăng nhập để đổi mật khẩu mới, mật khẩu tạm sẽ tự động hết hạn; Giám đốc có thể dễ dàng nhận biết trạng thái này trên màn hình D17 Người dùng và cấp lại mật khẩu tạm mới với một thao tác bấm nút.

## What Changes

- **Thời hạn mật khẩu tạm 48 giờ**: Khi tạo người dùng mới, đặt lại mật khẩu hoặc mở khóa tài khoản, hệ thống cấp mật khẩu tạm có thời hạn 48 giờ (lưu mốc `tempPasswordExpiresAt`).
- **Kiểm tra khi đăng nhập**:
  - Nếu đăng nhập bằng mật khẩu tạm còn hạn: cho phép đăng nhập và chuyển hướng bắt buộc đổi mật khẩu mới (như hiện tại). Đổi xong, mật khẩu tạm và hạn dùng bị hủy.
  - Nếu mật khẩu tạm đã hết hạn (quá 48 giờ): từ chối đăng nhập với thông báo rõ ràng "Mật khẩu tạm đã hết hạn. Liên hệ Giám đốc để cấp lại", không tạo phiên.
  - Bảo mật không lộ tài khoản: nếu mật khẩu sai, hệ thống vẫn trả thông báo sai thông thường "Tên đăng nhập hoặc mật khẩu không đúng", không tiết lộ tài khoản có tồn tại hay mật khẩu tạm đã hết hạn hay chưa.
- **Hiển thị và cấp lại trên D17 Người dùng**:
  - Tại bảng người dùng D17, các tài khoản có `mustChangePassword = true` và `tempPasswordExpiresAt < now` sẽ được hiển thị huy hiệu cảnh báo (ví dụ: ToneBadge "Hết hạn mật khẩu tạm").
  - Menu thao tác hoặc nút hành động nhanh cho phép Giám đốc "Cấp lại mật khẩu tạm" (đặt lại mật khẩu và cấp hạn 48 giờ mới).
- **Database Schema**: Thêm cột `temp_password_expires_at` (timestamp with time zone, nullable) vào bảng `user`.
- **Dữ liệu cũ khi migrate**: Các tài khoản hiện có đang có `must_change_password = true` sẽ được gán `temp_password_expires_at = now() + 48 hours` để tránh đột ngột khóa nhân viên đang chờ đăng nhập.

## Capabilities

### Modified Capabilities
- `auth`: Cập nhật requirement đăng nhập bằng mật khẩu tạm: mật khẩu tạm hết hạn sau 48 giờ kể từ lúc cấp; quá hạn bị từ chối đăng nhập; sai mật khẩu vẫn nhận thông báo chung không lộ tài khoản.
- `user-management`: Cập nhật requirement quản lý tài khoản: D17 hiển thị trạng thái mật khẩu tạm hết hạn và cho phép Giám đốc cấp lại mật khẩu tạm mới (gia hạn 48 giờ).

## Impact

- **Database**: Bảng `user` thêm cột `temp_password_expires_at`. Tạo migration Drizzle mới.
- **Backend**: Cập nhật logic `src/lib/auth/sign-in.ts`, `src/lib/users/service.ts`, `src/lib/users/first-director.ts`, `src/lib/users/seed.ts`.
- **Frontend**: Cập nhật D17 `src/components/users/users-screen.tsx`, `src/components/users/user-row-actions.tsx`.
- **Testing**: Thêm test cho các mốc thời gian: trước 48h (vào được), đúng mốc 48h, sau 48h (hết hạn), đặt lại cấp hạn mới.
