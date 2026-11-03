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

### Requirement: Dòng vào tình trạng chưa từng có giá
Khi một dòng không làm đổi giá (thu hồi, điều chỉnh, chuyển) vào một (mã hàng + tình trạng) chưa từng có dòng sổ nào, đơn giá ghi sổ SHALL lấy bằng đơn giá của dòng ra đi cùng trong chứng từ; riêng thu hồi về Phế liệu SHALL lấy min(kg quy đổi × giá sắt vụn tham khảo lúc ghi sổ, đơn giá dòng ra), làm tròn 1 ₫. Không có dòng ra đi cùng (điều chỉnh tăng) thì người lập SHALL nhập đơn giá. Dòng đó SHALL đặt giá BQ đầu tiên.

#### Scenario: Thu hồi phế liệu lần đầu
- **WHEN** `GG-K15` (13,6 kg/cái) chưa từng có tình trạng Phế liệu, giá sắt vụn tham khảo 7.500 ₫/kg, và thu hồi 3 cái từ công trình (Tốt, giá BQ 167.000 ₫) về bãi là Phế liệu
- **THEN** dòng `RETURN_IN` +3 Phế liệu ghi 102.000 ₫/cái (13,6 × 7.500) **AND** giá BQ Phế liệu của `GG-K15` là 102.000 ₫

#### Scenario: Giá sắt vụn cao hơn giá dòng ra
- **WHEN** `TY-REN` (2 kg/cái) chưa từng có Phế liệu, giá sắt vụn 7.500 ₫/kg, và thu hồi 5 cái Tốt giá BQ 12.000 ₫ về là Phế liệu
- **THEN** dòng `RETURN_IN` ghi 12.000 ₫/cái (không quá giá dòng ra)

#### Scenario: Chưa có giá sắt vụn
- **WHEN** `GG-K15` chưa từng có Phế liệu, chưa có giá sắt vụn tham khảo, và phiếu thu hồi có 3 cái Phế liệu
- **THEN** hệ thống từ chối với "Chưa có đơn giá sắt vụn tham chiếu. Vui lòng cập nhật đơn giá trong Cài đặt." **AND** không có dòng sổ nào

#### Scenario: Phế liệu đã có giá BQ
- **WHEN** `GG-K15` Phế liệu đã có giá BQ 95.000 ₫ và thu hồi 3 cái về là Phế liệu
- **THEN** dòng `RETURN_IN` ghi 95.000 ₫/cái, không dùng giá sắt vụn

#### Scenario: Điều chỉnh tăng khi chưa có giá
- **WHEN** điều chỉnh tăng 20 cái `GG-K15` Mới khi mã này chưa từng có tình trạng Mới và không nhập đơn giá
- **THEN** hệ thống từ chối với "GG-K15 Mới chưa có giá vốn, nhập đơn giá"
