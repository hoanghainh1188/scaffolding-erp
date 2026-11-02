# Spec Delta

## MODIFIED Requirements

### Requirement: Sidebar Desktop có 9 mục menu
Layout Desktop SHALL có sidebar cố định bên trái, nền sáng (token `card`, viền `border`), gồm logo và các mục theo thứ tự: Tổng quan, Mua hàng, Kho, Sửa chữa, Cho thuê & Bán, Công nợ, Báo cáo, Danh mục, Cài đặt. Mục ứng với trang đang mở SHALL có nền token `accent`.

#### Scenario: Làm nổi bật mục đang mở
- **WHEN** người dùng (vai trò Giám đốc) đang ở `/inventory`
- **THEN** sidebar hiện đủ 9 mục và chỉ mục "Kho" ở trạng thái đang chọn với nền `accent`
- **AND** mục đang chọn được đánh dấu cho trình đọc màn hình (`aria-current="page"`)

### Requirement: Menu Desktop lọc theo vai trò
Sidebar SHALL chỉ hiện các mục mà vai trò của người dùng hiện tại được phép xem. Việc ẩn mục menu chỉ để giao diện gọn, không thay cho kiểm tra quyền phía server.

#### Scenario: Kinh doanh không thấy Công nợ, Báo cáo, Cài đặt
- **WHEN** người dùng có vai trò `SALES` mở layout Desktop
- **THEN** sidebar hiện 6 mục: Tổng quan, Mua hàng, Kho, Sửa chữa, Cho thuê & Bán, Danh mục
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
