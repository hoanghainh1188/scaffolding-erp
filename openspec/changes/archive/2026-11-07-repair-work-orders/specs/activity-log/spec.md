## ADDED Requirements

### Requirement: Thao tác trên lệnh sửa chữa được ghi
Mỗi bước làm đổi lệnh sửa SHALL ghi đúng một dòng nhật ký trong cùng transaction: Tạo, Sửa, Xóa nháp, Giao xưởng, Thu hồi lệnh, Nhận lệnh, Báo sửa xong, Đếm xong, Trả lại xưởng, Hủy, Ghi sổ. Tóm tắt SHALL không có giá với các bước của Xưởng và Thủ kho; Ghi sổ ghi số về Tốt, phế liệu, công, vật tư và chi phí sửa. Trả lại và Hủy ghi lý do. Gửi lại cùng mã nháp SHALL không ghi thêm dòng.

#### Scenario: Nhận lệnh
- **WHEN** `hoangnam` nhận `PSC-2026-031` trên điện thoại
- **THEN** có một dòng Nhận lệnh `PSC-2026-031` "BAI-01 → XUONG-01 · 60 cái" với thiết bị điện thoại

#### Scenario: Ghi sổ lệnh
- **WHEN** `thuha` ghi sổ `PSC-2026-031` theo ví dụ D12
- **THEN** có một dòng Ghi sổ "56 cái về Tốt, 4 phế liệu · công 1.640.000 ₫, vật tư 585.000 ₫ · chi phí 2.225.000 ₫"

#### Scenario: Đếm khác số xưởng
- **WHEN** `vantung` đếm `GG-K17` sửa xong 35, phế 5 trong khi xưởng báo 36, 4
- **THEN** dòng Đếm xong ghi "GG-K17: xưởng báo 36 / 4, đếm 35 / 5"
