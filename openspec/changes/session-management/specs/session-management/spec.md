# Spec Delta

## Purpose

Cho mỗi người dùng biết tài khoản của mình đang đăng nhập ở những thiết bị nào và đăng xuất từ xa được, và cho Giám đốc đăng xuất mọi thiết bị của một nhân viên mà không phải khóa tài khoản.

## ADDED Requirements

### Requirement: Xem thiết bị đang đăng nhập
Trang `/sessions` ("Thiết bị đăng nhập") SHALL cho mọi người đã đăng nhập xem các phiên còn hiệu lực của chính mình. Phiên đã hết hạn, và phiên không chọn "Giữ đăng nhập" quá 12 giờ, SHALL không hiện. Trang SHALL hiện tối đa 50 phiên, máy đang dùng đứng đầu, còn lại theo hoạt động gần nhất giảm dần.

#### Scenario: Xem máy của mình
- **WHEN** `quocbao` (Kinh doanh) đang đăng nhập trên máy tính và một điện thoại, rồi mở `/sessions` từ máy tính
- **THEN** trang có 2 dòng, dòng đầu là máy tính có nhãn "Máy này"

#### Scenario: Không thấy máy của người khác
- **WHEN** `thuha` và `quocbao` đều đang đăng nhập, `thuha` mở `/sessions`
- **THEN** trang chỉ có các phiên của `thuha`

#### Scenario: Phiên ngắn đã quá 12 giờ
- **WHEN** `vantung` đăng nhập không chọn "Giữ đăng nhập" lúc 07:00 ngày 09/11/2026, rồi xem `/sessions` trên máy khác lúc 19:01 cùng ngày
- **THEN** phiên lúc 07:00 không hiện

#### Scenario: Chưa đăng nhập
- **WHEN** người chưa đăng nhập mở `/sessions`
- **THEN** hệ thống chuyển tới `/login`

### Requirement: Thông tin trên mỗi dòng thiết bị
Mỗi dòng SHALL hiện tên thiết bị dạng "Loại thiết bị · Trình duyệt" suy từ User-Agent lúc đăng nhập, thời điểm đăng nhập, và hoạt động gần nhất theo giờ Việt Nam. Máy đang dùng SHALL hiện "Đang dùng" thay cho hoạt động gần nhất. Trang SHALL ghi rõ hoạt động gần nhất chỉ cập nhật khoảng một lần mỗi ngày. Trang SHALL không hiện địa chỉ IP, chuỗi User-Agent gốc hay token của phiên.

#### Scenario: Dòng điện thoại
- **WHEN** `vantung` đăng nhập bằng Chrome trên Android lúc 06:48 ngày 09/11/2026 và xem `/sessions` từ máy tính lúc 10:00 cùng ngày
- **THEN** dòng đó hiện "Điện thoại · Chrome" và "Hôm nay, 06:48" **AND** không có địa chỉ IP

#### Scenario: Dữ liệu trả về không có token
- **WHEN** kiểm tra dữ liệu danh sách gửi tới trình duyệt
- **THEN** không có token của phiên nào

### Requirement: Đăng xuất một máy khác
Người dùng SHALL đăng xuất được từng máy khác của chính mình sau một bước xác nhận. Máy bị đăng xuất SHALL mất hiệu lực ở yêu cầu kế tiếp. Dòng "Máy này" SHALL không có nút này; API SHALL trả 400 nếu nhận phiên đang dùng. Phiên không có, đã kết thúc, hoặc của người khác SHALL cùng trả 404 và không phiên nào bị đổi.

#### Scenario: Đăng xuất điện thoại từ máy tính
- **WHEN** `thuha` đang đăng nhập trên máy tính và điện thoại, bấm "Đăng xuất máy này" ở dòng điện thoại rồi xác nhận
- **THEN** danh sách còn 1 dòng **AND** thao tác kế tiếp trên điện thoại bị chuyển tới `/login` **AND** API gọi bằng cookie của điện thoại trả 401

#### Scenario: Dòng máy đang dùng
- **WHEN** `thuha` xem dòng "Máy này"
- **THEN** dòng đó không có nút "Đăng xuất máy này"

#### Scenario: Gửi id của phiên đang dùng
- **WHEN** `thuha` gửi `POST /api/me/sessions/<id phiên đang dùng>/sign-out`
- **THEN** API trả 400 và phiên vẫn còn

#### Scenario: Gửi id phiên của người khác
- **WHEN** `quocbao` gửi `POST /api/me/sessions/<id phiên của thuha>/sign-out`
- **THEN** API trả 404 **AND** phiên của `thuha` vẫn còn **AND** nhật ký không có dòng mới

#### Scenario: Máy đã đăng xuất từ trước
- **WHEN** `thuha` mở `/sessions` ở hai tab, đăng xuất điện thoại ở tab 1, rồi bấm lại ở tab 2
- **THEN** tab 2 báo "Thiết bị này đã đăng xuất" và danh sách cập nhật

