# Spec Delta

## MODIFIED Requirements

### Requirement: Danh sách người dùng
D17 SHALL hiện bảng người dùng gồm: Họ tên (kèm chữ viết tắt và tên đăng nhập), Vai trò, Dùng trên, Đăng nhập gần nhất, Trạng thái (Đang dùng / Đã khóa / Hết hạn mật khẩu tạm). Khi một tài khoản Đang dùng có mật khẩu tạm đã hết hạn sau 48 giờ chưa đăng nhập, cột Trạng thái SHALL hiện huy hiệu "Hết hạn mật khẩu tạm". Đầu trang SHALL hiện số người đang dùng và số tài khoản đã khóa. Tài khoản Đang dùng xếp trước Đã khóa; cùng trạng thái xếp theo họ tên. Danh sách SHALL không bao giờ trả về mật khẩu hay mã băm.

#### Scenario: Đếm đầu trang
- **WHEN** DB có 7 tài khoản Đang dùng và 1 tài khoản Đã khóa
- **THEN** đầu trang hiện "7 người đang dùng · 1 tài khoản đã khóa" **AND** dòng `ngoclam` (Đã khóa) nằm cuối bảng

#### Scenario: API không lộ mật khẩu
- **WHEN** Giám đốc gọi `GET /api/users`
- **THEN** mỗi phần tử chỉ có id, họ tên, tên đăng nhập, vai trò, trạng thái, thiết bị, thời điểm đăng nhập gần nhất và thời điểm hết hạn mật khẩu tạm (nếu có); không có trường mật khẩu hay mã băm

#### Scenario: Hiện trạng thái hết hạn mật khẩu tạm
- **WHEN** `ducluc` được cấp mật khẩu tạm quá 48 giờ trước và chưa đăng nhập
- **THEN** dòng `ducluc` ở cột Trạng thái hiện huy hiệu "Hết hạn mật khẩu tạm"

### Requirement: Đặt lại mật khẩu
Giám đốc SHALL đặt lại mật khẩu cho một tài khoản Đang dùng khác (hoặc cấp lại khi mật khẩu tạm đã hết hạn). Hệ thống SHALL thay mật khẩu bằng mật khẩu tạm mới (hiện một lần) có thời hạn 48 giờ mới, bắt đổi ở lần đăng nhập kế tiếp, xóa bộ đếm nhập sai và kết thúc ngay mọi phiên đang mở của người đó. Giám đốc tự đổi mật khẩu của mình ở màn Đổi mật khẩu, không dùng đặt lại.

#### Scenario: Thủ kho quên mật khẩu
- **WHEN** `vantung` đang đăng nhập trên điện thoại và Giám đốc bấm "Đặt lại mật khẩu" cho `vantung`
- **THEN** Giám đốc thấy mật khẩu tạm mới một lần có thời hạn 48 giờ **AND** thao tác tiếp theo trên điện thoại của `vantung` bị chuyển tới `/login` **AND** mật khẩu cũ không đăng nhập được nữa

#### Scenario: Đặt lại cho tài khoản đã khóa
- **WHEN** Giám đốc gọi đặt lại mật khẩu cho `ngoclam` (Đã khóa)
- **THEN** hệ thống từ chối với "Mở khóa tài khoản trước khi đặt lại mật khẩu"

#### Scenario: Cấp lại mật khẩu tạm khi đã hết hạn
- **WHEN** mật khẩu tạm của `ducluc` đã hết hạn và Giám đốc chọn "Cấp lại mật khẩu tạm" (hoặc Đặt lại mật khẩu)
- **THEN** Giám đốc nhận được mật khẩu tạm mới với thời hạn 48 giờ tính từ thời điểm cấp lại
