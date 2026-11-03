## Purpose

Phiếu đền bù tính tiền hàng hỏng, phế liệu và mất của một phiếu thu hồi theo bảng giá đền bù của hợp đồng; chỉ có hiệu lực (thành phải thu) sau khi Giám đốc duyệt.

## ADDED Requirements

### Requirement: Phiếu đền bù tự sinh khi ghi sổ thu hồi
Khi phiếu thu hồi được ghi sổ và có ít nhất một dòng Chờ sửa, Phế liệu hoặc Mất, hệ thống SHALL tạo trong cùng transaction một phiếu đền bù Chờ duyệt, số `ĐB-<năm>-<số 3 chữ số>` (bảng đếm chứng từ). Mỗi phiếu thu hồi SHALL có tối đa một phiếu đền bù. Phiếu thu hồi chỉ có hàng Tốt SHALL không có phiếu đền bù.

#### Scenario: Có hàng hỏng và mất
- **WHEN** `PTH-2026-071` ghi sổ có 15 `H1,7` Chờ sửa, 3 Phế liệu, 2 Mất
- **THEN** có `ĐB-2026-009` Chờ duyệt gắn `PTH-2026-071` và hợp đồng `112026/ANPHAT-MINHPHAT`

#### Scenario: Chỉ có hàng Tốt
- **WHEN** phiếu thu hồi ghi sổ 50 `CHEO1,7` Tốt, không có Chờ sửa, Phế liệu, Mất
- **THEN** không có phiếu đền bù nào được tạo **AND** bảng đếm `ĐB` không tăng

### Requirement: Đơn giá đền theo tình trạng
Mỗi dòng phiếu đền bù SHALL là (mã + tình trạng trả về) với số lượng lấy từ phiếu thu hồi. Đơn giá SHALL là: Chờ sửa = giá "hỏng, sửa được"; Phế liệu = giá mất; Mất = giá mất. Thành tiền = số lượng × đơn giá, làm tròn tới 1 ₫. Tổng = cộng thành tiền các dòng.

#### Scenario: Tính theo bảng giá
- **WHEN** hợp đồng có giá `H1,7` hỏng 50.000 ₫, mất 450.000 ₫ và phiếu thu hồi có 15 Chờ sửa, 3 Phế liệu, 2 Mất
- **THEN** phiếu đền bù có các dòng 15 × 50.000 = 750.000 ₫, 3 × 450.000 = 1.350.000 ₫ (ghi "tính như mất"), 2 × 450.000 = 900.000 ₫

#### Scenario: Tổng nhiều mã
- **WHEN** phiếu có thêm 5 `CHEO1,7` Chờ sửa (15.000 ₫), 2 `MAM1,6` Chờ sửa (40.000 ₫), 2 `MAM1,6` Mất (380.000 ₫)
- **THEN** tổng phiếu là 3.915.000 ₫ **AND** ô tóm tắt hiện Chờ sửa 22 cái 905.000 ₫, Phế liệu 3 cái 1.350.000 ₫, Mất 4 cái 1.660.000 ₫

#### Scenario: Số lượng 0 không thành dòng
- **WHEN** dòng `CHEO1,7` của phiếu thu hồi có Chờ sửa 0, Phế liệu 0, Mất 0
- **THEN** phiếu đền bù không có dòng nào của `CHEO1,7`

### Requirement: Giá theo bản hợp đồng tại ngày trả
Đơn giá SHALL lấy từ bản hợp đồng đã duyệt đang áp dụng tại ngày trả của phiếu thu hồi (bản có ngày hiệu lực lớn nhất không sau ngày đó). Phụ lục duyệt sau, hiệu lực sau ngày trả SHALL không đổi giá phiếu. Đơn giá SHALL lưu trên dòng phiếu đền bù.

#### Scenario: Phụ lục đổi giá trước ngày trả
- **WHEN** bản gốc có giá mất `H1,7` 450.000 ₫, phụ lục `/01` hiệu lực 01/11/2026 đổi thành 480.000 ₫, và phiếu thu hồi có ngày trả 05/11/2026 với 2 `H1,7` Mất
- **THEN** dòng Mất có đơn giá 480.000 ₫, thành tiền 960.000 ₫