### Requirement: Đăng xuất mọi máy khác
Người dùng SHALL đăng xuất được mọi máy khác của chính mình bằng một thao tác sau bước xác nhận, máy đang dùng vẫn đăng nhập. Không có máy khác thì nút SHALL bị tắt.

#### Scenario: Có 3 máy khác
- **WHEN** `minhanh` đang đăng nhập trên 4 máy và bấm "Đăng xuất mọi máy khác" rồi xác nhận
- **THEN** hệ thống báo "Đã đăng xuất 3 máy" **AND** chỉ còn dòng "Máy này"

#### Scenario: Chỉ có một máy
- **WHEN** `vantung` chỉ đăng nhập trên một máy và mở `/sessions`
- **THEN** nút "Đăng xuất mọi máy khác" bị tắt

#### Scenario: Gọi API khi không còn máy khác
- **WHEN** `vantung` gửi `POST /api/me/sessions/sign-out-others` khi chỉ có một máy
- **THEN** API trả thành công với số máy 0 **AND** nhật ký không có dòng mới

### Requirement: Lối vào trang Thiết bị đăng nhập
Menu người dùng trên Desktop và tab Cá nhân trên Mobile SHALL có mục "Thiết bị đăng nhập" dẫn tới `/sessions`, cho mọi vai trò. Trên điện thoại, mỗi nút của trang `/sessions` SHALL cao tối thiểu 48px.

#### Scenario: Mở từ Desktop
- **WHEN** `lanphuong` mở menu người dùng ở header và bấm "Thiết bị đăng nhập"
- **THEN** hệ thống mở `/sessions`

### Requirement: Giám đốc đăng xuất mọi máy của một nhân viên
Giám đốc SHALL đăng xuất được mọi máy của một tài khoản khác từ menu dòng trên D17 sau một bước xác nhận. Tài khoản đó SHALL vẫn Đang dùng và đăng nhập lại được. Quyền là `users.manage`; tài khoản chỉ có cờ Admin hệ thống SHALL không dùng được. Giám đốc SHALL không dùng thao tác này trên chính mình.

#### Scenario: Nhân viên mất điện thoại
- **WHEN** `vantung` đang đăng nhập trên 2 máy, Giám đốc bấm "Đăng xuất mọi máy" ở dòng `vantung` rồi xác nhận
- **THEN** hệ thống báo "Đã đăng xuất 2 máy của vantung" **AND** thao tác kế tiếp trên cả 2 máy bị chuyển tới `/login` **AND** dòng `vantung` vẫn "Đang dùng"

#### Scenario: Đăng nhập lại sau đó
- **WHEN** `vantung` vừa bị đăng xuất mọi máy và đăng nhập lại với đúng mật khẩu
- **THEN** đăng nhập thành công

#### Scenario: Kế toán gọi API
- **WHEN** `thuha` (Kế toán) gửi `POST /api/users/<id của vantung>/sign-out-all`
- **THEN** API trả 403 **AND** phiên của `vantung` vẫn còn

#### Scenario: Admin hệ thống không phải Giám đốc
- **WHEN** `quocbao` (Kinh doanh, có cờ Admin hệ thống) mở menu dòng `vantung` trên D17
- **THEN** menu không có "Đăng xuất mọi máy" **AND** API tương ứng trả 403

#### Scenario: Giám đốc chọn chính mình
- **WHEN** `minhanh` (Giám đốc) gửi `POST /api/users/<id của minhanh>/sign-out-all`
- **THEN** API trả 409 và mọi phiên của `minhanh` vẫn còn

#### Scenario: Nhân viên không có máy nào đang đăng nhập
- **WHEN** Giám đốc đăng xuất mọi máy của `ngoclam` khi `ngoclam` không có phiên nào
- **THEN** hệ thống báo "Không có máy nào đang đăng nhập" **AND** nhật ký không có dòng mới

### Requirement: Bảo vệ tài khoản demo khi đăng xuất từ xa
Khi `DEMO_MODE=true`, 5 tài khoản demo dùng chung (`giamdoc`, `ketoan`, `kinhdoanh`, `thukho`, `xuong`) SHALL không đăng xuất từ xa được và SHALL không bị Giám đốc đăng xuất mọi máy: API trả 409. Trang `/sessions` của các tài khoản đó SHALL báo tính năng không dùng ở bản demo và không hiện danh sách.

#### Scenario: Khách thử mở trang
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=true`
- **WHEN** khách đăng nhập bằng `thukho` và mở `/sessions`
- **THEN** trang báo không dùng ở bản demo, không có danh sách thiết bị

#### Scenario: Khách thử đăng xuất mọi máy
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=true`
- **WHEN** khách đăng nhập bằng `giamdoc` gửi `POST /api/users/<id của thukho>/sign-out-all`
- **THEN** API trả 409 **AND** các phiên của `thukho` vẫn còn

#### Scenario: Tài khoản tạo thử trên demo
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=true`
- **WHEN** `giamdoc` đăng xuất mọi máy của một tài khoản mới tạo thử, có 1 máy đang đăng nhập
- **THEN** thao tác thành công
