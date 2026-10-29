## MODIFIED Requirements

### Requirement: Thẻ kho D11
Trang `/inventory/items/<mã>` SHALL hiện tên, mã, đơn vị và bảng sổ trong kỳ: dòng đầu "Tồn đầu kỳ", rồi từng dòng sổ theo ngày nghiệp vụ và thứ tự ghi với các cột Ngày, Chứng từ (phiếu điều chỉnh có nhãn "Điều chỉnh", phiếu điều chỉnh giá trị có nhãn "Điều chỉnh giá"), Diễn giải, Nhập, Xuất, Tồn (cộng dồn theo bộ lọc), Đơn giá ghi sổ, Giá vốn BQ sau; dòng cuối "Cộng phát sinh trong kỳ". Dòng `REVALUE` (không có vị trí) SHALL hiện ở **mọi** bộ lọc vị trí khi chọn đúng tình trạng của nó: Nhập, Xuất trống, Tồn không đổi, Đơn giá ghi sổ trống, Diễn giải ghi chênh lệch giá trị và chứng từ gốc, Giá vốn BQ sau là giá mới. Chân bảng ghi "Sổ kho chỉ ghi thêm, không sửa dòng cũ. Phiếu ghi sai thì làm phiếu điều chỉnh."

#### Scenario: Thẻ kho GG-K17 Tốt tại bãi tháng 10
- **WHEN** mở thẻ kho `GG-K17`, Tốt, Tại bãi, kỳ 01/10/2026–31/10/2026 với số liệu mẫu ở design D11
- **THEN** Tồn đầu kỳ 1.220, Nhập +450, Xuất −430, Tồn cuối 1.240 **AND** giá vốn BQ hiện tại 195.282 ₫ **AND** các dòng theo thứ tự: 03/10 `PX-2026-118` xuất 300, tồn 920, 195.000 ₫ → 195.000 ₫; 08/10 `PN-2026-087` nhập 160, tồn 1.080, 196.155 ₫ → 195.055 ₫; 12/10 `PSC-2026-021` nhập 40, tồn 1.120, 214.500 ₫ → 195.282 ₫; 15/10 `PTH-2026-064` nhập 210, tồn 1.330; 16/10 `ĐC-2026-004` xuất 10, tồn 1.320; 20/10 `PX-2026-131` xuất 120, tồn 1.200; 22/10 `PTH-2026-069` nhập 40, tồn 1.240 (các dòng từ 15/10 đều 195.282 ₫)

#### Scenario: Đơn giá ghi sổ của dòng nhập
- **WHEN** dòng `PN-2026-087` nhập 160 cái tổng giá trị 31.384.800 ₫
- **THEN** cột Đơn giá ghi sổ hiện 196.155 ₫ (giá trị ÷ số lượng, làm tròn đến 1 ₫)

#### Scenario: Mã không tồn tại
- **WHEN** mở `/inventory/items/KHONG-CO`
- **THEN** trang 404 "Không tìm thấy mã hàng"

#### Scenario: Dòng điều chỉnh giá trên thẻ kho
- **WHEN** `ĐCG-2026-001` (sửa `PN-2026-094`) ghi sổ ngày 30/10/2026 giảm 1.500.000 ₫ cho `GG-K17` Tốt khi giá BQ 195.282 ₫, tổng tồn 1.240 cái (cả 1.240 ở bãi)
- **THEN** thẻ kho `GG-K17`, Tốt, Tại bãi có dòng 30/10 `ĐCG-2026-001` nhãn "Điều chỉnh giá", diễn giải "Giảm giá trị 1.500.000 ₫ · sửa PN-2026-094", Nhập và Xuất trống, Tồn 1.240, Giá vốn BQ sau 194.072 ₫ **AND** thẻ kho cùng mã lọc Tại công trình cũng có dòng đó

#### Scenario: Chọn tất cả tình trạng
- **WHEN** mở thẻ kho `GG-K17` với tình trạng "Tất cả" sau khi có dòng điều chỉnh giá
- **THEN** dòng điều chỉnh giá vẫn hiện **AND** hai cột giá ẩn như các dòng khác
