## ADDED Requirements

### Requirement: Thao tác trên định mức sản xuất được ghi
Tạo, Sửa, Xóa định mức và Sửa Mã sắt vụn SHALL ghi đúng một dòng nhật ký trong cùng transaction, loại chứng từ "Định mức sản xuất" trên D18. Sửa chỉ ghi trường thật sự đổi: nguyên liệu thêm, bỏ, đổi số / 1 cái, đơn giá công. Lưu mà không đổi gì SHALL không ghi.

#### Scenario: Sửa định mức
- **WHEN** `thuha` sửa định mức `GG-K17`: `VT-ONG27` 3,6 → 3,8 kg / cái, công 35.000 → 36.000 ₫
- **THEN** có một dòng Sửa, loại Định mức sản xuất, mã `GG-K17`, ghi "VT-ONG27: 3,6 → 3,8 kg / cái; công: 35.000 ₫ → 36.000 ₫"

#### Scenario: Lưu không đổi gì
- **WHEN** `thuha` mở định mức `GG-K17` rồi bấm Lưu không sửa gì
- **THEN** không có dòng nhật ký mới

### Requirement: Thao tác trên lệnh sản xuất được ghi
Mỗi bước làm đổi lệnh sản xuất SHALL ghi đúng một dòng nhật ký trong cùng transaction, loại chứng từ "Lệnh sản xuất": Tạo, Sửa, Xóa nháp, Giao xưởng, Thu hồi lệnh, Nhận lệnh, Báo làm xong, Đếm xong, Duyệt vượt định mức, Trả lại xưởng, Hủy, Ghi sổ. Tóm tắt các bước của Xưởng và Thủ kho SHALL không có giá. Ghi sổ ghi thành phẩm, đầu thừa, nguyên liệu, công, giá trị. Duyệt, Trả lại, Hủy ghi ghi chú hoặc lý do. Gửi lại cùng mã nháp SHALL không ghi thêm dòng.

#### Scenario: Đếm khác số xưởng
- **WHEN** `vantung` đếm `GG-K17` 100 cái trong khi xưởng báo 102
- **THEN** dòng Đếm xong `LSX-2026-004` ghi "GG-K17: xưởng báo 102, đếm 100" và không có số tiền

#### Scenario: Duyệt vượt định mức
- **WHEN** `minhanh` duyệt `LSX-2026-004` với ghi chú "Ống D27 lô mới cong, chấp nhận"
- **THEN** có một dòng Duyệt vượt định mức ghi "VT-ONG27 (GG-K17) + 8,6 % · Ống D27 lô mới cong, chấp nhận"

#### Scenario: Ghi sổ lệnh
- **WHEN** `thuha` ghi sổ `LSX-2026-004` theo ví dụ D20
- **THEN** có một dòng Ghi sổ "300 cái Mới về BAI-01, 47 kg phế liệu · nguyên liệu 41.119.500 ₫, công 5.100.000 ₫ · thành phẩm 45.867.000 ₫"

#### Scenario: Ghi sổ bị từ chối không ghi nhật ký
- **WHEN** ghi sổ `LSX-2026-004` bị từ chối vì thiếu `VT-ONG27` ở xưởng
- **THEN** không có dòng nhật ký Ghi sổ nào
