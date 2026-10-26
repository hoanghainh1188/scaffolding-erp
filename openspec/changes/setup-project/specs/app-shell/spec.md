# Spec Delta: app-shell

## Purpose

Khung giao diện chung của hệ thống: layout Desktop cho văn phòng và layout Mobile PWA cho thủ kho, xưởng. Mọi màn hình D1..D17, M1..M8 nằm trong một trong hai khung này.

## ADDED Requirements

### Requirement: Hai khu giao diện tách biệt theo đường dẫn
Hệ thống SHALL phục vụ giao diện Desktop ở các đường dẫn gốc (`/...`) và giao diện Mobile ở các đường dẫn bắt đầu bằng `/m`. Trang `/` SHALL chuyển tới trang Tổng quan của Desktop.

#### Scenario: Mở trang gốc
- **WHEN** người dùng mở `/`
- **THEN** hệ thống chuyển tới `/dashboard` và hiển thị layout Desktop

#### Scenario: Mở khu Mobile
- **WHEN** người dùng mở `/m`
- **THEN** hệ thống hiển thị layout Mobile với tab "Việc hôm nay" đang được chọn

### Requirement: Sidebar Desktop có 9 mục menu
Layout Desktop SHALL có sidebar cố định bên trái gồm logo và các mục theo thứ tự: Tổng quan, Thu mua, Kho, Sửa chữa, Bán & Thuê, Công nợ, Báo cáo, Danh mục, Cài đặt. Mục ứng với trang đang mở SHALL được làm nổi bật.

#### Scenario: Làm nổi bật mục đang mở
- **WHEN** người dùng (vai trò Giám đốc) đang ở `/inventory`
- **THEN** sidebar hiện đủ 9 mục và chỉ mục "Kho" ở trạng thái đang chọn

### Requirement: Menu Desktop lọc theo vai trò
Sidebar SHALL chỉ hiện các mục mà vai trò của người dùng hiện tại được phép xem. Việc ẩn mục menu chỉ để giao diện gọn, không thay cho kiểm tra quyền phía server.

#### Scenario: Kinh doanh không thấy Công nợ, Báo cáo, Cài đặt
- **WHEN** người dùng có vai trò `SALES` mở layout Desktop
- **THEN** sidebar hiện 6 mục: Tổng quan, Thu mua, Kho, Sửa chữa, Bán & Thuê, Danh mục
- **AND** không hiện Công nợ, Báo cáo, Cài đặt

#### Scenario: Kế toán thấy Công nợ nhưng không thấy Cài đặt
- **WHEN** người dùng có vai trò `ACCOUNTANT` mở layout Desktop
- **THEN** sidebar hiện mục Công nợ
- **AND** không hiện mục Báo cáo và Cài đặt

#### Scenario: Giám đốc thấy tất cả
- **WHEN** người dùng có vai trò `DIRECTOR` mở layout Desktop
- **THEN** sidebar hiện đủ 9 mục

#### Scenario: Vai trò chỉ dùng Mobile mở Desktop
- **WHEN** người dùng có vai trò `WAREHOUSE` hoặc `WORKSHOP` mở một trang Desktop
- **THEN** hệ thống chuyển người dùng tới `/m`

### Requirement: Sidebar thu gọn được
Người dùng SHALL thu gọn sidebar thành dải chỉ có biểu tượng và mở lại được. Lựa chọn thu gọn SHALL được nhớ trên trình duyệt đó. Ở màn hình rộng dưới 1024px, sidebar SHALL ẩn và mở ra dạng ngăn trượt khi bấm nút menu.

#### Scenario: Thu gọn và tải lại trang
- **WHEN** người dùng bấm nút thu gọn sidebar rồi tải lại trang
- **THEN** sidebar vẫn ở trạng thái thu gọn, chỉ hiện biểu tượng, rê chuột vào biểu tượng thấy tên mục

#### Scenario: Màn hình hẹp
- **WHEN** cửa sổ trình duyệt rộng 768px
- **THEN** sidebar không chiếm chỗ trên trang
- **AND** bấm nút menu ở header thì sidebar trượt ra phía trên nội dung

