# Spec Delta

## MODIFIED Requirements

### Requirement: Header Desktop
Layout Desktop SHALL có header gồm ô tìm kiếm, nút tạo nhanh, nút thông báo và khu thông tin người dùng (họ tên, vai trò bằng tiếng Việt). Ô tìm kiếm, nút tạo nhanh và thông báo chỉ là chỗ hiển thị, chưa có chức năng. Bấm khu người dùng SHALL mở menu gồm "Đổi mật khẩu" và "Đăng xuất".

#### Scenario: Hiện vai trò bằng tiếng Việt
- **WHEN** người dùng có vai trò `ACCOUNTANT` mở layout Desktop
- **THEN** khu thông tin người dùng hiện chữ "Kế toán"

#### Scenario: Hiện họ tên người đang đăng nhập
- **WHEN** `thuha` (họ tên "Thu Hà", Kế toán) đang đăng nhập và mở `/dashboard`
- **THEN** khu người dùng hiện "Thu Hà" và "Kế toán"

#### Scenario: Mở menu người dùng
- **WHEN** người dùng bấm khu người dùng trên header
- **THEN** menu hiện hai mục "Đổi mật khẩu" và "Đăng xuất", mở và chọn được bằng bàn phím

### Requirement: Trang giữ chỗ cho mục chưa làm
Mỗi mục menu Desktop và mỗi tab Mobile chưa có chức năng SHALL mở được một trang có tiêu đề đúng tên mục và dòng chữ "Đang xây dựng", thay vì lỗi 404. Tab Cá nhân (`/m/profile`) không còn là trang giữ chỗ. Tiêu đề trang SHALL dùng họ chữ `display` của Bright Blue Base.

#### Scenario: Mở mục chưa làm
- **WHEN** Giám đốc bấm mục "Báo cáo" trên sidebar
- **THEN** trang hiện tiêu đề "Báo cáo" và chữ "Đang xây dựng"

#### Scenario: Tab Cá nhân có nội dung thật
- **WHEN** thủ kho mở tab "Cá nhân"
- **THEN** trang không hiện chữ "Đang xây dựng" mà hiện thông tin tài khoản và nút "Đăng xuất"

## REMOVED Requirements

### Requirement: Người dùng giả lập trước khi có đăng nhập
**Reason**: Đã có đăng nhập thật (capability `auth`). Giữ người dùng giả lập, kể cả chỉ ở dev, là một cửa sau dễ lọt sang production.
**Migration**: Bỏ biến `DEV_ROLE`. Ở dev, chạy `npm run db:seed:dev` để có 5 tài khoản mẫu (một cho mỗi vai trò) rồi đăng nhập ở `/login`. Test integration tạo tài khoản qua helper test; E2E đăng nhập thật trong global setup.