#### Scenario: Trả trước ngày hiệu lực của phụ lục
- **WHEN** cùng hợp đồng đó và phiếu thu hồi có ngày trả 31/10/2026 với 2 `H1,7` Mất
- **THEN** dòng Mất có đơn giá 450.000 ₫

### Requirement: Dòng chưa có giá đền
Khi bản hợp đồng tại ngày trả không có giá cần dùng cho một mã, dòng SHALL có đơn giá trống và hiện "Chưa có giá". Giám đốc SHALL nhập đơn giá (số nguyên ≥ 0) trước khi duyệt. Phiếu còn dòng chưa có giá SHALL không duyệt được.

#### Scenario: Duyệt khi còn dòng chưa có giá
- **WHEN** dòng `MAM1,6` Mất chưa có giá và `minhanh` bấm duyệt
- **THEN** hệ thống từ chối với "MAM1,6 Mất chưa có giá đền trong hợp đồng. Nhập đơn giá trước khi duyệt."

#### Scenario: Nhập giá
- **WHEN** `minhanh` nhập 380.000 ₫ cho dòng `MAM1,6` Mất 2 cái
- **THEN** dòng có thành tiền 760.000 ₫ **AND** nhật ký ghi "Sửa ĐB-2026-009: đơn giá MAM1,6 Mất: trống → 380.000 ₫"

### Requirement: Giảm trừ khi duyệt
Giám đốc SHALL được nhập một số tiền giảm trừ (số nguyên, 0 ≤ giảm trừ ≤ tổng) cho cả phiếu. Giảm trừ lớn hơn 0 SHALL bắt buộc lý do (tối đa 500 ký tự). Tiền phải thu = tổng − giảm trừ.

#### Scenario: Giảm trừ có lý do
- **WHEN** phiếu tổng 3.915.000 ₫ và `minhanh` giảm 415.000 ₫ lý do "Khách quen, bớt phần chéo cong" rồi duyệt
- **THEN** tiền phải thu là 3.500.000 ₫

#### Scenario: Giảm trừ không có lý do
- **WHEN** `minhanh` nhập giảm 415.000 ₫ và để trống lý do
- **THEN** hệ thống từ chối với "Bạn cần ghi lý do giảm trừ."

#### Scenario: Giảm hết
- **WHEN** `minhanh` giảm 3.915.000 ₫ với lý do "Lỗi do xe công ty làm rơi" rồi duyệt
- **THEN** phiếu Đã duyệt với tiền phải thu 0 ₫

#### Scenario: Giảm quá tổng
- **WHEN** `minhanh` nhập giảm 4.000.000 ₫ cho phiếu tổng 3.915.000 ₫
- **THEN** hệ thống từ chối với "Số tiền giảm (4.000.000 ₫) lớn hơn tiền đền bù (3.915.000 ₫)."

### Requirement: Trạng thái phiếu đền bù
Phiếu đền bù SHALL có trạng thái Chờ duyệt, Đã duyệt, Đã từ chối. Chỉ Chờ duyệt SHALL đổi được (đơn giá dòng chưa có giá, giảm trừ, lý do). Từ chối SHALL bắt buộc lý do; phiếu Đã từ chối SHALL không phải thu. Phiếu Đã duyệt và Đã từ chối SHALL bị khóa, kể cả các dòng. Lệnh sửa SHALL gửi kèm thời điểm sửa cuối, lệch thì trả 409.

#### Scenario: Từ chối có lý do
- **WHEN** `minhanh` từ chối `ĐB-2026-009` với lý do "Hàng hỏng do bãi xếp, không phải lỗi khách"
- **THEN** phiếu Đã từ chối **AND** tiền phải thu không có

#### Scenario: Hộp thoại từ chối nêu số tiền
- **WHEN** `minhanh` bấm "Từ chối" trên `ĐB-2026-009` tổng 3.915.000 ₫
- **THEN** hộp thoại hiện "Từ chối thì không thu 3.915.000 ₫ đền bù của PTH-2026-071. Bạn không mở lại được phiếu này." kèm ô lý do

