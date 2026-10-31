# Design

## Context

Mật khẩu tạm hiện tại có cấu trúc gồm 1 từ tiếng Việt không dấu (trong danh sách 256 từ) và 4 chữ số (ví dụ `giao-7342`), tương đương khoảng 21 bit entropy. Đây là thiết kế có chủ đích để Giám đốc có thể đọc trực tiếp cho công nhân/thủ kho ngoài bãi/xưởng qua điện thoại một cách dễ dàng và nhanh chóng. Tuy nhiên, nếu không có thời hạn hết hạn, mật khẩu này tồn tại vĩnh viễn cho đến khi người dùng đăng nhập.

## Goals / Non-Goals

**Goals:**
- Tự động vô hiệu hóa mật khẩu tạm sau 48 giờ kể từ khi được cấp (khi tạo mới, reset mật khẩu, mở khóa).
- Không làm suy giảm trải nghiệm: vẫn giữ dạng từ ngữ dễ đọc qua điện thoại.
- Đảm bảo bảo mật: không làm lộ trạng thái tài khoản nếu người nhập gõ sai mật khẩu.
- Giúp Giám đốc dễ dàng quan sát trên giao diện D17 và cấp lại mật khẩu tạm mới với 1 click.

**Non-Goals:**
- Không thay đổi độ phức tạp của mật khẩu tạm (vẫn giữ format 1 từ + 4 số vì đã có rate-limiting và 48h expiry bảo vệ an toàn).
- Không gửi SMS/email tự động (hệ thống vận hành theo quy trình gọi điện/gặp mặt trực tiếp tại bãi/xưởng).

## Decisions

### 1. Thời hạn 48 giờ tính từ lúc nào?
- **Lựa chọn**: 48 giờ (tương đương `48 * 60 * 60 * 1000 ms = 172.800.000 ms`).
- **Thời điểm tính**: Tính từ mốc thời gian sự kiện cấp mật khẩu tạm diễn ra:
  - Khi tạo tài khoản mới: `now + 48h`.
  - Khi Giám đốc đặt lại mật khẩu: `now + 48h`.
  - Khi Giám đốc mở khóa tài khoản: `now + 48h`.
  - Khi chạy CLI tạo Giám đốc đầu tiên: `now + 48h`.
- **Khi người dùng đổi mật khẩu thành công**: Xóa hạn dùng (`tempPasswordExpiresAt = null`) và đặt `mustChangePassword = false`.

### 2. Lưu hạn ở đâu & xử lý dữ liệu cũ?
- **Lựa chọn**: Lưu tại bảng `user` trong cơ sở dữ liệu: cột `temp_password_expires_at timestamp with time zone`.
- **Lý do**: Toàn bộ trạng thái vòng đời người dùng (`status`, `mustChangePassword`, `lastLoginAt`) đều nằm ở bảng `user`. Khi load thông tin đăng nhập trong `signIn`, thông tin này đã được query sẵn.
- **Xử lý dữ liệu cũ (Migration)**:
  - Khi chạy migration: với những user đang có `must_change_password = true`, đặt `temp_password_expires_at = now() + interval '48 hours'`. User có `must_change_password = false` thì giữ `null`.

### 3. Thông báo ở `/login` khi mật khẩu tạm hết hạn
- **Lựa chọn**:
  - Khi người dùng nhập **đúng mật khẩu tạm** nhưng mật khẩu tạm đó đã quá hạn (`now >= tempPasswordExpiresAt`): trả về mã `401` (hoặc `403`) kèm thông báo rõ ràng: `"Mật khẩu tạm đã hết hạn. Liên hệ Giám đốc để cấp lại"`.
  - Khi người dùng nhập **sai mật khẩu**: hệ thống luôn trả về `"Tên đăng nhập hoặc mật khẩu không đúng"`. Kẻ tấn công không thể phân biệt mật khẩu tạm có hết hạn hay không.

### 4. Hiển thị trên D17 Người dùng
- **Lựa chọn**:
  - Tại cột "Trạng thái", nếu tài khoản đang `ACTIVE`, có `mustChangePassword = true` và `tempPasswordExpiresAt` đã quá hạn so với hiện tại:
    - Hiển thị badge: `ToneBadge tone="warning"` với chữ `"Hết hạn mật khẩu tạm"`.
  - Trong menu ba chấm hoặc thao tác dòng:
    - Mục "Đặt lại mật khẩu" chuyển thành (hoặc hiển thị rõ) `"Cấp lại mật khẩu tạm"`. Khi bấm, Giám đốc xác nhận và nhận mã mật khẩu tạm mới có hiệu lực 48 giờ tiếp theo.

### 5. Có tăng độ dài mật khẩu tạm không?
- **Lựa chọn**: **Không tăng độ dài**.
- **Lý do**: Định dạng `[từ-tiếng-việt]-[4 số]` là đặc trưng nghiệp vụ cốt lõi để đọc qua điện thoại ngoài công trường/bãi giàn giáo mà không bị nhầm lẫn dấu hay ký tự đặc biệt. Với cơ chế tạm khóa theo IP (5 lần sai bị khóa 15 phút), rate limit 20 req/phút/IP và thời hạn 48 giờ, không gian 21 bit là hoàn toàn an toàn trước tấn công brute-force trực tuyến.

## Risks / Trade-offs

- **[Risk] Lệch múi giờ giữa client và server khi hiển thị hạn**:
  - *Mitigation*: Mốc thời gian được lưu dạng UTC (`timestamp with time zone`). Server truyền `now` vào component như các bảng dữ liệu khác để tránh hydration mismatch.
