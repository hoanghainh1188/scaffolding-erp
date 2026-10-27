# Spec Delta

## MODIFIED Requirements

### Requirement: Thanh báo mất kết nối trên Mobile
Layout Mobile SHALL hiện thanh báo "Mất kết nối" ở đầu màn hình khi trình duyệt mất mạng và SHALL tự ẩn khi có mạng lại. Khi đang làm một phiếu có nháp trên máy, thanh báo SHALL ghi "Mất kết nối – đã lưu nháp".

#### Scenario: Mất mạng rồi có lại
- **WHEN** thiết bị đang mở `/m` thì mất mạng
- **THEN** thanh báo "Mất kết nối" xuất hiện ở đầu màn hình
- **AND** khi có mạng lại thì thanh báo biến mất

#### Scenario: Mất mạng khi đang làm phiếu
- **WHEN** thiết bị đang mở M3 của `PO-2026-052` thì mất mạng
- **THEN** thanh báo ghi "Mất kết nối – đã lưu nháp"

### Requirement: Trang giữ chỗ cho mục chưa làm
Mỗi mục menu Desktop và mỗi tab Mobile chưa có chức năng SHALL mở được một trang có tiêu đề đúng tên mục và dòng chữ "Đang xây dựng", thay vì lỗi 404. Các tab Việc hôm nay (`/m`), Quét mã (`/m/scan`), Lịch sử (`/m/history`) và Cá nhân (`/m/profile`) không còn là trang giữ chỗ. Tiêu đề trang SHALL dùng họ chữ `display` của Bright Blue Base.

#### Scenario: Mở mục chưa làm
- **WHEN** Giám đốc bấm mục "Báo cáo" trên sidebar
- **THEN** trang hiện tiêu đề "Báo cáo" và chữ "Đang xây dựng"

#### Scenario: Tab Cá nhân có nội dung thật
- **WHEN** thủ kho mở tab "Cá nhân"
- **THEN** trang không hiện chữ "Đang xây dựng" mà hiện thông tin tài khoản và nút "Đăng xuất"

#### Scenario: Các tab Mobile có nội dung thật
- **WHEN** thủ kho mở lần lượt tab "Việc hôm nay", "Quét mã", "Lịch sử"
- **THEN** không trang nào hiện chữ "Đang xây dựng"
