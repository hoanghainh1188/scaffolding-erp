# production-boms Specification

## Purpose
Cho Giám đốc, Kế toán lập định mức sản xuất của từng thành phẩm (nguyên liệu trên 1 cái và đơn giá công), xem giá thành dự tính theo giá bình quân hôm nay, và chọn Mã sắt vụn nhận đầu thừa, để lệnh sản xuất có số chuẩn khi giao xưởng.

## Requirements

### Requirement: Định mức của một thành phẩm
Mỗi thành phẩm SHALL có tối đa một định mức. Thành phẩm SHALL là mã nhóm Thiết bị, đơn vị đếm (cái, cây, bộ…), đang dùng. Định mức SHALL gồm:
- **Danh sách nguyên liệu:** mỗi dòng một mã nhóm Vật tư đang dùng, số lượng / 1 thành phẩm > 0 theo đơn vị của mã đó, tối đa 3 chữ số lẻ. Một mã chỉ xuất hiện một lần. Phải có ít nhất 1 nguyên liệu.
- **Đơn giá công sản xuất / cái:** VND nguyên, ≥ 0.

Mã nhóm Vật tư SHALL không làm thành phẩm được. Mã đã có định mức SHALL không thêm định mức thứ hai.

#### Scenario: Lưu định mức khung
- **WHEN** Kế toán lưu định mức `GG-K17`: `VT-ONG42` 9,8 kg, `VT-ONG27` 3,6 kg, `VT-QH` 0,12 kg, `VT-SON` 0,08 lít, `VT-CHOT` 4 cái, công 35.000 ₫ / cái
- **THEN** D19 hiện `GG-K17` với 5 nguyên liệu và công 35.000 ₫

#### Scenario: Nguyên liệu không phải nhóm Vật tư
- **WHEN** Kế toán thêm `GG-CH` (nhóm Thiết bị) làm nguyên liệu của `GG-K17`
- **THEN** hệ thống từ chối với "Nguyên liệu phải là mã nhóm Vật tư"

#### Scenario: Thành phẩm là vật tư
- **WHEN** Kế toán tạo định mức cho `VT-CHOT` (nhóm Vật tư)
- **THEN** hệ thống từ chối với "Thành phẩm phải là mã nhóm Thiết bị, đơn vị đếm"

#### Scenario: Định mức không có nguyên liệu
- **WHEN** Kế toán lưu định mức `CC-3M` không có dòng nguyên liệu nào
- **THEN** hệ thống từ chối với "Định mức cần ít nhất 1 nguyên liệu"

#### Scenario: Số lượng bằng 0
- **WHEN** Kế toán nhập `VT-QH` 0 kg / cái
- **THEN** hệ thống từ chối với "Số lượng / 1 cái phải lớn hơn 0"

#### Scenario: Công bằng 0
- **WHEN** Kế toán lưu định mức `PK-KU` với công 0 ₫
- **THEN** định mức được lưu **AND** lệnh làm `PK-KU` có công khoán 0 ₫

### Requirement: Giá thành dự tính
D19 SHALL hiện cho mỗi nguyên liệu: giá BQ hôm nay và thành tiền = số / 1 cái × giá BQ, làm tròn đến 1 ₫. Giá BQ là giá của tình trạng Mới, hoặc của Tốt khi Mới chưa có giá. SHALL hiện tổng nguyên liệu, công, và **giá thành dự tính / cái** = nguyên liệu + công. Số này SHALL ghi rõ chỉ để tham khảo. Nguyên liệu chưa có giá ở cả hai tình trạng SHALL hiện "—", và tổng ghi "chưa đủ giá".

#### Scenario: Giá thành dự tính của khung
- **WHEN** hôm nay giá BQ Mới: `VT-ONG42` 19.500 ₫/kg, `VT-ONG27` 19.000 ₫/kg, `VT-QH` 45.000 ₫/kg, `VT-SON` 90.000 ₫/lít, `VT-CHOT` 2.500 ₫/cái
- **THEN** D19 của `GG-K17` hiện thành tiền 191.100 ₫, 68.400 ₫, 5.400 ₫, 7.200 ₫, 10.000 ₫ **AND** nguyên liệu 282.100 ₫, công 35.000 ₫, giá thành dự tính 317.100 ₫ / cái

#### Scenario: Nguyên liệu chưa có giá
- **WHEN** `VT-CHOT` chưa từng nhập (không có giá Mới, Tốt)
- **THEN** dòng `VT-CHOT` hiện "—" **AND** tổng ghi "chưa đủ giá"

### Requirement: Quyền định mức
Chỉ người có quyền `production.manage` (Giám đốc, Kế toán) SHALL tạo, sửa, xóa định mức. Người có `production.view` (Giám đốc, Kế toán, Kinh doanh) SHALL xem D19. Kiểm ở server.

#### Scenario: Kinh doanh xem được, không sửa được
- **WHEN** `minhtuan` (Kinh doanh) mở D19 rồi gọi API lưu định mức `GG-K17`
- **THEN** D19 hiện định mức, không có nút sửa **AND** API trả 403

#### Scenario: Xưởng không mở được D19
- **WHEN** `hoangnam` (Xưởng) gọi API đọc định mức
- **THEN** API trả 403

### Requirement: Sửa định mức không đổi lệnh đã giao
Sửa hay xóa định mức SHALL không đổi lệnh đã giao xưởng (định mức đã chụp vào lệnh). Lệnh còn Nháp SHALL dùng định mức mới khi giao. Xóa định mức SHALL được khi còn lệnh đã giao dùng nó. Lệnh Nháp của mã đó SHALL không giao được cho tới khi có định mức lại.

#### Scenario: Sửa sau khi giao
- **WHEN** `LSX-2026-004` đã giao với `VT-ONG27` 3,6 kg / cái, rồi Kế toán sửa định mức `GG-K17` thành 3,8 kg
- **THEN** `LSX-2026-004` vẫn ghi định mức 3,6 kg / cái (360 kg cho 100 cái) **AND** lệnh Nháp giao sau đó dùng 3,8 kg

#### Scenario: Xóa định mức khi còn lệnh Nháp
- **WHEN** Kế toán xóa định mức `GG-CH` khi lệnh Nháp `LSX-2026-006` có dòng `GG-CH`
- **THEN** định mức bị xóa **AND** giao `LSX-2026-006` bị từ chối với "GG-CH chưa có định mức"

### Requirement: Mã sắt vụn nhận đầu thừa
Hệ thống SHALL có một **Mã sắt vụn** dùng chung: một mã đơn vị kg, nhóm Vật tư, đang dùng. Giám đốc (`scrap-price.manage`) SHALL chọn mã này trên trang Giá sắt vụn. Đầu thừa của mọi lệnh sản xuất SHALL nhập Phế liệu của mã này. Đổi mã SHALL không đổi lệnh đã ghi sổ. Chưa chọn mã thì lệnh có đầu thừa SHALL không ghi sổ được.

#### Scenario: Chọn mã sắt vụn
- **WHEN** Giám đốc chọn `PL-SATVUN` (kg, nhóm Vật tư) làm Mã sắt vụn
- **THEN** trang Giá sắt vụn hiện "Mã sắt vụn: PL-SATVUN"

#### Scenario: Mã không phải kg
- **WHEN** Giám đốc chọn `VT-CHOT` (cái)
- **THEN** hệ thống từ chối với "Mã sắt vụn phải tính theo kg, nhóm Vật tư"

#### Scenario: Kế toán không đổi được
- **WHEN** `thuha` (Kế toán) gọi API đổi Mã sắt vụn
- **THEN** API trả 403
