## MODIFIED Requirements

### Requirement: Các loại biến động
Mỗi dòng sổ SHALL thuộc một loại biến động: `OPENING` (tồn đầu kỳ), `PURCHASE_IN` (nhập mua), `REPAIR_OUT` / `REPAIR_IN` (ra khỏi Chờ sửa để sửa / nhập sau sửa), `DELIVERY_OUT` / `DELIVERY_IN` (bãi → công trình), `RETURN_OUT` / `RETURN_IN` (công trình → bãi), `LOSS_OUT` (hàng mất ở công trình), `TRANSFER_OUT` / `TRANSFER_IN` (chuyển vị trí khác), `SALE_OUT` (bán), `ADJUST_OUT` / `ADJUST_IN` (điều chỉnh), `REVALUE` (điều chỉnh giá trị). Loại `..._IN` và `OPENING` SHALL có số lượng dương, `..._OUT` số lượng âm, `REVALUE` số lượng 0.

#### Scenario: Loại biến động sai dấu
- **WHEN** một chứng từ ghi `PURCHASE_IN` với số lượng −5
- **THEN** hệ thống từ chối với "Dòng nhập phải có số lượng dương"

#### Scenario: Điều chỉnh giá không đổi tồn
- **WHEN** ghi dòng `REVALUE` cho `GG-K17` Tốt đang tồn 920 cái tại `BAI-01` và 300 cái tại `CT-0003`
- **THEN** tồn tại `BAI-01` vẫn 920 **AND** tồn tại `CT-0003` vẫn 300 **AND** tổng tồn vẫn 1.220

#### Scenario: Hàng mất ở công trình
- **WHEN** phiếu thu hồi ghi `LOSS_OUT` −2 `H1,7` Tốt tại `CT-0003` khi giá BQ `H1,7` Tốt là 400.000 ₫
- **THEN** tồn `H1,7` Tốt tại `CT-0003` giảm 2 **AND** dòng có giá trị −800.000 ₫ **AND** giá BQ `H1,7` Tốt vẫn 400.000 ₫

#### Scenario: Hàng mất số lượng dương
- **WHEN** một chứng từ ghi `LOSS_OUT` với số lượng +2
- **THEN** hệ thống từ chối với "Dòng xuất phải có số lượng âm"
