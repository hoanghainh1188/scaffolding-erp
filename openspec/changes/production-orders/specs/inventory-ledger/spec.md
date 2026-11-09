## MODIFIED Requirements

### Requirement: Các loại biến động
Mỗi dòng sổ SHALL thuộc một loại biến động: `OPENING` (tồn đầu kỳ), `PURCHASE_IN` (nhập mua), `REPAIR_OUT` / `REPAIR_IN` (sửa chữa), `PRODUCTION_OUT` / `PRODUCTION_IN` (sản xuất: xuất nguyên liệu, nhập thành phẩm và đầu thừa), `DELIVERY_OUT` / `DELIVERY_IN` (bãi → công trình), `RETURN_OUT` / `RETURN_IN` (công trình → bãi), `LOSS_OUT` (hàng mất ở công trình), `TRANSFER_OUT` / `TRANSFER_IN` (chuyển vị trí), `SALE_OUT` (bán), `ADJUST_OUT` / `ADJUST_IN` (điều chỉnh), `REVALUE` (điều chỉnh giá trị). Dòng `..._IN` và `OPENING` SHALL có số lượng dương; `..._OUT` âm; `REVALUE` bằng 0.

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

#### Scenario: Xuất nguyên liệu sản xuất
- **WHEN** lệnh sản xuất ghi `PRODUCTION_OUT` −391 kg `VT-ONG27` Mới tại `XUONG-01` khi giá BQ là 19.000 ₫/kg
- **THEN** tồn `VT-ONG27` Mới tại `XUONG-01` giảm 391 kg **AND** dòng có giá trị −7.429.000 ₫ **AND** giá BQ vẫn 19.000 ₫/kg

#### Scenario: Nhập thành phẩm sai dấu
- **WHEN** một chứng từ ghi `PRODUCTION_IN` với số lượng −100
- **THEN** hệ thống từ chối với "Dòng nhập phải có số lượng dương"

### Requirement: Chỉ nhập mua, nhập sau sửa, tồn đầu kỳ làm đổi giá vốn
Chỉ dòng `OPENING`, `PURCHASE_IN`, `REPAIR_IN`, `PRODUCTION_IN`, `REVALUE` SHALL làm đổi giá vốn bình quân. Người ghi SHALL đưa giá trị của dòng (VND, số nguyên): tổng giá trị (không âm) với bốn loại nhập, chênh lệch có dấu (khác 0) với `REVALUE`. Mọi loại khác SHALL ghi theo giá vốn bình quân hiện tại của (mã hàng + tình trạng) của chính dòng đó, nên không làm đổi giá vốn bình quân.

#### Scenario: Xuất cho công trình không đổi giá vốn
- **WHEN** `GG-K17` Tốt có giá vốn BQ 195.000 ₫ và phiếu `PX-2026-118` xuất 300 cái từ `BAI-01` tới công trình `CT-0003`
- **THEN** sổ có 2 dòng: `DELIVERY_OUT` −300 tại `BAI-01` và `DELIVERY_IN` +300 tại `CT-0003`, cả hai đơn giá 195.000 ₫ **AND** giá vốn BQ sau vẫn là 195.000 ₫

#### Scenario: Chuyển chỗ không đổi giá BQ và tổng giá trị
- **WHEN** `GG-K17` Tốt tổng tồn 3.420 cái giá BQ 195.282 ₫ (tổng giá trị 667.864.440 ₫), rồi lần lượt xuất 120 cái cho công trình, thu hồi 40 cái về bãi, chuyển 30 cái bãi → xưởng, xuất 200 cái
- **THEN** sau mỗi bước giá BQ vẫn 195.282 ₫ **AND** tổng tồn vẫn 3.420 **AND** tổng giá trị vẫn 667.864.440 ₫

#### Scenario: Thu hồi sang tình trạng khác
- **WHEN** thu hồi 10 cái `GG-K17` từ công trình đang ở tình trạng Tốt (giá BQ 195.282 ₫) về bãi ở tình trạng Chờ sửa (giá BQ 160.000 ₫)
- **THEN** dòng `RETURN_OUT` −10 Tốt ghi 195.282 ₫ **AND** dòng `RETURN_IN` +10 Chờ sửa ghi 160.000 ₫ **AND** giá BQ của Tốt và Chờ sửa đều không đổi

#### Scenario: Thành phẩm sản xuất đổi giá BQ Mới
- **WHEN** `GG-K17` Mới đang tồn 200 cái giá BQ 340.000 ₫ (68.000.000 ₫), rồi lệnh sản xuất ghi `PRODUCTION_IN` +100 `GG-K17` Mới giá trị 32.660.500 ₫
- **THEN** tồn `GG-K17` Mới là 300 cái **AND** giá BQ mới là (68.000.000 + 32.660.500) ÷ 300 = 335.535 ₫ (làm tròn đến 1 ₫)

#### Scenario: Giá trị nhập không chia hết số lượng
- **WHEN** lệnh sản xuất ghi `PRODUCTION_IN` +200 `GG-CH` Mới giá trị 13.206.500 ₫ khi `GG-CH` Mới đang tồn 0
- **THEN** dòng sổ giữ đúng giá trị 13.206.500 ₫ **AND** đơn giá hiện 66.033 ₫ **AND** giá BQ `GG-CH` Mới là 66.033 ₫
