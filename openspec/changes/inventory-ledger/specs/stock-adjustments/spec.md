# Spec Delta

## Purpose
Phiếu điều chỉnh sửa sai số lượng, tình trạng hoặc vị trí trong sổ kho, và phiếu tồn đầu kỳ đưa số tồn có sẵn vào khi bắt đầu dùng phần mềm; cả hai chỉ ghi sổ sau khi Giám đốc duyệt.

## ADDED Requirements

### Requirement: Ba kiểu dòng điều chỉnh
Phiếu điều chỉnh (mã `ĐC-<năm>-<số 3 chữ số>`, VD `ĐC-2026-004`) SHALL gồm một hoặc nhiều dòng, mỗi dòng thuộc một kiểu: **số lượng** (tăng/giảm tại một vị trí, ghi 1 dòng sổ), **tình trạng** (chuyển sang tình trạng khác tại cùng vị trí, ghi đúng 2 dòng sổ), **vị trí** (chuyển sang vị trí khác, cùng tình trạng, ghi đúng 2 dòng sổ). Mọi dòng sổ của phiếu điều chỉnh SHALL ghi theo giá vốn BQ hiện tại.

#### Scenario: Sửa sai tình trạng ra đúng 2 dòng
- **WHEN** `ĐC-2026-004` lý do "Sửa PTH-2026-064: 10 cái thực tế là Chờ sửa" có 1 dòng chuyển 10 cái `GG-K17` tại `BAI-01` từ Tốt (giá BQ 195.861 ₫) sang Chờ sửa (giá BQ 160.000 ₫) và được duyệt
- **THEN** sổ có đúng 2 dòng mới: `ADJUST_OUT` −10 Tốt ghi 195.861 ₫ và `ADJUST_IN` +10 Chờ sửa ghi 160.000 ₫, cùng chứng từ `ĐC-2026-004` **AND** tồn Tốt tại bãi từ 1.330 về 1.320 **AND** giá BQ hai tình trạng không đổi

#### Scenario: Giảm số lượng vì đếm thiếu
- **WHEN** phiếu điều chỉnh giảm 5 cái `GG-CH` Tốt tại `BAI-01` (giá BQ 31.000 ₫) lý do "Đếm lại bãi thiếu 5 cái" được duyệt
- **THEN** sổ có 1 dòng `ADJUST_OUT` −5 ghi 31.000 ₫

#### Scenario: Chuyển sai vị trí
- **WHEN** phiếu điều chỉnh chuyển 20 cái `GG-M16` Tốt từ `CT-0003` sang `CT-0005` lý do "Phiếu xuất ghi nhầm công trình" được duyệt
- **THEN** sổ có 2 dòng: −20 tại `CT-0003`, +20 tại `CT-0005`, cùng giá BQ hiện tại

#### Scenario: Dòng chuyển cùng chỗ
- **WHEN** dòng chuyển tình trạng có tình trạng đi và đến đều là Tốt
- **THEN** hệ thống từ chối với "Tình trạng đi và đến phải khác nhau"

### Requirement: Lý do bắt buộc
Phiếu điều chỉnh và phiếu tồn đầu kỳ SHALL có lý do (không để trống, tối đa 500 ký tự). Phiếu điều chỉnh SHALL cho ghi kèm mã chứng từ bị sửa (tùy chọn, VD `PTH-2026-064`). Giám đốc trả lại phiếu SHALL ghi lý do trả lại.

#### Scenario: Thiếu lý do
- **WHEN** Kế toán lưu phiếu điều chỉnh với lý do chỉ có dấu cách
- **THEN** hệ thống từ chối với "Nhập lý do điều chỉnh"

#### Scenario: Trả lại không lý do
- **WHEN** Giám đốc bấm "Trả lại" mà không ghi lý do
- **THEN** hệ thống từ chối với "Nhập lý do trả lại"

### Requirement: Lập, gửi duyệt, duyệt, trả lại
Phiếu SHALL đi theo trạng thái `DRAFT` (Nháp) → `PENDING_APPROVAL` (Chờ duyệt) → `DONE` (Đã ghi sổ). Chỉ phiếu Nháp sửa được hoặc xóa được. Gửi duyệt SHALL cần ít nhất một dòng. Giám đốc trả lại SHALL đưa phiếu về Nháp kèm lý do. Phiếu `DONE` SHALL không sửa, không xóa, không duyệt lại được. Lưu người lập, người duyệt và thời điểm từng bước.

#### Scenario: Chưa duyệt chưa ghi sổ
- **WHEN** Kế toán gửi duyệt `ĐC-2026-004`
- **THEN** phiếu ở trạng thái Chờ duyệt **AND** sổ kho chưa có dòng nào của phiếu **AND** tồn chưa đổi

#### Scenario: Trả lại để sửa
- **WHEN** Giám đốc trả lại phiếu với lý do "Ghi rõ số phiếu thu hồi"
- **THEN** phiếu về Nháp, hiện lý do trả lại **AND** Kế toán sửa và gửi duyệt lại được

### Requirement: Duyệt là ghi sổ
Giám đốc duyệt SHALL ghi mọi dòng sổ của phiếu trong cùng transaction với việc chuyển phiếu sang `DONE`, với ngày nghiệp vụ là ngày duyệt (phiếu tồn đầu kỳ: ngày tồn đầu), và SHALL kiểm tồn lại tại lúc duyệt.

