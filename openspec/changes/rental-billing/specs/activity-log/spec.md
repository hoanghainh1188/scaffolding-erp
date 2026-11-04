## ADDED Requirements

### Requirement: Thao tác tính tiền thuê và ngày nghỉ được ghi
Mỗi lệnh chốt kỳ tiền thuê (Chốt kỳ), tạo / sửa / xóa dòng điều chỉnh, tạo / sửa / xóa ngày nghỉ SHALL ghi đúng một dòng nhật ký trong cùng transaction. Tính, xem, in, xuất Excel SHALL không ghi nhật ký. Lệnh bị từ chối SHALL không ghi. Tóm tắt Chốt kỳ SHALL ghi kỳ, số dòng và phải thu; tóm tắt dòng điều chỉnh SHALL ghi kỳ được điều chỉnh, số tiền và lý do. Tạo hoặc sửa dòng điều chỉnh có số tiền âm SHALL gắn cờ "Có xác nhận bất thường" (0.2 #80).

#### Scenario: Chốt kỳ ghi một dòng
- **WHEN** `thuha` chốt kỳ 02/2027 của `102026/ANPHAT-MINHPHAT` có 8 dòng bảng kê, phải thu 7.283.304 ₫
- **THEN** có đúng một dòng Chốt kỳ "102026/ANPHAT-MINHPHAT · kỳ 02/2027 · 8 dòng · phải thu 7.283.304 ₫"

#### Scenario: Ghi dòng điều chỉnh
- **WHEN** `thuha` ghi dòng điều chỉnh 93.000 ₫ cho kỳ 01/2027 vào kỳ 02/2027
- **THEN** có đúng một dòng Tạo với tóm tắt "Điều chỉnh kỳ 01/2027 · 93.000 ₫ · Kỳ 01 thiếu 10 CHEO1,7 × 31 ngày (giao 31/12 chưa ghi)"

#### Scenario: Khoản điều chỉnh âm gắn cờ
- **WHEN** `thuha` ghi dòng điều chỉnh −50.000 ₫ cho kỳ 01/2027 vào kỳ 02/2027
- **THEN** dòng nhật ký Tạo gắn cờ "Có xác nhận bất thường" **AND** Giám đốc thấy dòng đó khi lọc "Cần xem kỹ" trên D18

#### Scenario: Sửa ngày nghỉ
- **WHEN** Giám đốc sửa "Tết Nguyên đán" từ 05/02 – 13/02/2027 thành 06/02 – 14/02/2027
- **THEN** có đúng một dòng Sửa ngày nghỉ ghi trường đổi "Từ ngày 05/02/2027 → 06/02/2027", "Đến ngày 13/02/2027 → 14/02/2027"

#### Scenario: Chốt bị từ chối không ghi
- **WHEN** lệnh chốt kỳ 02/2027 bị từ chối vì kỳ 01/2027 chưa chốt
- **THEN** nhật ký không có dòng mới

#### Scenario: Xem và xuất Excel không ghi
- **WHEN** `thuha` mở D7 kỳ 02/2027 rồi bấm Xuất Excel
- **THEN** nhật ký không có dòng mới

### Requirement: Loại chứng từ và thao tác Chốt kỳ trên D18
Lọc theo loại chứng từ trên D18 SHALL có Kỳ tiền thuê, Điều chỉnh tiền thuê và Ngày nghỉ. Thao tác mới "Chốt kỳ" SHALL thuộc nhóm "Duyệt, ghi sổ" và tính vào ô Duyệt / ghi sổ.

#### Scenario: Lọc nhóm Duyệt, ghi sổ
- **WHEN** Giám đốc lọc D18 theo nhóm "Duyệt, ghi sổ" ngày 02/03/2027
- **THEN** bảng có dòng Chốt kỳ của `102026/ANPHAT-MINHPHAT` **AND** ô Duyệt / ghi sổ đếm cả dòng đó
