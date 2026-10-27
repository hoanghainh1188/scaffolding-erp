# Spec Delta

## Purpose
Màn D10 Tồn kho tổng hợp và D11 Thẻ kho cho văn phòng xem tồn theo vị trí và tình trạng, giá trị hàng tồn và lịch sử biến động của từng mã hàng, tất cả tính từ sổ kho.

## ADDED Requirements

### Requirement: Bảng tồn kho D10
Trang `/inventory` (mục menu "Kho") SHALL hiện bảng tồn theo mã hàng đang dùng, mỗi dòng gồm: tên kèm mã và đơn vị; **Tại bãi** tách 4 cột Mới, Tốt, Chờ sửa, Phế liệu (cộng mọi bãi); **Tại xưởng**; **Tại công trình** (cộng mọi công trình); **Tổng**; **Giá trị** = tổng số lượng × giá vốn BQ hiện tại theo từng tình trạng (cả hàng ở công trình), làm tròn đến 1 ₫. Mã chưa có dòng sổ hiện 0. Số SHALL tính từ sổ kho lúc mở trang.

#### Scenario: Dòng GG-K17
- **WHEN** `GG-K17` có tại bãi Mới 0, Tốt 1.240, Chờ sửa 186, Phế liệu 42; tại xưởng 60; tại 3 công trình cộng 3.860
- **THEN** dòng `GG-K17` hiện 0 · 1.240 · 186 · 42 · 60 · 3.860 và Tổng 5.388

#### Scenario: Giá trị theo từng tình trạng
- **WHEN** `GG-M16` có Tốt 2.500 cái giá BQ 152.000 ₫ và Chờ sửa 100 cái giá BQ 98.000 ₫
- **THEN** cột Giá trị hiện 389.800.000 ₫ (2.500 × 152.000 + 100 × 98.000)

#### Scenario: Chưa có giao dịch
- **WHEN** `OT-06` chưa có dòng sổ nào
- **THEN** dòng `OT-06` hiện 0 ở mọi cột và Giá trị 0 ₫

### Requirement: Tìm, lọc và bố cục D10
Đầu trang D10 SHALL ghi "Tính từ sổ kho · cập nhật <ngày giờ>". D10 SHALL tìm theo tên hoặc mã (không phân biệt dấu, hoa thường), lọc theo nhóm, bật/tắt cột Giá trị ("Hiện giá trị"); bộ lọc nằm trên URL. Ở 1366px bảng SHALL thấy đủ các cột, không cuộn ngang.

#### Scenario: Tìm không dấu
- **WHEN** gõ "khung gian giao" vào ô tìm
- **THEN** chỉ còn các dòng `GG-K17`, `GG-K15` **AND** URL có `q=khung+gian+giao`

### Requirement: Thẻ số đầu D10
D10 SHALL có 3 thẻ số: **Giá trị hàng tồn** (tổng cột Giá trị của mọi mã, gồm cả hàng ở công trình); **Chờ sửa** (tổng số cái Chờ sửa tại bãi và xưởng); **Phế liệu tại bãi** theo kg = kg của mã tính theo kg + kg quy đổi của phế liệu đếm theo cái (số cái × trọng lượng chuẩn), kèm dòng phụ "gồm <kg> quy đổi từ <số> cái".

#### Scenario: Phế liệu gộp kg
- **WHEN** tại bãi có `PL-SAT` 12.850,5 kg và phế liệu đếm theo cái: `GG-K17` 42 cái (13,5 kg), `GG-K15` 18 cái (12,2 kg), `GG-CH` 64 cái (2,8 kg), `GG-M16` 11 cái (11 kg), `PK-KU` 6 cái (3,6 kg)
- **THEN** thẻ hiện **13.958,9 kg** và dòng phụ "gồm 1.108,4 kg quy đổi từ 141 cái"

#### Scenario: Chưa có tồn
- **WHEN** sổ kho chưa có dòng nào
- **THEN** ba thẻ hiện 0 ₫, 0 cái, 0 kg **AND** bảng có lời nhắc "Chưa có số tồn. Lập phiếu tồn đầu kỳ để bắt đầu." kèm liên kết (với người có quyền lập)

### Requirement: Mở thẻ kho từ D10
Mỗi con số khác 0 trong bảng D10 SHALL là liên kết tới thẻ kho của mã hàng đó với bộ lọc tương ứng (tình trạng, vị trí). Số **Tại công trình** SHALL mở danh sách từng công trình còn hàng của mã đó (mã, tên công trình, số lượng), mỗi dòng mở thẻ kho lọc theo công trình đó.

#### Scenario: Bấm số Chờ sửa tại bãi
- **WHEN** bấm số 186 ở cột Chờ sửa của `GG-K17`
- **THEN** mở `/inventory/items/GG-K17?condition=NEEDS_REPAIR&place=yard`

#### Scenario: Xem từng công trình
- **WHEN** bấm 3.860 ở cột Tại công trình của `GG-K17`
- **THEN** hiện `CT-0001` 1.600, `CT-0003` 1.540, `CT-0005` 720 **AND** bấm `CT-0003` mở thẻ kho lọc vị trí `CT-0003`

