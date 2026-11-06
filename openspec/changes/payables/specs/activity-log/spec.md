## ADDED Requirements

### Requirement: Thao tác phiếu chi được ghi
Mỗi lệnh ghi phiếu chi (Tạo) và hủy phiếu chi (Hủy) SHALL ghi đúng một dòng nhật ký loại **Phiếu chi** trong cùng transaction. Tóm tắt Tạo SHALL ghi người bán, loại, số tiền và các phiếu nhập đã trừ (hoặc phần ứng trước). Tóm tắt Hủy SHALL ghi mã, số tiền, các khoản mở lại và lý do. Xem D14c, xem trước phiếu chi và xuất Excel SHALL không ghi. Lệnh bị từ chối SHALL không ghi.

#### Scenario: Ghi phiếu chi
- **WHEN** `thuha` ghi `PC-2026-045` Trả tiền hàng 30.000.000 ₫ cho Anh Tâm
- **THEN** có đúng một dòng Tạo, loại Phiếu chi, tóm tắt "Anh Lê Văn Tâm · Trả tiền hàng 30.000.000 ₫ · PN-2026-090 26.500.000 ₫, PN-2026-091 3.500.000 ₫"

#### Scenario: Ghi phiếu ứng trước
- **WHEN** `thuha` ghi `PC-2026-040` Ứng trước 10.000.000 ₫ cho Chị Hoa
- **THEN** tóm tắt là "Chị Nguyễn Thị Hoa · Ứng trước 10.000.000 ₫ · giữ làm tiền ứng trước 10.000.000 ₫"

#### Scenario: Hủy phiếu chi
- **WHEN** `thuha` hủy `PC-2026-044` với lý do "Ghi nhầm số tiền"
- **THEN** có đúng một dòng Hủy, tóm tắt "PC-2026-044 · 38.000.000 ₫ · mở lại PN-2026-087 38.000.000 ₫ · lý do: Ghi nhầm số tiền"

#### Scenario: Xem và xuất không ghi
- **WHEN** `thuha` mở D14c, xem trước một phiếu chi rồi bấm Xuất Excel
- **THEN** nhật ký không có dòng mới

### Requirement: Trừ tiền ứng trước ghi trong dòng phiếu nhập
Phần trừ tiền ứng trước khi ghi sổ phiếu nhập SHALL ghi vào tóm tắt của chính dòng nhật ký ghi sổ phiếu nhập ("· trừ tiền ứng trước x ₫"), không thêm dòng.

#### Scenario: Ghi sổ có trừ ứng trước
- **WHEN** `vantung` ghi sổ `PN-2026-093` của Chị Hoa và 6.400.000 ₫ tiền ứng trước bị trừ
- **THEN** có đúng một dòng ghi sổ phiếu nhập và tóm tắt kết thúc bằng "· trừ tiền ứng trước 6.400.000 ₫"

### Requirement: Loại Phiếu chi trên D18
Lọc theo loại chứng từ trên D18 SHALL có "Phiếu chi".

#### Scenario: Lọc Phiếu chi
- **WHEN** Giám đốc lọc D18 theo loại "Phiếu chi" ngày 06/11/2026
- **THEN** bảng có dòng Tạo `PC-2026-045` và dòng Hủy `PC-2026-044`