#### Scenario: Từ chối không lý do
- **WHEN** `minhanh` bấm từ chối với lý do trống
- **THEN** hệ thống từ chối với "Bạn cần ghi lý do từ chối."

#### Scenario: Sửa phiếu đã duyệt
- **WHEN** gửi sửa giảm trừ của `ĐB-2026-009` Đã duyệt
- **THEN** API trả 409 với "Phiếu đền bù đã duyệt, không sửa được nữa." **AND** DB cũng từ chối nếu UPDATE thẳng

#### Scenario: Sửa trên bản cũ
- **WHEN** `minhanh` mở D8 trên hai tab, lưu giảm trừ ở tab 1 rồi lưu ở tab 2
- **THEN** tab 2 nhận 409 với "Phiếu vừa được sửa ở nơi khác. Tải lại để xem bản mới."

### Requirement: Duyệt khi nhà thầu đang nợ quá hạn
Khi nhà thầu của hợp đồng đang có nợ quá hạn, D8 SHALL hiện cảnh báo số nợ và số ngày quá hạn; duyệt SHALL vẫn được nhưng bắt buộc lý do duyệt, lưu cùng lần duyệt. Không nợ quá hạn thì không cần lý do duyệt.

#### Scenario: Nợ quá hạn
- **WHEN** Minh Phát đang nợ quá hạn 96.000.000 ₫ (7 ngày) và `minhanh` duyệt `ĐB-2026-009` không ghi lý do duyệt
- **THEN** hệ thống từ chối với "Nhà thầu đang nợ quá hạn 96.000.000 ₫ (7 ngày). Bạn cần ghi lý do duyệt."

#### Scenario: Không nợ quá hạn
- **WHEN** nhà thầu không nợ quá hạn và `minhanh` duyệt không ghi lý do duyệt
- **THEN** phiếu Đã duyệt

### Requirement: Số liệu phiếu đã duyệt cho công nợ
Khi duyệt, phiếu SHALL lưu tiền phải thu (tổng − giảm trừ), ngày duyệt (giờ Việt Nam), người duyệt và hạn trả = ngày duyệt + số ngày được nợ của bản hợp đồng tại ngày trả. Hệ thống SHALL không lưu số cộng dồn nào khác; công nợ đọc từ các phiếu Đã duyệt. Quá hạn SHALL là trạng thái tính ra.

#### Scenario: Hạn trả
- **WHEN** bản hợp đồng tại ngày trả cho nợ 15 ngày và `minhanh` duyệt `ĐB-2026-009` ngày 06/11/2026
- **THEN** phiếu lưu ngày duyệt 06/11/2026, hạn trả 21/11/2026 **AND** D8 hiện "Cộng vào công nợ khi duyệt · hạn trả 21/11/2026"

#### Scenario: Hạn trả với 0 ngày nợ
- **WHEN** hợp đồng cho nợ 0 ngày và phiếu được duyệt ngày 06/11/2026
- **THEN** hạn trả là 06/11/2026

### Requirement: Duyệt cùng lúc chỉ một lần
Duyệt, từ chối và sửa SHALL khóa phiếu trước khi kiểm tra. Hai lệnh duyệt hoặc từ chối cùng lúc SHALL chỉ một lệnh thành công; lệnh kia nhận 409.

#### Scenario: Hai tab cùng duyệt
- **WHEN** `minhanh` bấm duyệt `ĐB-2026-009` trên hai tab cùng lúc
- **THEN** đúng một lệnh thành công **AND** chỉ có một dòng nhật ký Duyệt **AND** lệnh kia nhận "Phiếu đền bù đã duyệt, không sửa được nữa."

### Requirement: Quyền với phiếu đền bù
Sửa đơn giá, giảm trừ, duyệt và từ chối SHALL chỉ cho Giám đốc. Xem danh sách và D8 SHALL cần quyền xem hợp đồng thuê (vai trò và phạm vi hợp đồng của tài khoản Kinh doanh). Thủ kho và Xưởng SHALL không xem được phiếu đền bù. Server SHALL kiểm mọi lệnh và trả 403 khi thiếu quyền.

