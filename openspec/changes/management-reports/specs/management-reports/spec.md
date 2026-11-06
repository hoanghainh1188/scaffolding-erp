## Purpose

Màn D15 Báo cáo quản trị trên Desktop và file Excel của nó, cho Giám đốc và Kế toán: lợi nhuận gộp, biểu đồ theo tháng, hao hụt, tỷ lệ khai thác và xếp hạng nhà thầu của năm. Chỉ đọc.

## ADDED Requirements

### Requirement: Ai xem Báo cáo
Trang `/reports` và API xuất Excel SHALL chỉ cho người có quyền `reports.view` (Giám đốc, Kế toán). Kinh doanh SHALL nhận 403 ở trang và API. Thủ kho, Xưởng mở trang SHALL bị chuyển tới `/m` như mọi trang Desktop; gọi API SHALL nhận 403. Server SHALL không tính số khi bị từ chối.

#### Scenario: Kế toán mở báo cáo
- **WHEN** `ketoan` mở `/reports`
- **THEN** trang hiện "Báo cáo quản trị" với 4 ô số

#### Scenario: Kinh doanh bị chặn
- **WHEN** `kinhdoanh` mở `/reports` hoặc gọi `GET /api/reports/export?period=month&value=2026-10`
- **THEN** cả hai trả 403 và không chứa số tiền nào

#### Scenario: Thủ kho và Xưởng gọi API
- **WHEN** `thukho` hoặc `xuong` gọi `GET /api/reports/export?period=month&value=2026-10`
- **THEN** API trả 403

### Requirement: Báo cáo chỉ đọc
Mở D15 và xuất Excel SHALL không ghi gì: không chứng từ, không dòng sổ kho, không dòng nhật ký thao tác. Mọi số SHALL tính lại từ dữ liệu mỗi lần mở.

#### Scenario: Mở hai lần
- **WHEN** Giám đốc mở `/reports` rồi bấm "Xuất Excel"
- **THEN** số dòng `inventory_ledger`, `activity_log` và mọi bảng chứng từ không đổi

### Requirement: Chọn kỳ trên D15
D15 SHALL có nút chọn Tháng / Quý / Năm và ô chọn kỳ cụ thể, lưu trong đường dẫn (`period` = `month` | `quarter` | `year`, `value` = `2026-10` | `2026-Q3` | `2026`). Mặc định là tháng này. Chọn được từ năm 2020 đến kỳ chứa hôm nay. Giá trị sai hoặc ở tương lai SHALL mở tháng này. Dòng dưới tiêu đề SHALL ghi kỳ, "số liệu đến hết dd/mm/yyyy" và "chưa VAT".

#### Scenario: Mở theo đường dẫn
- **WHEN** hôm nay 06/11/2026 Giám đốc mở `/reports?period=quarter&value=2026-Q3`
- **THEN** trang ghi "Quý 3/2026 · số liệu đến hết 30/09/2026" và cột kỳ trước là "Quý 2/2026"

#### Scenario: Giá trị sai
- **WHEN** mở `/reports?period=month&value=2026-13`
- **THEN** trang mở tháng 11/2026

### Requirement: Bốn ô số đầu trang
D15 SHALL có 4 ô: **Doanh thu** của kỳ kèm % so với kỳ trước (1 chữ số, dấu + hoặc −; kỳ trước 0 ₫ thì không ghi %); **Lợi nhuận gộp** kèm tỷ suất; **Hao hụt** (tấn trên 100 tấn hàng cho thuê); **Tỷ lệ khai thác** kèm "x / y tấn ở công trình" (bình quân).

#### Scenario: Ô doanh thu so với kỳ trước
- **WHEN** doanh thu tháng 10/2026 là 535.550.000 ₫, tháng 09/2026 là 450.150.000 ₫
- **THEN** ô Doanh thu hiện "535.550.000 ₫" và "+ 19,0 % so với tháng 9"

#### Scenario: Ô khai thác
- **WHEN** tháng 10/2026 bình quân 285,9 tấn ở công trình trên 412,6 tấn Mới, Tốt
- **THEN** ô hiện "69,3 %" và "285,9 / 412,6 tấn ở công trình"

### Requirement: Bảng lợi nhuận gộp ba cột
Bảng SHALL có cột Kỳ này, Kỳ trước, Lũy kế năm; dòng Doanh thu (4 dòng con), Giá vốn và hao hụt (6 dòng con), Lợi nhuận gộp, Tỷ suất; dưới bảng ghi "chi phí sửa đã chi" của từng cột và "Hàng cho thuê không trừ khấu hao". Cột có tiền thuê tạm tính SHALL có dấu "tạm tính".

