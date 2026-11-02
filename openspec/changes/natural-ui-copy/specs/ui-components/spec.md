# Spec Delta

## ADDED Requirements

### Requirement: Tự nhiên hóa Microcopy và Thông báo Người dùng
Mọi thông báo xác thực (validation), đối thoại cảnh báo bất thường (anomaly dialogs), hướng dẫn nhập liệu và nhãn thao tác trong hệ thống SHALL sử dụng tiếng Việt tự nhiên, có cấu trúc ngữ pháp rõ ràng (chủ ngữ, vị ngữ, bổ ngữ), nêu rõ nguyên nhân và cách thức xử lý thay vì dùng các câu cộc lốc hoặc dịch máy.

#### Scenario: Cảnh báo nhập dư số lượng hàng
- **WHEN** thủ kho nhập số lượng nhận vượt quá số lượng còn lại trên đơn mua hàng
- **THEN** hệ thống hiển thị cảnh báo với nội dung dạng: *"Số lượng nhận ({received}) vượt quá số lượng còn lại trên đơn ({remaining}). Bạn có chắc chắn muốn nhập không?"*

#### Scenario: Cảnh báo chi phí chuyến xe vượt dự kiến
- **WHEN** thủ kho hoặc kế toán ghi nhận chi phí chuyến vượt quá tổng chi phí dự kiến cả đơn
- **THEN** hệ thống hiển thị cảnh báo với nội dung dạng: *"Chi phí chuyến này ({tripCost}) vượt quá tổng chi phí dự kiến cả đơn ({poCost}). Bạn có muốn tiếp tục ghi nhận không?"*

#### Scenario: Hướng dẫn cân khối lượng hàng tính theo kg
- **WHEN** thủ kho nhập hàng đối với các mã vật tư quản lý theo kg nhưng chưa điền số liệu cân
- **THEN** hệ thống hiển thị thông báo hướng dẫn: *"Vui lòng nhập khối lượng cân thực tế (kg)"*
