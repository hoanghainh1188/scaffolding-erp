## ADDED Requirements

### Requirement: Đơn giá công sửa / cái
Mỗi mã hàng nhóm Thiết bị SHALL có trường tùy chọn **đơn giá công sửa / cái** (₫, số nguyên ≥ 0), để trống nghĩa là chưa đặt. Trường SHALL hiện trên form và chi tiết vật tư D9 cho người có `repairs.view`; chỉ người có `repairs.manage` (Giám đốc, Kế toán) sửa được. Mã nhóm Vật tư SHALL không có trường này. Sửa đơn giá SHALL ghi nhật ký như sửa danh mục.

#### Scenario: Đặt đơn giá công
- **WHEN** `thuha` (Kế toán) đặt đơn giá công sửa của `GG-K17` là 40.000 ₫
- **THEN** D9 hiện "Công sửa 40.000 ₫ / cái" ở chi tiết `GG-K17`

#### Scenario: Kinh doanh không sửa được đơn giá công
- **WHEN** `quocbao` (Kinh doanh) sửa `GG-K17` và gửi kèm đơn giá công 50.000 ₫
- **THEN** API trả 403 cho trường đơn giá công **AND** đơn giá vẫn 40.000 ₫

#### Scenario: Đơn giá âm
- **WHEN** Kế toán đặt đơn giá công −1.000 ₫
- **THEN** hệ thống từ chối với "Đơn giá công sửa phải là số đồng không âm"

## MODIFIED Requirements

### Requirement: Đơn vị và trọng lượng chuẩn
Mỗi vật tư SHALL có một đơn vị: đơn vị **đếm** `Cái`, `Cây`, `Bó`, `Sọt`, `Cuộn`, `Hộp`, `Thùng` (số lượng nguyên) hoặc đơn vị **đo** `Kg`, `Mét`, `Lít` (số lượng tối đa 3 chữ số thập phân). Mọi đơn vị trừ `Kg` SHALL có trọng lượng chuẩn (kg trên một đơn vị) lớn hơn 0, tối đa 3 chữ số thập phân. Vật tư tính theo `Kg` SHALL không có trọng lượng chuẩn. Đơn vị SHALL không đổi được sau khi tạo.

#### Scenario: Khung giàn giáo
- **WHEN** tạo vật tư `GG-K17` đơn vị cái, trọng lượng chuẩn 13,5 kg
- **THEN** vật tư được lưu với trọng lượng chuẩn 13,500 kg/cái

#### Scenario: Thép ống tính theo mét
- **WHEN** tạo vật tư `ONG-49` đơn vị mét, trọng lượng chuẩn 3,56 kg
- **THEN** vật tư được lưu với trọng lượng chuẩn 3,560 kg/m **AND** D9 hiện ĐVT "m" và "3,56 kg/m"

#### Scenario: Sơn tính theo lít
- **WHEN** tạo vật tư `VT-SON` nhóm Vật tư, đơn vị lít, trọng lượng chuẩn 1,3 kg
- **THEN** vật tư được lưu và D9 hiện ĐVT "lít" và "1,3 kg/lít" **AND** nhập 0,5 lít trên chứng từ được nhận

#### Scenario: Ty ren tính theo bó
- **WHEN** tạo vật tư `TY-REN` đơn vị bó, trọng lượng chuẩn 25 kg
- **THEN** vật tư được lưu và D9 hiện ĐVT "bó" và "25 kg/bó"

#### Scenario: Thiếu trọng lượng
- **WHEN** tạo vật tư tính theo cái, theo mét hoặc theo lít với trọng lượng chuẩn 0 hoặc để trống
- **THEN** hệ thống từ chối với "Nhập trọng lượng chuẩn lớn hơn 0 kg"

#### Scenario: Phế liệu tính theo kg
- **WHEN** tạo vật tư `PL-SAT` đơn vị kg
- **THEN** vật tư được lưu không có trọng lượng chuẩn và cột trọng lượng ở D9 hiện "–"

#### Scenario: Số lượng lẻ cho đơn vị đếm
- **WHEN** nhập 2,5 bó `TY-REN` trên một chứng từ
- **THEN** hệ thống từ chối với "Số lượng bó phải là số nguyên"

#### Scenario: Số lượng lẻ cho đơn vị mét
- **WHEN** nhập 12,345 m `ONG-49` trên một chứng từ
- **THEN** số lượng được nhận là 12,345 m
