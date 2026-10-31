# Spec Delta

## MODIFIED Requirements

### Requirement: Bắt buộc đổi mật khẩu tạm
Tài khoản đang dùng mật khẩu tạm (vừa tạo, vừa được đặt lại hoặc mở khóa) SHALL được cấp thời hạn 48 giờ kể từ lúc cấp. Khi đăng nhập trong thời hạn 48 giờ, hệ thống SHALL chuyển người dùng tới `/change-password` sau khi đăng nhập. Cho tới khi đổi xong, mọi trang khác SHALL chuyển về `/change-password` và mọi API (trừ đổi mật khẩu và đăng xuất) SHALL trả 403 với thông báo "Cần đổi mật khẩu trước khi tiếp tục". Khi mật khẩu tạm đã hết hạn (quá 48 giờ chưa đổi), lần đăng nhập với mật khẩu tạm đó SHALL bị từ chối với mã 401 và thông báo "Mật khẩu tạm đã hết hạn. Liên hệ Giám đốc để cấp lại". Nếu mật khẩu không khớp, hệ thống SHALL trả thông báo sai thông thường "Tên đăng nhập hoặc mật khẩu không đúng" để không lộ trạng thái tài khoản. Đổi mật khẩu thành công SHALL xóa cờ bắt buộc đổi và hủy thời hạn mật khẩu tạm.

#### Scenario: Lần đầu đăng nhập
- **WHEN** người dùng mới `ducluc` đăng nhập bằng mật khẩu tạm `giao-7342` khi mật khẩu còn trong hạn 48 giờ
- **THEN** hệ thống chuyển tới `/change-password`, không vào `/dashboard`

#### Scenario: Cố mở trang khác khi chưa đổi
- **WHEN** `ducluc` chưa đổi mật khẩu và mở thẳng `/inventory`
- **THEN** hệ thống chuyển về `/change-password`

#### Scenario: Gọi API khi chưa đổi
- **WHEN** `ducluc` chưa đổi mật khẩu và gọi `GET /api/users`
- **THEN** API trả 403 với "Cần đổi mật khẩu trước khi tiếp tục"

#### Scenario: Đổi xong
- **WHEN** `ducluc` đổi mật khẩu tạm sang `bai-sau-kho-9` thành công
- **THEN** hệ thống chuyển tới trang mặc định theo vai trò và lần sau đăng nhập bằng `bai-sau-kho-9`, không bị bắt đổi nữa

#### Scenario: Mật khẩu tạm hết hạn sau 48 giờ
- **WHEN** `ducluc` được tạo tài khoản lúc 08:00 ngày 01/11/2026 với mật khẩu tạm `giao-7342` và cố đăng nhập bằng mật khẩu đó lúc 08:01 ngày 03/11/2026 (sau 48 giờ 1 phút)
- **THEN** đăng nhập bị từ chối với "Mật khẩu tạm đã hết hạn. Liên hệ Giám đốc để cấp lại", không tạo phiên

#### Scenario: Mật khẩu tạm hết hạn nhưng gõ sai mật khẩu
- **WHEN** mật khẩu tạm của `ducluc` đã hết hạn và ai đó cố gõ sai mật khẩu `sai-mat-khau`
- **THEN** hệ thống hiện thông báo sai thông thường "Tên đăng nhập hoặc mật khẩu không đúng", không tiết lộ mật khẩu tạm đã hết hạn
