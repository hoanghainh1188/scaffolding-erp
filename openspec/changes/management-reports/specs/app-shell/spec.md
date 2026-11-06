## MODIFIED Requirements

### Requirement: Menu Desktop lọc theo vai trò
Sidebar SHALL chỉ hiện các mục mà vai trò của người dùng hiện tại được phép xem. Việc ẩn mục menu chỉ để giao diện gọn, không thay cho kiểm tra quyền phía server.

#### Scenario: Kinh doanh không thấy Công nợ, Báo cáo, Cài đặt
- **WHEN** người dùng có vai trò `SALES` mở layout Desktop
- **THEN** sidebar hiện 6 mục: Tổng quan, Mua hàng, Kho, Sửa chữa, Cho thuê & Bán, Danh mục
- **AND** không hiện Công nợ, Báo cáo, Cài đặt

#### Scenario: Kế toán thấy Công nợ nhưng không thấy Cài đặt
- **WHEN** người dùng có vai trò `ACCOUNTANT` mở layout Desktop
- **THEN** sidebar hiện mục Công nợ và Báo cáo
- **AND** không hiện mục Cài đặt

#### Scenario: Giám đốc thấy tất cả
- **WHEN** người dùng có vai trò `DIRECTOR` mở layout Desktop
- **THEN** sidebar hiện đủ 9 mục

#### Scenario: Vai trò chỉ dùng Mobile mở Desktop
- **WHEN** người dùng có vai trò `WAREHOUSE` hoặc `WORKSHOP` mở một trang Desktop
- **THEN** hệ thống chuyển người dùng tới `/m`

### Requirement: Trang giữ chỗ cho mục chưa làm
Mỗi mục menu Desktop và mỗi tab Mobile chưa có chức năng SHALL mở được một trang có tiêu đề đúng tên mục và dòng chữ "Đang xây dựng", thay vì lỗi 404. Các tab Việc hôm nay (`/m`), Quét mã (`/m/scan`), Lịch sử (`/m/history`) và Cá nhân (`/m/profile`) không còn là trang giữ chỗ. Tiêu đề trang SHALL dùng họ chữ `display` của Bright Blue Base.

#### Scenario: Mở mục chưa làm
- **WHEN** một change sau thêm mục menu Desktop mới nhưng chưa làm trang chức năng, rồi Giám đốc bấm mục đó
- **THEN** trang hiện tiêu đề đúng tên mục và chữ "Đang xây dựng"

#### Scenario: Mục Báo cáo có nội dung thật
- **WHEN** Giám đốc bấm mục "Báo cáo" trên sidebar
- **THEN** trang hiện "Báo cáo quản trị" (D15), không hiện chữ "Đang xây dựng"

#### Scenario: Tab Cá nhân có nội dung thật
- **WHEN** thủ kho mở tab "Cá nhân"
- **THEN** trang không hiện chữ "Đang xây dựng" mà hiện thông tin tài khoản và nút "Đăng xuất"

#### Scenario: Các tab Mobile có nội dung thật
- **WHEN** thủ kho mở lần lượt tab "Việc hôm nay", "Quét mã", "Lịch sử"
- **THEN** không trang nào hiện chữ "Đang xây dựng"
