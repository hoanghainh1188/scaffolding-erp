## ADDED Requirements

### Requirement: Xuất vật tư dùng cho sửa chữa
Vật tư phụ dùng khi sửa SHALL ra khỏi kho bằng dòng `REPAIR_OUT` của chính mã vật tư, tại xưởng của lệnh, chứng từ là mã lệnh, theo giá BQ hiện tại của (mã + tình trạng), không làm đổi giá BQ. Giá trị đó SHALL vào giá trị dòng `REPAIR_IN` Tốt của cùng lệnh, nên tổng giá trị kho chỉ tăng đúng phần công khoán (trừ lỗ hỏng hàng).

#### Scenario: Vật tư chuyển giá trị sang hàng Tốt
- **WHEN** lệnh `PSC-2026-031` ghi sổ `REPAIR_OUT` −6 kg `VT-QH` Mới (BQ 45.000 ₫, −270.000 ₫) và −3 lít `VT-SON` Mới (BQ 90.000 ₫, −270.000 ₫) cho dòng `GG-K17` có công 1.440.000 ₫
- **THEN** giá BQ của `VT-QH`, `VT-SON` không đổi **AND** dòng `REPAIR_IN` Tốt của `GG-K17` gồm 540.000 ₫ vật tư và 1.440.000 ₫ công

### Requirement: Chuyển hàng sang xưởng theo lệnh sửa
Khi xưởng nhận lệnh, hàng Chờ sửa SHALL chuyển vị trí bằng cặp dòng `TRANSFER_OUT` / `TRANSFER_IN` cùng tình trạng Chờ sửa, chứng từ là mã lệnh, theo giá BQ, không đổi giá BQ và tổng giá trị. Khi ghi sổ lệnh, Chờ sửa SHALL xuất ở xưởng còn Tốt, Phế liệu SHALL nhập về vị trí lấy hàng (`REPAIR_OUT` và `REPAIR_IN` khác vị trí, 0.2 #130). Các dòng chuyển SHALL có mã ghi sổ riêng với lần ghi sổ lệnh, để màn hình và báo cáo phân biệt "nhận hàng" với "ghi sổ lệnh".

#### Scenario: Nhận lệnh rồi ghi sổ khác ngày
- **WHEN** `PSC-2026-031` nhận ngày 03/11/2026 và ghi sổ ngày 07/11/2026
- **THEN** 4 dòng chuyển hàng có ngày 03/11/2026, các dòng sửa và vật tư có ngày 07/11/2026 **AND** hai nhóm dòng có hai mã ghi sổ khác nhau
