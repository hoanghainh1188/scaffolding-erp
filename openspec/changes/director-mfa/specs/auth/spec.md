## MODIFIED Requirements

### Requirement: Đăng nhập bằng tên đăng nhập và mật khẩu
Hệ thống SHALL cho người dùng đăng nhập ở `/login` bằng tên đăng nhập và mật khẩu; tài khoản đã bật xác thực 2 lớp SHALL nhập thêm mã. Không có đăng nhập bằng email, số điện thoại hay mạng xã hội. Tên đăng nhập không phân biệt hoa thường khi gõ. Đăng nhập xong, hệ thống SHALL chuyển tới trang `next` (nếu là đường dẫn nội bộ hợp lệ) hoặc trang mặc định theo vai trò: `/dashboard` cho Giám đốc, Kế toán, Kinh doanh; `/m` cho Thủ kho, Xưởng.

#### Scenario: Kế toán đăng nhập đúng
- **WHEN** người dùng `thuha` (vai trò `ACCOUNTANT`, đang hoạt động, đã đổi mật khẩu, đã bật 2 lớp) nhập đúng mật khẩu và mã ở `/login`
- **THEN** hệ thống tạo phiên đăng nhập và chuyển tới `/dashboard`

#### Scenario: Thủ kho đăng nhập về khu Mobile
- **WHEN** người dùng `vantung` (vai trò `WAREHOUSE`) đăng nhập đúng
- **THEN** hệ thống chuyển tới `/m`

#### Scenario: Gõ tên đăng nhập có chữ hoa
- **WHEN** người dùng gõ `ThuHa` với đúng mật khẩu của `thuha`
- **THEN** đăng nhập thành công như khi gõ `thuha`

#### Scenario: Quay lại trang đang mở dở
- **WHEN** người dùng chưa đăng nhập mở `/inventory`, bị chuyển tới `/login?next=%2Finventory` rồi đăng nhập đúng (vai trò `SALES`)
- **THEN** hệ thống chuyển tới `/inventory`

#### Scenario: Tham số next trỏ ra ngoài
- **WHEN** người dùng đăng nhập đúng từ `/login?next=https%3A%2F%2Fevil.example`
- **THEN** hệ thống bỏ qua `next` và chuyển tới trang mặc định theo vai trò

### Requirement: Tạm khóa khi nhập sai nhiều lần
Sau 5 lần đăng nhập sai liên tiếp với cùng một tên đăng nhập từ cùng một địa chỉ IP trong vòng 15 phút, hệ thống SHALL từ chối mọi lần đăng nhập với tên đó từ địa chỉ IP đó trong 15 phút kể từ lần sai thứ 5, kể cả khi mật khẩu đúng, với thông báo "Nhập sai quá nhiều lần. Thử lại sau 15 phút hoặc nhờ Giám đốc đặt lại mật khẩu". Sai mật khẩu và sai mã xác thực 2 lớp SHALL đếm chung một bộ đếm. Quy tắc áp dụng cả cho tên không tồn tại. Đăng nhập trọn vẹn từ địa chỉ IP đó (với tài khoản đã bật 2 lớp là đúng cả mã, đúng mật khẩu thôi chưa đủ), hoặc Giám đốc đặt lại mật khẩu, hoặc lệnh dòng lệnh cứu hộ SHALL xóa bản ghi khóa. Người dùng hợp lệ đăng nhập từ địa chỉ IP khác SHALL không bị chặn bởi các lần nhập sai từ địa chỉ IP ban đầu.

#### Scenario: Sai lần thứ 5
- **WHEN** người dùng `vantung` nhập sai mật khẩu 5 lần liên tiếp từ cùng một địa chỉ IP lúc 08:00–08:03
- **THEN** lần thứ 6 lúc 08:04 với mật khẩu đúng từ địa chỉ IP đó bị từ chối với thông báo tạm khóa, không tạo phiên

#### Scenario: Hết thời gian tạm khóa
- **WHEN** lần sai thứ 5 của `vantung` từ cùng IP lúc 08:03 và người đó đăng nhập đúng từ IP đó lúc 08:19
- **THEN** đăng nhập thành công và bộ đếm về 0

