# rental-holidays Specification

## Purpose
Bảng ngày nghỉ chung (Tết, lễ) mà công ty không tính tiền thuê cho mọi hợp đồng thuê; Giám đốc khai ở Cài đặt, tiền thuê theo kỳ đọc bảng này để trừ ngày.

## Requirements

### Requirement: Bảng ngày nghỉ chung
Hệ thống SHALL lưu bảng ngày nghỉ không tính thuê, mỗi dòng có tên (bắt buộc, tối đa 100 ký tự), ngày bắt đầu và ngày kết thúc (gồm cả hai ngày, kết thúc không trước bắt đầu, tối đa 31 ngày một dòng). Hai dòng SHALL không chồng ngày nhau. Bảng SHALL áp cho mọi hợp đồng thuê, không có ngày nghỉ riêng từng hợp đồng.

#### Scenario: Thêm Tết Nguyên đán
- **WHEN** Giám đốc thêm "Tết Nguyên đán" từ 05/02/2027 đến 13/02/2027
- **THEN** dòng được lưu với 9 ngày **AND** tiền thuê của mọi hợp đồng thuê kỳ 02/2027 trừ các ngày đó

#### Scenario: Ngày kết thúc trước ngày bắt đầu
- **WHEN** Giám đốc nhập từ 13/02/2027 đến 05/02/2027
- **THEN** hệ thống từ chối với "Ngày kết thúc phải từ ngày bắt đầu trở đi." và không lưu

#### Scenario: Chồng ngày với dòng khác
- **WHEN** đã có "Tết Nguyên đán" 05/02 – 13/02/2027 và Giám đốc thêm "Nghỉ bù" 13/02 – 14/02/2027
- **THEN** hệ thống từ chối với "Ngày 13/02/2027 đã nằm trong "Tết Nguyên đán". Bạn sửa dòng đó hoặc chọn ngày khác." và không lưu

#### Scenario: Khoảng quá dài
- **WHEN** Giám đốc nhập từ 01/02/2027 đến 15/03/2027
- **THEN** hệ thống từ chối với "Một dòng ngày nghỉ dài tối đa 31 ngày. Bạn tách thành nhiều dòng nếu cần." và không lưu

### Requirement: Không đổi ngày nghỉ trong kỳ đã chốt
Thêm, sửa hoặc xóa một dòng ngày nghỉ SHALL bị từ chối khi bất kỳ ngày nào của khoảng cũ hoặc khoảng mới không sau ngày cuối kỳ đã chốt muộn nhất của bất kỳ hợp đồng thuê nào, vì tiền thuê kỳ đã chốt không tính lại (0.2 #22). Sửa SHALL gửi kèm `updatedAt`, lệch thì 409. Chốt kỳ và sửa ngày nghỉ chạy cùng lúc SHALL không làm kỳ đã chốt dùng bảng ngày nghỉ khác với bảng sau khi sửa.

#### Scenario: Sửa Tết sau khi đã chốt kỳ 02/2027
- **WHEN** kỳ 02/2027 của `102026/ANPHAT-MINHPHAT` đã chốt và Giám đốc sửa "Tết Nguyên đán" thành 04/02 – 13/02/2027
- **THEN** hệ thống từ chối với "Kỳ 02/2027 đã chốt cho hợp đồng 102026/ANPHAT-MINHPHAT nên không đổi được ngày nghỉ trong kỳ đó. Sai sót thì ghi dòng điều chỉnh ở kỳ sau." và dòng giữ 05/02 – 13/02

#### Scenario: Thêm ngày nghỉ sau kỳ đã chốt
- **WHEN** kỳ chốt muộn nhất là 02/2027 và Giám đốc thêm "Giỗ Tổ Hùng Vương" 16/04/2027
- **THEN** dòng được lưu

#### Scenario: Hai người sửa cùng lúc
- **WHEN** hai tab cùng sửa "Tết Nguyên đán", tab sau gửi `updatedAt` cũ
- **THEN** tab sau nhận 409 với "Ngày nghỉ này vừa được người khác sửa. Bạn tải lại để xem bản mới." và không lưu

### Requirement: Màn ngày nghỉ trong Cài đặt
Cài đặt SHALL có thẻ "Ngày nghỉ không tính thuê" mở trang danh sách các dòng ngày nghỉ (tên, từ, đến, số ngày) xếp theo ngày bắt đầu, lọc theo năm, nút thêm, sửa, xóa (xóa hỏi lại). Ô ngày SHALL dùng `DateInput`. Dòng nằm trong kỳ đã chốt SHALL hiện khóa kèm lý do, không có nút sửa, xóa.

#### Scenario: Xem năm 2027
- **WHEN** Giám đốc mở Cài đặt → Ngày nghỉ không tính thuê và chọn năm 2027
- **THEN** trang hiện "Tết Dương lịch" 01/01/2027 (1 ngày), "Tết Nguyên đán" 05/02 – 13/02/2027 (9 ngày)

#### Scenario: Xóa hỏi lại
- **WHEN** Giám đốc bấm xóa "Giỗ Tổ Hùng Vương"
- **THEN** hệ thống hỏi "Xóa ngày nghỉ "Giỗ Tổ Hùng Vương" (16/04/2027)? Tiền thuê kỳ chưa chốt sẽ tính lại ngày đó." và chỉ xóa khi bấm đồng ý

### Requirement: Quyền ngày nghỉ
Thêm, sửa, xóa ngày nghỉ SHALL cần quyền `holidays.manage` (Giám đốc). Đọc ngày nghỉ SHALL cần `billing.view` (Giám đốc, Kế toán, Kinh doanh). Server SHALL kiểm quyền.

#### Scenario: Kế toán không sửa được
- **WHEN** `thuha` (Kế toán) gửi `POST /api/holidays`
- **THEN** hệ thống trả 403 và không lưu

#### Scenario: Kế toán đọc được
- **WHEN** `thuha` gọi `GET /api/holidays?year=2027`
- **THEN** hệ thống trả danh sách ngày nghỉ năm 2027
