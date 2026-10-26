# Spec Delta: ui-components

## Purpose

Bộ component nền dùng lại ở mọi màn hình: badge tình trạng hàng, trạng thái chứng từ, vị trí; stepper số lượng cho mobile; bảng dữ liệu cho desktop; ô chia số lượng theo tình trạng.

## ADDED Requirements

### Requirement: Badge tình trạng hàng
Hệ thống SHALL hiển thị tình trạng hàng bằng badge có chữ tiếng Việt và màu cố định: `NEW` "Mới" (tím/indigo), `GOOD` "Tốt" (xanh lá), `NEEDS_REPAIR` "Chờ sửa" (vàng cam), `SCRAP` "Phế liệu" (xám). Chữ và màu nền SHALL đạt độ tương phản tối thiểu 4.5:1.

#### Scenario: Hiện badge Chờ sửa
- **WHEN** một dòng hàng có tình trạng `NEEDS_REPAIR`
- **THEN** badge hiện chữ "Chờ sửa" với màu vàng cam

#### Scenario: Đủ 4 tình trạng
- **WHEN** hiển thị lần lượt `NEW`, `GOOD`, `NEEDS_REPAIR`, `SCRAP`
- **THEN** 4 badge có 4 màu khác nhau, chữ lần lượt "Mới", "Tốt", "Chờ sửa", "Phế liệu"

### Requirement: Badge trạng thái chứng từ
Hệ thống SHALL hiển thị trạng thái chứng từ bằng badge: `DRAFT` "Nháp" (xám), `PENDING_APPROVAL` "Chờ duyệt" (vàng), `IN_PROGRESS` "Đang xử lý" (xanh dương), `DONE` "Hoàn thành" (xanh lá), `OVERDUE` "Quá hạn" (đỏ).

#### Scenario: Hợp đồng chờ duyệt
- **WHEN** một hợp đồng có trạng thái `PENDING_APPROVAL`
- **THEN** badge hiện chữ "Chờ duyệt" màu vàng

### Requirement: Badge vị trí
Hệ thống SHALL hiển thị loại vị trí bằng badge: `YARD` "Tại bãi", `WORKSHOP` "Tại xưởng", `SITE` "Tại công trình".

#### Scenario: Hàng đang ở công trình
- **WHEN** vị trí có loại `SITE`
- **THEN** badge hiện chữ "Tại công trình"

### Requirement: Stepper số lượng cho mobile
Stepper SHALL có nút "−" và "+" với vùng bấm tối thiểu 48×48px, ô số ở giữa gõ trực tiếp được. Mỗi lần bấm tăng hoặc giảm đúng một bước (mặc định 1). Giá trị SHALL không nhỏ hơn giá trị tối thiểu (mặc định 0) và không lớn hơn giá trị tối đa nếu có.

#### Scenario: Bấm tăng
- **WHEN** stepper đang là 12 và thủ kho bấm "+"
- **THEN** giá trị thành 13

#### Scenario: Không xuống dưới 0
- **WHEN** stepper đang là 0
- **THEN** nút "−" bị vô hiệu hóa và giá trị vẫn là 0

#### Scenario: Chạm giới hạn trên
- **WHEN** stepper có giá trị tối đa 100 và đang là 100
- **THEN** nút "+" bị vô hiệu hóa

#### Scenario: Gõ số vượt giới hạn
- **WHEN** stepper có giá trị tối đa 100 và thủ kho gõ 150 rồi rời ô
- **THEN** giá trị được đưa về 100

#### Scenario: Gõ chữ không phải số
- **WHEN** thủ kho gõ "abc" rồi rời ô
- **THEN** giá trị trở về số hợp lệ gần nhất trước đó

### Requirement: Bảng dữ liệu cho desktop
Bảng dữ liệu SHALL có tiêu đề cột dính ở đầu khi cuộn, sắp xếp theo cột khi bấm tiêu đề (tăng → giảm → bỏ sắp xếp), phân trang với cỡ trang mặc định 20 dòng, và hiện chữ "Không có dữ liệu" khi rỗng. Cột số SHALL căn phải.

#### Scenario: Phân trang
- **WHEN** bảng có 45 dòng dữ liệu
- **THEN** trang 1 hiện dòng 1–20, có 3 trang, thanh phân trang ghi "1–20 / 45"

#### Scenario: Sắp xếp theo cột
- **WHEN** người dùng bấm tiêu đề cột "Số lượng" một lần
- **THEN** các dòng được sắp xếp theo số lượng tăng dần
- **AND** bấm lần hai thì giảm dần, bấm lần ba thì trở về thứ tự ban đầu

#### Scenario: Bảng rỗng
- **WHEN** bảng không có dòng nào
- **THEN** bảng hiện chữ "Không có dữ liệu" và không hiện thanh phân trang

### Requirement: Chia số lượng theo tình trạng (Condition Split)
Condition Split SHALL nhận tổng số lượng và cho nhập các phần Tốt, Chờ sửa, Phế liệu; khi bật tùy chọn thu hồi thì thêm phần Mất. Component SHALL hiện số còn lại chưa chia (tổng − các phần) và báo lệch khi tổng các phần khác tổng số lượng. Mọi phần dùng cùng đơn vị với tổng, tối đa 3 chữ số thập phân.

#### Scenario: Chia khớp khi thu hồi
- **WHEN** tổng là 100, bật phần Mất, nhập Tốt 80, Chờ sửa 15, Phế liệu 3, Mất 2
- **THEN** số còn lại là 0 và component báo đã khớp

#### Scenario: Chia thiếu
- **WHEN** tổng là 100, nhập Tốt 80, Chờ sửa 15, Phế liệu 0
- **THEN** số còn lại là 5 và component hiện cảnh báo "Còn 5 chưa phân loại"

#### Scenario: Chia vượt
- **WHEN** tổng là 100, nhập Tốt 90, Chờ sửa 15, Phế liệu 0
- **THEN** component hiện cảnh báo "Vượt 5 so với tổng"

#### Scenario: Tổng bằng 0
- **WHEN** tổng là 0 và mọi phần là 0
- **THEN** số còn lại là 0 và component báo đã khớp

#### Scenario: Số lẻ theo kg
- **WHEN** tổng là 250,5 (kg), nhập Tốt 200, Chờ sửa 50, Phế liệu 0,5
- **THEN** số còn lại là 0 và component báo đã khớp

#### Scenario: Nhập từ PO thì không có phần Mất
- **WHEN** Condition Split không bật tùy chọn thu hồi
- **THEN** chỉ hiện 3 phần Tốt, Chờ sửa, Phế liệu

### Requirement: Component dùng được bằng bàn phím
Mọi component tương tác (stepper, tiêu đề cột sắp xếp, nút phân trang, ô nhập Condition Split, mục menu) SHALL dùng được bằng bàn phím và có viền focus nhìn thấy rõ.

#### Scenario: Sắp xếp bằng bàn phím
- **WHEN** người dùng dùng phím Tab tới tiêu đề cột "Số lượng" và bấm Enter
- **THEN** bảng sắp xếp theo số lượng tăng dần và tiêu đề cột có viền focus nhìn thấy được
