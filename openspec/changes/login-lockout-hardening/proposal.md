# Proposal

## Why

Cơ chế tạm khóa tài khoản khi nhập sai mật khẩu hiện tại (5 lần sai liên tiếp trong 15 phút thì tạm khóa tên đăng nhập 15 phút) có lỗ hổng DoS (Denial of Service): bất kỳ ai biết tên đăng nhập (kể cả Giám đốc duy nhất) đều có thể cố tình gửi 5 yêu cầu sai mật khẩu mỗi 15 phút từ bên ngoài để chặn người dùng thật không thể đăng nhập mãi mãi.

Change này giải quyết triệt để nguy cơ cố tình chặn người khác bằng cách điều chỉnh phạm vi tạm khóa theo cặp `(username, client_ip)` kết hợp chặn IP khi spam dò mật khẩu, đồng thời cung cấp cơ chế cứu hộ cho Giám đốc khi gặp sự cố mà không làm lộ sự tồn tại của tài khoản.

## What Changes

- **Khóa theo cặp (tên đăng nhập + IP)**: Khi nhập sai 5 lần liên tiếp trong 15 phút từ cùng một địa chỉ IP đối với một tên đăng nhập, hệ thống chỉ tạm khóa đăng nhập cho tên đó **tại IP đó** trong 15 phút. Người dùng thật từ IP khác (ví dụ: máy tính ở văn phòng, điện thoại 4G) vẫn có thể đăng nhập bình thường.
- **Giới hạn tốc độ theo IP chống brute-force toàn diện**: Tận dụng cơ chế `auth_rate_limit` theo IP (hiện tại tối đa 20 lần/phút) để ngăn kẻ tấn công đổi tên dò vét hoặc dùng một IP vét cạn mật khẩu.
- **Cứu hộ Giám đốc (Emergency recovery)**: Cung cấp script dòng lệnh `scripts/unlock-user.mts` cho phép Giám đốc/quản trị viên server gỡ khóa ngay lập tức bằng truy cập máy chủ (CLI) khi có sự cố khẩn cấp.
- **Không lộ thông tin tài khoản**: Giữ nguyên thông báo lỗi đồng nhất, kẻ tấn công từ bên ngoài không thể phân biệt tên tài khoản có tồn tại hay không.
- **Xử lý dữ liệu bảng cũ**: Cập nhật bảng `login_throttle` chuyển primary key từ `username_key` sang cặp `(username_key, ip)`, đồng thời dọn dẹp các dòng khóa cũ đã hết hạn.

## Capabilities

### Modified Capabilities
- `auth`: Cập nhật requirement "Tạm khóa khi nhập sai nhiều lần" để phản ánh quy tắc khóa theo cặp `(tên đăng nhập + IP)`, đảm bảo sai từ IP này không chặn đăng nhập đúng từ IP khác, và hỗ trợ công cụ dòng lệnh gỡ khóa.

## Impact

- **Database**: Bảng `login_throttle` thay đổi primary key thành composite key `(username_key, ip)`. Tạo migration Drizzle mới.
- **Backend**: Cập nhật `src/domain/login-throttle.ts`, `src/lib/auth/sign-in.ts`, và tạo CLI tool `scripts/unlock-user.mts`.
- **Testing**: Thêm test kiểm tra sai từ IP A không chặn IP B, kiểm tra concurrent failures, kiểm tra brute force throttling và test CLI script gỡ khóa.
- **Docs**: Cập nhật tài liệu hướng dẫn cứu hộ trong `README.md` và `CLAUDE.md`.