#### Scenario: Sai 4 lần rồi đúng
- **WHEN** người dùng `quocbao` sai 4 lần từ cùng IP rồi nhập đúng từ IP đó
- **THEN** đăng nhập thành công; lần sai tiếp theo từ IP đó được đếm lại từ 1

#### Scenario: Tên không tồn tại cũng bị tạm khóa
- **WHEN** ai đó thử tên `khongco` sai 5 lần từ cùng một IP
- **THEN** lần thứ 6 từ IP đó nhận thông báo tạm khóa giống tài khoản có thật

#### Scenario: Giám đốc đặt lại mật khẩu gỡ tạm khóa
- **WHEN** `vantung` đang bị tạm khóa và Giám đốc đặt lại mật khẩu cho `vantung`
- **THEN** `vantung` đăng nhập được ngay bằng mật khẩu tạm mới trên mọi IP

#### Scenario: Người dùng đăng nhập từ IP khác không bị chặn
- **WHEN** kẻ xấu nhập sai tên `vantung` 5 lần từ IP `1.2.3.4` lúc 08:00–08:03 khiến `vantung` bị tạm khóa ở IP `1.2.3.4`
- **THEN** lúc 08:04 người dùng `vantung` thật đăng nhập đúng mật khẩu từ IP `5.6.7.8` thành công và vào hệ thống bình thường

#### Scenario: Lệnh dòng lệnh cứu hộ gỡ tạm khóa
- **WHEN** Giám đốc duy nhất vô tình nhập sai 5 lần từ IP nhà riêng và chạy lệnh cứu hộ `npm run unlock -- giamdoc` trên server
- **THEN** bản ghi tạm khóa của `giamdoc` được dọn sạch và Giám đốc đăng nhập lại được ngay

#### Scenario: Sai mã đếm chung với sai mật khẩu
- **WHEN** `minhanh` (đã bật 2 lớp) sai mật khẩu 3 lần từ một địa chỉ IP, nhập đúng mật khẩu, rồi sai mã 2 lần từ địa chỉ IP đó trong 15 phút
- **THEN** lần nhập tiếp theo từ địa chỉ IP đó bị từ chối với thông báo tạm khóa, kể cả khi đúng mã

#### Scenario: Đúng mật khẩu không xóa bộ đếm của tài khoản 2 lớp
- **WHEN** `minhanh` sai mã 4 lần, đăng nhập lại đúng mật khẩu từ cùng địa chỉ IP, rồi sai mã thêm 1 lần
- **THEN** lần nhập tiếp theo từ địa chỉ IP đó bị từ chối với thông báo tạm khóa

#### Scenario: Đúng mã xóa bộ đếm
- **WHEN** `minhanh` sai mã 4 lần rồi nhập đúng mã từ cùng địa chỉ IP
- **THEN** đăng nhập thành công; lần sai tiếp theo từ địa chỉ IP đó được đếm lại từ 1

## ADDED Requirements

### Requirement: Quyền xác thực 2 lớp theo vai trò
Bảng quyền SHALL có `twoFactor.manage` (bật, tạo lại mã dự phòng, đổi điện thoại) cho `DIRECTOR`, `ACCOUNTANT`. Mỗi người chỉ thao tác trên chính tài khoản của mình. Không khai báo vai trò cho xác thực 2 lớp ở chỗ khác.

#### Scenario: Đọc bảng quyền
- **WHEN** đọc bảng quyền cho xác thực 2 lớp
- **THEN** `twoFactor.manage` chỉ cho `DIRECTOR`, `ACCOUNTANT`

#### Scenario: Kinh doanh gọi API bật 2 lớp
- **WHEN** `quocbao` (Kinh doanh) gửi `POST /api/me/two-factor/setup` với mật khẩu đúng
- **THEN** API trả 403 với "Bạn không có quyền thực hiện thao tác này" và không tạo bí mật nào

#### Scenario: Kinh doanh mở trang 2 lớp
- **WHEN** `quocbao` mở `/two-factor`
- **THEN** trang trả 403 **AND** menu người dùng của `quocbao` không có mục "Xác thực 2 lớp"