### Requirement: Thẻ kho D11
Trang `/inventory/items/<mã>` SHALL hiện tên, mã, đơn vị và bảng sổ trong kỳ: dòng đầu "Tồn đầu kỳ", rồi từng dòng sổ theo ngày nghiệp vụ và thứ tự ghi với các cột Ngày, Chứng từ (phiếu điều chỉnh có nhãn "Điều chỉnh"), Diễn giải, Nhập, Xuất, Tồn (cộng dồn theo bộ lọc), Đơn giá ghi sổ, Giá vốn BQ sau; dòng cuối "Cộng phát sinh trong kỳ". Chân bảng ghi "Sổ kho chỉ ghi thêm, không sửa dòng cũ. Phiếu ghi sai thì làm phiếu điều chỉnh."

#### Scenario: Thẻ kho GG-K17 Tốt tại bãi tháng 10
- **WHEN** mở thẻ kho `GG-K17`, Tốt, Tại bãi, kỳ 01/10/2026–31/10/2026 với số liệu mẫu ở design D11
- **THEN** Tồn đầu kỳ 1.220, Nhập +450, Xuất −430, Tồn cuối 1.240 **AND** giá vốn BQ hiện tại 195.282 ₫ **AND** các dòng theo thứ tự: 03/10 `PX-2026-118` xuất 300, tồn 920, 195.000 ₫ → 195.000 ₫; 08/10 `PN-2026-087` nhập 160, tồn 1.080, 196.155 ₫ → 195.055 ₫; 12/10 `PSC-2026-021` nhập 40, tồn 1.120, 214.500 ₫ → 195.282 ₫; 15/10 `PTH-2026-064` nhập 210, tồn 1.330; 16/10 `ĐC-2026-004` xuất 10, tồn 1.320; 20/10 `PX-2026-131` xuất 120, tồn 1.200; 22/10 `PTH-2026-069` nhập 40, tồn 1.240 (các dòng từ 15/10 đều 195.282 ₫)

#### Scenario: Đơn giá ghi sổ của dòng nhập
- **WHEN** dòng `PN-2026-087` nhập 160 cái tổng giá trị 31.384.800 ₫
- **THEN** cột Đơn giá ghi sổ hiện 196.155 ₫ (giá trị ÷ số lượng, làm tròn đến 1 ₫)

#### Scenario: Mã không tồn tại
- **WHEN** mở `/inventory/items/KHONG-CO`
- **THEN** trang 404 "Không tìm thấy mã hàng"

### Requirement: Bộ lọc và số tóm tắt của thẻ kho
D11 SHALL lọc theo tình trạng (Tất cả, Mới, Tốt, Chờ sửa, Phế liệu; mặc định Tốt), vị trí (Tại bãi, Tại xưởng, Tại công trình hoặc một công trình; mặc định Tại bãi), kỳ (mặc định tháng hiện tại theo giờ Việt Nam); bộ lọc nằm trên URL. Bốn số tóm tắt: Tồn đầu kỳ, Nhập trong kỳ, Xuất trong kỳ (dấu −), Tồn cuối kỳ; thẻ Giá vốn bình quân hiện tại khi chọn một tình trạng. Chọn "Tất cả" tình trạng SHALL ẩn hai cột giá và thẻ giá vốn.

#### Scenario: Kỳ không có biến động
- **WHEN** chọn kỳ 01/11/2026–30/11/2026 khi chưa có dòng nào trong tháng 11
- **THEN** Tồn đầu kỳ bằng Tồn cuối kỳ (1.240) **AND** Nhập, Xuất bằng 0 **AND** bảng chỉ có dòng "Tồn đầu kỳ" và lời nhắc "Không có biến động trong kỳ"

### Requirement: Hiện số lượng theo đơn vị
D10 và D11 SHALL hiện số lượng kiểu Việt Nam (spec `domain-values`): hàng tính theo cái là số nguyên, hàng tính theo kg tới 0,001 kg (bỏ số 0 thừa). Ở thẻ kho tình trạng Phế liệu của mã tính theo cái, Tồn cuối kỳ SHALL hiện kèm kg quy đổi.

#### Scenario: Phế liệu đếm theo cái trên thẻ kho
- **WHEN** mở thẻ kho `GG-K17`, Phế liệu, Tại bãi, tồn cuối 42 cái, trọng lượng chuẩn 13,5 kg
- **THEN** Tồn cuối kỳ hiện "42" kèm "≈ 567 kg"

#### Scenario: Hàng tính theo kg
- **WHEN** mở thẻ kho `PL-SAT` có tồn 12.850,5 kg
- **THEN** Tồn cuối kỳ hiện "12.850,5" với đơn vị kg **AND** giá vốn ghi "mỗi kg"

### Requirement: Quyền xem tồn kho
D10, D11 và API đọc tồn (`/api/inventory/stock`, `/api/inventory/items/<mã>/card`) SHALL cần quyền `inventory.view` (`DIRECTOR`, `ACCOUNTANT`, `SALES`). Vai trò khác mở trang nhận trang 403, gọi API nhận 403. Liên kết "Phiếu điều chỉnh" ở D10 hiện cho người có `inventory.view`; nút "Lập phiếu điều chỉnh" chỉ hiện cho người có `inventory.adjust`.

#### Scenario: Kinh doanh xem tồn
- **WHEN** `quocbao` (Kinh doanh) mở `/inventory`
- **THEN** thấy bảng tồn **AND** không thấy nút "Lập phiếu điều chỉnh"

#### Scenario: Thủ kho gọi API tồn
- **WHEN** `vantung` (Thủ kho) gửi `GET /api/inventory/stock`
- **THEN** API trả 403