#### Scenario: Tồn đổi giữa lúc lập và lúc duyệt
- **WHEN** phiếu giảm 50 cái `GG-CH` Tốt tại `BAI-01` được lập lúc bãi còn 100 cái, rồi xuất 70 cái trước khi Giám đốc duyệt
- **THEN** duyệt bị từ chối với "Không đủ hàng: GG-CH Tốt tại BAI-01 còn 30 cái" **AND** phiếu vẫn Chờ duyệt

#### Scenario: Duyệt hai lần
- **WHEN** Giám đốc duyệt `ĐC-2026-004` hai lần (hai tab cùng bấm)
- **THEN** sổ chỉ có một bộ 2 dòng của phiếu **AND** lần sau nhận "Phiếu đã được ghi sổ"

### Requirement: Phiếu tồn đầu kỳ
Phiếu tồn đầu kỳ (mã `TĐK-<năm>-<số 3 chữ số>`) SHALL gồm ngày tồn đầu (không sau hôm nay) và các dòng (mã hàng, tình trạng, vị trí, số lượng > 0, đơn giá vốn ≥ 0), đi cùng luồng lập/duyệt như phiếu điều chỉnh. Duyệt SHALL ghi mỗi dòng thành một dòng sổ `OPENING` (giá trị = số lượng × đơn giá); dòng tại bãi, xưởng tính giá BQ như nhập mua. (Mã hàng + tình trạng) đã có dòng sổ khác `OPENING` SHALL không nhận tồn đầu kỳ nữa.

#### Scenario: Tồn đầu ở bãi và công trình
- **WHEN** `TĐK-2026-001` ngày 01/10/2026 có `GG-K17` Tốt 1.000 cái tại `BAI-01` đơn giá 195.000 ₫ và 220 cái tại `CT-0003` đơn giá 195.000 ₫ được duyệt
- **THEN** sổ có 2 dòng `OPENING` ngày 01/10/2026 **AND** tồn `GG-K17` Tốt là 1.220 cái, giá BQ 195.000 ₫

#### Scenario: Hai đơn giá khác nhau
- **WHEN** phiếu tồn đầu có `GG-K15` Tốt 600 cái tại `BAI-01` giá 165.000 ₫ và 260 cái tại `XUONG-01` giá 172.000 ₫
- **THEN** giá BQ = (600 × 165.000 + 260 × 172.000) ÷ 860 = 167.116,28 → **167.116 ₫**

#### Scenario: Đã có biến động
- **WHEN** `GG-K17` Tốt đã có dòng `DELIVERY_OUT` và Kế toán lập phiếu tồn đầu cho `GG-K17` Tốt
- **THEN** hệ thống từ chối với "GG-K17 Tốt đã có biến động, dùng phiếu điều chỉnh"

#### Scenario: Số lượng 0
- **WHEN** phiếu tồn đầu có dòng 0 cái `GG-CH` Mới
- **THEN** hệ thống từ chối với "Số lượng tồn đầu phải lớn hơn 0"

### Requirement: Danh sách và chi tiết phiếu điều chỉnh
Trang `/inventory/adjustments` SHALL liệt kê phiếu điều chỉnh và tồn đầu kỳ (mã, loại, ngày, người lập, lý do, số dòng, trạng thái), mới nhất trên cùng, lọc theo trạng thái trên URL; "Chờ duyệt" hiện trước cho Giám đốc. Bấm một phiếu SHALL mở chi tiết với các dòng và, khi đã ghi sổ, các dòng sổ đã sinh ra. Nút lập, sửa, gửi duyệt, xóa hiện cho người có quyền lập; nút "Duyệt và ghi sổ", "Trả lại" chỉ hiện cho Giám đốc ở phiếu Chờ duyệt.

#### Scenario: Giám đốc thấy phiếu chờ duyệt
- **WHEN** có 2 phiếu Chờ duyệt và 5 phiếu đã ghi sổ, Giám đốc mở `/inventory/adjustments`
- **THEN** 2 phiếu Chờ duyệt ở trên cùng **AND** mỗi phiếu có nút "Duyệt và ghi sổ"

#### Scenario: Kế toán không thấy nút duyệt
- **WHEN** Kế toán mở phiếu Chờ duyệt do mình lập
- **THEN** không có nút "Duyệt và ghi sổ" hay "Trả lại"

### Requirement: Quyền lập và duyệt
Lập, sửa, xóa, gửi duyệt phiếu điều chỉnh và tồn đầu kỳ SHALL cần quyền `inventory.adjust` (`DIRECTOR`, `ACCOUNTANT`). Duyệt và trả lại SHALL cần quyền `inventory.approve` (chỉ `DIRECTOR`). Xem danh sách và chi tiết SHALL cần `inventory.view`. Server SHALL kiểm quyền ở mọi API, trả 403 "Bạn không có quyền thực hiện thao tác này".

#### Scenario: Kinh doanh lập phiếu
- **WHEN** `quocbao` (Kinh doanh) gửi `POST /api/inventory/adjustments`
- **THEN** API trả 403 **AND** không có phiếu nào được tạo

#### Scenario: Kế toán tự duyệt
- **WHEN** `thuha` (Kế toán) gửi `POST /api/inventory/adjustments/<id>/approve`
- **THEN** API trả 403 **AND** sổ kho không đổi

#### Scenario: Thủ kho đọc API phiếu
- **WHEN** `vantung` (Thủ kho) gửi `GET /api/inventory/adjustments`
- **THEN** API trả 403