### Requirement: Header Desktop
Layout Desktop SHALL có header gồm ô tìm kiếm, nút tạo nhanh, nút thông báo và khu thông tin người dùng (tên, vai trò bằng tiếng Việt). Ô tìm kiếm, nút tạo nhanh và thông báo ở change này chỉ là chỗ hiển thị, chưa có chức năng.

#### Scenario: Hiện vai trò bằng tiếng Việt
- **WHEN** người dùng có vai trò `ACCOUNTANT` mở layout Desktop
- **THEN** khu thông tin người dùng hiện chữ "Kế toán"

### Requirement: Thanh điều hướng Mobile 4 tab
Layout Mobile SHALL có thanh điều hướng cố định ở đáy với 4 tab: Việc hôm nay (`/m`), Quét mã (`/m/scan`), Lịch sử (`/m/history`), Cá nhân (`/m/profile`). Mỗi tab SHALL có vùng bấm cao tối thiểu 48px.

#### Scenario: Chuyển tab
- **WHEN** thủ kho bấm tab "Lịch sử"
- **THEN** hệ thống mở `/m/history` và tab "Lịch sử" ở trạng thái đang chọn

### Requirement: App bar Mobile
Layout Mobile SHALL có app bar ở đầu trang hiện tên trang. Trang chi tiết SHALL có nút quay lại trong app bar.

#### Scenario: Trang chi tiết có nút quay lại
- **WHEN** một trang Mobile khai báo là trang chi tiết với tiêu đề "Phiếu nhập"
- **THEN** app bar hiện chữ "Phiếu nhập" và nút quay lại
- **AND** bấm nút quay lại thì trở về trang trước

### Requirement: Thanh báo mất kết nối trên Mobile
Layout Mobile SHALL hiện thanh báo "Mất kết nối" ở đầu màn hình khi trình duyệt mất mạng và SHALL tự ẩn khi có mạng lại.

#### Scenario: Mất mạng rồi có lại
- **WHEN** thiết bị đang mở `/m` thì mất mạng
- **THEN** thanh báo "Mất kết nối" xuất hiện ở đầu màn hình
- **AND** khi có mạng lại thì thanh báo biến mất

### Requirement: Cài đặt PWA
Hệ thống SHALL cung cấp web app manifest để cài khu Mobile lên màn hình chính: tên "Scaffolding ERP", tên ngắn "Kho", trang mở đầu `/m`, chế độ `standalone`, màu chủ đạo của Bright Blue Base và biểu tượng cỡ 192px, 512px.

#### Scenario: Đọc manifest
- **WHEN** trình duyệt tải `/manifest.webmanifest`
- **THEN** nhận được manifest có `start_url` là `/m`, `display` là `standalone` và hai biểu tượng 192×192, 512×512

### Requirement: Trang giữ chỗ cho mục chưa làm
Mỗi mục menu Desktop và mỗi tab Mobile SHALL mở được một trang có tiêu đề đúng tên mục và dòng chữ "Đang xây dựng", thay vì lỗi 404.

#### Scenario: Mở mục chưa làm
- **WHEN** Giám đốc bấm mục "Báo cáo" trên sidebar
- **THEN** trang hiện tiêu đề "Báo cáo" và chữ "Đang xây dựng"

### Requirement: Người dùng giả lập trước khi có đăng nhập
Cho tới khi có chức năng đăng nhập, hệ thống SHALL lấy người dùng hiện tại từ cấu hình giả lập chỉ ở môi trường phát triển (mặc định vai trò `DIRECTOR`). Ở môi trường production, hệ thống SHALL từ chối dùng người dùng giả lập.

#### Scenario: Đổi vai trò giả lập
- **WHEN** môi trường dev cấu hình vai trò giả lập là `SALES`
- **THEN** layout Desktop hiện "Kinh doanh" ở khu người dùng và menu lọc theo vai trò `SALES`

#### Scenario: Production không có người dùng giả lập
- **WHEN** ứng dụng chạy ở chế độ production mà chưa có chức năng đăng nhập
- **THEN** hệ thống không dùng người dùng giả lập và báo lỗi cấu hình thay vì cho vào với vai trò `DIRECTOR`