#### Scenario: Kế toán duyệt
- **WHEN** `thuha` (Kế toán) gửi `POST /api/compensations/<id>/approve`
- **THEN** API trả 403 **AND** phiếu vẫn Chờ duyệt

#### Scenario: Kế toán xem D8
- **WHEN** `thuha` mở `/sales/compensations/ĐB-2026-009`
- **THEN** trang hiện các dòng và tổng **AND** không có nút Duyệt, Từ chối, ô giảm trừ

#### Scenario: Thủ kho xem phiếu đền bù
- **WHEN** `vantung` mở `/sales/compensations/ĐB-2026-009`
- **THEN** trang trả 403

### Requirement: Màn D8 Phiếu đền bù
D8 SHALL hiện: thanh "Phiếu đền bù đang chờ bạn duyệt" (Giám đốc, phiếu Chờ duyệt) với nút Từ chối và "Duyệt <tiền phải thu>"; nguồn (nhà thầu, công trình, phiếu thu hồi và ngày trả, người đếm, biển số); bảng hàng hỏng và mất (hàng, tình trạng, số lượng, đơn giá, thành tiền); ghi chú nguồn giá; ảnh hiện trạng; khối giảm trừ; tóm tắt theo tình trạng; công nợ nhà thầu.

#### Scenario: Giám đốc mở phiếu chờ duyệt
- **WHEN** `minhanh` mở D8 của `ĐB-2026-009` tổng 3.915.000 ₫
- **THEN** trang có "Tự tạo từ phiếu thu hồi PTH-2026-071 lúc 05/11/2026 09:40. Duyệt xong mới cộng vào công nợ." **AND** nút "Duyệt 3.915.000 ₫"

#### Scenario: Nút duyệt theo giảm trừ
- **WHEN** `minhanh` nhập giảm 415.000 ₫
- **THEN** nút đổi thành "Duyệt 3.500.000 ₫" **AND** ô "Tiền đền bù" hiện 3.500.000 ₫

#### Scenario: Phiếu đã duyệt
- **WHEN** mở D8 của phiếu Đã duyệt
- **THEN** trang hiện người duyệt, ngày duyệt, giảm trừ, lý do và hạn trả **AND** không còn ô sửa

### Requirement: Danh sách phiếu đền bù
`/sales/compensations` SHALL liệt kê phiếu đền bù mới nhất trước, lọc theo trạng thái (mặc định Chờ duyệt), lưu bộ lọc trên URL. Mỗi dòng SHALL có số phiếu, nhà thầu, công trình, phiếu thu hồi, ngày trả, tiền (tổng hoặc phải thu) và trạng thái. D5 của hợp đồng SHALL liệt kê các phiếu đền bù của hợp đồng.

#### Scenario: Lọc Chờ duyệt
- **WHEN** `minhanh` mở `/sales/compensations`
- **THEN** URL có `?status=PENDING` **AND** danh sách chỉ có phiếu Chờ duyệt

#### Scenario: Trên D5
- **WHEN** mở D5 của `112026/ANPHAT-MINHPHAT`
- **THEN** khối "Đền bù" có dòng "ĐB-2026-009 · PTH-2026-071 · 3.915.000 ₫ · Chờ duyệt"

### Requirement: Nhật ký phiếu đền bù
Mỗi lệnh làm đổi phiếu đền bù (Tạo khi ghi sổ thu hồi, Sửa, Duyệt, Từ chối) SHALL ghi đúng một dòng nhật ký trong cùng transaction. Duyệt có giảm trừ hoặc khi nợ quá hạn SHALL gắn cờ "Có xác nhận bất thường" và ghi lý do. Lưu không đổi trường nào SHALL không ghi.

#### Scenario: Duyệt có giảm trừ
- **WHEN** `minhanh` duyệt `ĐB-2026-009` với giảm 415.000 ₫
- **THEN** nhật ký có đúng một dòng "Duyệt ĐB-2026-009: 3.500.000 ₫ (giảm 415.000 ₫: Khách quen, bớt phần chéo cong)" gắn cờ "Có xác nhận bất thường"
