## ADDED Requirements

### Requirement: Thao tác phiếu thu và thanh lý được ghi
Mỗi lệnh ghi phiếu thu (Tạo), hủy phiếu thu (Hủy) và thanh lý hợp đồng (Thanh lý) SHALL ghi đúng một dòng nhật ký trong cùng transaction. Xem D14, D14b và xuất Excel SHALL không ghi. Lệnh bị từ chối SHALL không ghi.

#### Scenario: Xem và xuất không ghi
- **WHEN** `thuha` mở D14, mở D14b rồi bấm Xuất Excel
- **THEN** nhật ký không có dòng mới

#### Scenario: Hủy bị từ chối không ghi
- **WHEN** lệnh hủy `PT-2026-131` bị từ chối vì thiếu lý do
- **THEN** nhật ký không có dòng mới

### Requirement: Tóm tắt phiếu thu và thanh lý
Tóm tắt Tạo phiếu thu SHALL ghi nhà thầu, loại, số tiền và các khoản đã trừ (hoặc hợp đồng của cọc, hoặc phần trả trước). Tóm tắt Hủy SHALL ghi mã, số tiền, các khoản mở lại và lý do. Tóm tắt Thanh lý SHALL ghi hợp đồng, cọc đã nhận, cấn trừ, hoàn lại.

#### Scenario: Ghi phiếu thu
- **WHEN** `thuha` ghi `PT-2026-132` Trả nợ 30.000.000 ₫ cho Minh Phát
- **THEN** có đúng một dòng Tạo, loại Phiếu thu, tóm tắt "Minh Phát · Trả nợ 30.000.000 ₫ · PX-2026-041 21.500.000 ₫, ĐB-2026-009 4.250.000 ₫, Kỳ 10/2026 082026/ANPHAT-MINHPHAT 4.250.000 ₫"

#### Scenario: Hủy phiếu thu
- **WHEN** `thuha` hủy `PT-2026-131` với lý do "Ghi nhầm nhà thầu"
- **THEN** có đúng một dòng Hủy, tóm tắt "PT-2026-131 · 60.000.000 ₫ · mở lại Kỳ 09/2026 23.100.000 ₫, PX-2026-041 36.900.000 ₫ · lý do: Ghi nhầm nhà thầu"

#### Scenario: Thanh lý
- **WHEN** `thuha` thanh lý `082026/ANPHAT-MINHPHAT` cọc 50.000.000 ₫, cấn trừ 33.900.000 ₫
- **THEN** có đúng một dòng Thanh lý loại Hợp đồng, tóm tắt "082026/ANPHAT-MINHPHAT · cọc 50.000.000 ₫ · cấn trừ 33.900.000 ₫ · hoàn lại 16.100.000 ₫"

### Requirement: Trừ tiền trả trước ghi trong dòng của thao tác
Phần trừ tiền trả trước khi chốt kỳ, duyệt đền bù, duyệt mua lại, ghi sổ xuất bán SHALL ghi vào tóm tắt của chính dòng nhật ký thao tác đó ("· trừ tiền trả trước x ₫"), không thêm dòng.

#### Scenario: Chốt kỳ có trừ trả trước
- **WHEN** `thuha` chốt kỳ 11/2026 của hợp đồng Đông Á phải thu 8.000.000 ₫ và tiền trả trước 5.000.000 ₫ bị trừ
- **THEN** có đúng một dòng Chốt kỳ và tóm tắt kết thúc bằng "· trừ tiền trả trước 5.000.000 ₫"

### Requirement: Loại Phiếu thu và thao tác Thanh lý trên D18
Lọc theo loại chứng từ trên D18 SHALL có "Phiếu thu". Thao tác mới "Thanh lý" SHALL thuộc nhóm "Duyệt, ghi sổ" và tính vào ô Duyệt / ghi sổ.

#### Scenario: Lọc Phiếu thu
- **WHEN** Giám đốc lọc D18 theo loại "Phiếu thu" ngày 05/11/2026
- **THEN** bảng có dòng Tạo `PT-2026-132` và dòng Hủy `PT-2026-131`