#### Scenario: Khớp ô số
- **WHEN** Giám đốc xem tháng 10/2026
- **THEN** dòng Doanh thu và Lợi nhuận gộp của cột Kỳ này bằng đúng số trong ô Doanh thu và ô Lợi nhuận gộp

### Requirement: Biểu đồ doanh thu và lợi nhuận theo tháng
D15 SHALL có biểu đồ mỗi tháng của năm chứa kỳ, từ tháng 1 đến tháng cuối của kỳ (hoặc tháng này): doanh thu và lợi nhuận gộp (triệu ₫). Tháng tạm tính có dấu *. Lợi nhuận âm SHALL vẽ dưới trục 0.

#### Scenario: Năm đang chạy
- **WHEN** hôm nay 06/11/2026 Giám đốc xem tháng 10/2026
- **THEN** biểu đồ có 10 tháng T1 – T10 năm 2026 **AND** cột T10 bằng số của cột Kỳ này

### Requirement: Bảng hao hụt theo mã
Bảng SHALL có cột mã hàng, bình quân (tấn), mất, phế, phải sửa (tấn), trên 100 tấn; dòng Cộng bằng số của ô Hao hụt. Xếp theo bình quân giảm dần; hiện 10 mã đầu, các mã còn lại gộp một dòng "N mã khác". Dưới bảng ghi số của năm lũy kế.

#### Scenario: Gộp mã khác
- **WHEN** kỳ có 16 mã có hàng cho thuê
- **THEN** bảng có 10 dòng mã, 1 dòng "6 mã khác" và dòng Cộng

### Requirement: Bảng tỷ lệ khai thác theo mã
Bảng SHALL có cột mã hàng, tổng (cái), ở công trình (cái), khai thác; chỉ mã đơn vị cái; số cái là bình quân làm tròn tới cái; xếp khai thác giảm dần; hiện 10 mã đầu, còn lại gộp "N mã khác".

#### Scenario: Bình quân làm tròn
- **WHEN** `PK-KU` bình quân 10.000 cái, ở công trình 7.333,3 cái
- **THEN** dòng `PK-KU` hiện 10.000, 7.333 và 73,3 %

### Requirement: Xếp hạng nhà thầu của năm
D15 SHALL có bảng **đầy đủ** mọi nhà thầu của năm chứa kỳ (01/01 đến hết năm hoặc hôm nay), đổi "Doanh thu" / "Theo kg" như Top 5 của D1 (0.2 #93, #95): cột hạng, nhà thầu, doanh thu, thuê, bán, tấn đã giao, số hợp đồng. Bằng nhau xếp theo tên; số 0 không vào bảng. 5 dòng đầu SHALL giống Top 5 D1 cùng năm.

#### Scenario: Khớp Top 5 của D1
- **WHEN** năm 2026 có 18 nhà thầu có doanh thu và D1 Top 5 theo doanh thu là Sông Hồng, Minh Phát, Thành Công, Đông Á, Trần Văn Hùng
- **THEN** bảng theo doanh thu có 18 dòng, 5 dòng đầu đúng thứ tự đó và cùng số tiền

#### Scenario: Theo kg không trừ hàng trả
- **WHEN** năm 2026 Minh Phát được giao 400 `PK-KU` (5 kg/cái) và trả về 300 cái
- **THEN** cột tấn đã giao của Minh Phát là 2,0

### Requirement: Xuất Excel báo cáo
"Xuất Excel" SHALL tải `bao-cao-<value>.xlsx` của kỳ đang chọn, 5 sheet: "Lợi nhuận gộp" (như bảng ba cột), "Theo tháng" (mỗi tháng của năm: thuê, bán, đền bù, mua lại, doanh thu, 6 khoản giá vốn, lợi nhuận, tạm tính), "Hao hụt" và "Khai thác" (mọi mã, không gộp), "Xếp hạng nhà thầu" (mọi nhà thầu). Tiền SHALL là ô số nguyên; tấn, % là ô số.

#### Scenario: Excel khớp màn hình
- **WHEN** Kế toán xuất Excel tháng 10/2026
- **THEN** file `bao-cao-2026-10.xlsx` có ô lợi nhuận gộp kỳ này 407610000 (số nguyên) bằng số trên D15 **AND** sheet "Xếp hạng nhà thầu" có đủ 18 dòng

#### Scenario: Tham số sai
- **WHEN** gọi `GET /api/reports/export?period=week&value=2026-10`
- **THEN** API trả 400 với "Kỳ báo cáo không hợp lệ"
