## MODIFIED Requirements

### Requirement: Xác nhận nhập kho ghi sổ kho trong một transaction
Xác nhận nhập kho SHALL trong cùng một transaction: lưu phiếu kèm **hạn trả người bán** (ngày nhập + số ngày được nợ của nhà cung cấp lúc đó, spec `payables`), ghi một dòng `PURCHASE_IN` vào bãi nhập cho mỗi (mã + tình trạng) có số > 0 với ngày nghiệp vụ hôm nay, cập nhật giá vốn bình quân, đổi trạng thái đơn, ghi lịch sử đơn, rồi **trừ tiền ứng trước** của nhà cung cấp vào các khoản còn phải trả (spec `supplier-payments`). Lỗi ở bất kỳ bước nào SHALL làm không ghi gì.

#### Scenario: Dòng sổ của chuyến 1
- **WHEN** chuyến 1 của `PO-2026-052` được xác nhận vào `BAI-01`
- **THEN** sổ kho có 6 dòng `PURCHASE_IN` của chứng từ `PN-2026-094`: `GG-K17` Tốt +150 (31.037.720 ₫), Chờ sửa +34 (7.035.216 ₫), Phế liệu +12 (1.215.000 ₫); `GG-CH` Tốt +380 (13.175.436 ₫), Chờ sửa +20 (693.444 ₫); `PL-SAT` Phế liệu +1.250,5 kg (10.161.934 ₫)

#### Scenario: Giá vốn bình quân sau phiếu
- **WHEN** `GG-K17` Tốt tổng tồn 1.220 cái giá BQ 195.000 ₫ và phiếu nhập 150 cái Tốt giá trị 31.037.720 ₫
- **THEN** giá BQ mới = (1.220 × 195.000 + 31.037.720) ÷ 1.370 = 196.304,9 → 196.305 ₫

#### Scenario: Lỗi sổ kho làm hỏng cả phiếu
- **WHEN** `GG-CH` vừa bị ngừng dùng trước khi phiếu được ghi
- **THEN** hệ thống từ chối với "Vật tư GG-CH đã ngừng dùng" **AND** không có phiếu, dòng sổ, đổi trạng thái đơn hay dòng trừ ứng trước nào

#### Scenario: Dòng chuyến này không có không ghi sổ
- **WHEN** Mâm là "Chuyến này không có"
- **THEN** sổ kho không có dòng nào của `GG-M16` cho phiếu đó

#### Scenario: Lưu hạn trả theo người bán
- **WHEN** nhà cung cấp của `PO-2026-052` được nợ 15 ngày và chuyến 1 được xác nhận ngày 27/10/2026
- **THEN** `PN-2026-094` lưu hạn trả 11/11/2026

#### Scenario: Ghi sổ trừ tiền ứng trước
- **WHEN** nhà cung cấp có tiền ứng trước 10.000.000 ₫ và chuyến được xác nhận với tiền hàng 6.400.000 ₫
- **THEN** cùng transaction có dòng trừ 6.400.000 ₫ từ phiếu chi ứng trước vào phiếu nhập mới **AND** M3 không hiện số tiền nào

## ADDED Requirements

### Requirement: Phiếu nhập đã ghi sổ không sửa được
Phiếu nhập, dòng phiếu nhập và chi phí chuyến đã ghi SHALL không sửa, không xóa được, kể cả khi role app ghi thẳng vào cơ sở dữ liệu (chỉ ghi thêm), vì sổ kho và khoản phải trả người bán tính từ chúng. Sai sót số tiền sửa bằng phiếu điều chỉnh giá trị (giá vốn) hoặc phiếu chi (phải trả), không sửa phiếu.

#### Scenario: Sửa số thực nhận bị chặn
- **WHEN** role app chạy `UPDATE goods_receipt_line SET quantity = 1` cho một dòng của `PN-2026-090`
- **THEN** PostgreSQL từ chối với mã `42501` **AND** khoản `PN-2026-090` vẫn phát sinh 26.500.000 ₫

#### Scenario: Xóa phiếu nhập bị chặn
- **WHEN** role app chạy `DELETE FROM goods_receipt WHERE code = 'PN-2026-090'`
- **THEN** PostgreSQL từ chối với mã `42501`
