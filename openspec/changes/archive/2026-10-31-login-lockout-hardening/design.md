# Design

## Context

Trong phiên bản ban đầu của `auth-and-roles`, bảng `login_throttle` lưu số lần nhập sai theo `username_key`. Khi một tên đăng nhập bị sai 5 lần trong 15 phút, nó bị khóa trong 15 phút trên toàn hệ thống. Kẻ tấn công biết username (như `giamdoc`) có thể định kỳ gửi sai 5 lần để từ chối dịch vụ đối với người dùng hợp lệ.

## Goals / Non-Goals

**Goals:**
- Ngăn chặn kẻ tấn công DoS người dùng hợp lệ bằng cách gửi yêu cầu sai mật khẩu từ xa.
- Giữ vững khả năng chống brute-force mật khẩu đối với một tài khoản cụ thể từ cùng một địa chỉ máy/IP.
- Vẫn bảo mật tuyệt đối: không tiết lộ username có tồn tại hay không trong hệ thống.
- Cung cấp phương thức mở khóa dự phòng qua CLI cho Giám đốc / Sysadmin nếu chẳng may Giám đốc bị khóa từ IP hiện tại.

**Non-Goals:**
- Không thay đổi màn hình hay quy trình đăng nhập phía client (giữ nguyên `/login`, form, lỗi trả về).
- Không thêm màn hình quản lý khóa phức tạp ở giao diện D17 (đã có tính năng Giám đốc đổi/đặt lại mật khẩu cho người khác ở D17, tự động xóa bộ đếm khóa).

## Decisions

### 1. Khóa theo cặp `(username, client_ip)`
- **Lựa chọn**: Khóa theo cặp `(username_key, ip)` với ngưỡng 5 lần sai trong 15 phút $\rightarrow$ khóa 15 phút cho cặp `(username_key, ip)` đó.
- **Lý do**:
  - Nếu kẻ tấn công từ IP `A` cố tình nhập sai 5 lần tên `giamdoc`, chỉ cặp `(giamdoc, A)` bị tạm khóa.
  - Giám đốc ngồi tại văn phòng hay ở nhà (IP `B`) nhập mật khẩu đúng vẫn vào hệ thống bình thường.
  - Ngăn chặn triệt để tấn công DoS có chủ đích.
- **Phương án khác đã cân nhắc**:
  - *Chờ tăng dần (Exponential backoff)*: 1 phút, 2 phút, 4 phút... vẫn khiến người dùng bị chậm nếu áp dụng toàn cục trên username.
  - *Chỉ khóa theo IP*: Kẻ tấn công có thể thử nhiều username khác nhau nếu chưa chạm ngưỡng rate-limit chung. Bằng cách kết hợp `auth_rate_limit` (20 lần/phút/IP) và `login_throttle` `(username, ip)`, cả hai hướng tấn công đều bị chặn.

### 2. Cứu hộ Giám đốc (Emergency Unlock)
- **Lựa chọn**: Tạo script dòng lệnh `scripts/unlock-user.mts` nhận tham số `username` (hoặc `--all`) để xóa các bản ghi tạm khóa trong `login_throttle`.
- **Lý do**:
  - Giám đốc duy nhất nếu tự mình nhập sai quá 5 lần trên máy cá nhân (chính IP của mình bị khóa) không thể nhờ ai khác gỡ trên web.
  - Có thể chạy lệnh qua SSH/console server: `npm run unlock -- <username>` hoặc chuyển mạng (sang 4G điện thoại với IP khác) để đăng nhập ngay mà không bị gián đoạn công việc.

### 3. Có cho Giám đốc xem/gỡ tạm khóa ở D17 không?
- **Lựa chọn**: Ở D17, Giám đốc đã có chức năng "Đặt lại mật khẩu" cho người khác. Khi đặt lại mật khẩu, hệ thống xóa toàn bộ bản ghi `login_throttle` của username đó (bất kể IP nào). Không cần thêm cột/màn hình xem tạm khóa riêng ở D17 trong MVP để giữ UI đơn giản, tập trung.

### 4. Xử lý dữ liệu cũ trong bảng `login_throttle`
- **Lựa chọn**:
  - Thay đổi cấu trúc bảng `login_throttle`: thêm cột `ip text not null default 'unknown'`, chuyển primary key thành `(username_key, ip)`.
  - Migration script xóa các bản ghi cũ đã hết hạn (`locked_until < now()`), đối với các bản ghi còn lại gán `ip = 'unknown'`.
  - Khuyến khích xóa sạch bảng `login_throttle` khi chạy migration vì đây chỉ là dữ liệu bộ đếm tạm thời (transient cache).

## Risks / Trade-offs

- **[Risk] Khách hàng dùng chung mạng NAT / IP văn phòng**:
  - *Mitigation*: Nếu hai người dùng cùng một văn phòng nhập sai cho các tài khoản khác nhau, họ không bị ảnh hưởng vì khóa theo cặp `(username, ip)`. Chỉ khi kẻ nội bộ cùng mạng LAN cố tình nhập sai tài khoản của đồng nghiệp thì tài khoản đó mới bị khóa trên IP chung đó; khi đó đồng nghiệp có thể dùng 4G đăng nhập hoặc nhờ Giám đốc đặt lại mật khẩu / chạy CLI unlock.
- **[Risk] Proxy giả mạo IP (`X-Forwarded-For`)**:
  - *Mitigation*: Hàm `clientIp` hiện tại đọc phần tử cuối cùng do reverse proxy kiểm soát, đảm bảo an toàn phía sau proxy tiêu chuẩn.
