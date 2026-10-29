## MODIFIED Requirements

### Requirement: Nội dung một dòng sổ kho
Mỗi dòng sổ kho SHALL ghi: mã hàng, tình trạng (`NEW`, `GOOD`, `NEEDS_REPAIR`, `SCRAP`), vị trí, số lượng có dấu (dương là vào, âm là ra, khác 0), đơn giá ghi sổ, giá vốn bình quân của (mã hàng + tình trạng) sau dòng, loại biến động, chứng từ gốc (loại, mã, diễn giải), ngày nghiệp vụ, người ghi, thời điểm ghi. Riêng dòng `REVALUE` SHALL có số lượng **0** và **không có vị trí**; mọi loại khác SHALL có vị trí và số lượng khác 0.

#### Scenario: Dòng số lượng 0
- **WHEN** một chứng từ ghi dòng 0 cái `GG-CH` loại `ADJUST_IN`
- **THEN** hệ thống từ chối với "Số lượng ghi sổ phải khác 0" **AND** không dòng nào của chứng từ được ghi

#### Scenario: Dòng điều chỉnh giá có số lượng
- **WHEN** một chứng từ ghi dòng `REVALUE` 5 cái `GG-CH` Tốt
- **THEN** hệ thống từ chối với "Dòng điều chỉnh giá không có số lượng"

#### Scenario: Dòng thường thiếu vị trí
- **WHEN** chạy SQL chèn dòng `ADJUST_IN` +5 `GG-CH` Tốt không có vị trí
- **THEN** DB từ chối dòng đó

### Requirement: Các loại biến động
Mỗi dòng sổ SHALL thuộc một loại biến động: `OPENING` (tồn đầu kỳ), `PURCHASE_IN` (nhập mua), `REPAIR_OUT` / `REPAIR_IN` (ra khỏi Chờ sửa để sửa / nhập sau sửa), `DELIVERY_OUT` / `DELIVERY_IN` (bãi → công trình), `RETURN_OUT` / `RETURN_IN` (công trình → bãi), `TRANSFER_OUT` / `TRANSFER_IN` (chuyển vị trí khác), `SALE_OUT` (bán), `ADJUST_OUT` / `ADJUST_IN` (điều chỉnh), `REVALUE` (điều chỉnh giá trị). Loại `..._IN` và `OPENING` SHALL có số lượng dương, `..._OUT` số lượng âm, `REVALUE` số lượng 0.

#### Scenario: Loại biến động sai dấu
- **WHEN** một chứng từ ghi `PURCHASE_IN` với số lượng −5
- **THEN** hệ thống từ chối với "Dòng nhập phải có số lượng dương"

#### Scenario: Điều chỉnh giá không đổi tồn
- **WHEN** ghi dòng `REVALUE` cho `GG-K17` Tốt đang tồn 920 cái tại `BAI-01` và 300 cái tại `CT-0003`
- **THEN** tồn tại `BAI-01` vẫn 920 **AND** tồn tại `CT-0003` vẫn 300 **AND** tổng tồn vẫn 1.220

### Requirement: Chỉ nhập mua, nhập sau sửa, tồn đầu kỳ làm đổi giá vốn
Chỉ dòng `OPENING`, `PURCHASE_IN`, `REPAIR_IN`, `REVALUE` SHALL làm đổi giá vốn bình quân, và người ghi SHALL đưa giá trị của dòng (VND, số nguyên): tổng giá trị (không âm) với ba loại nhập, chênh lệch có dấu (khác 0) với `REVALUE`. Dòng `REVALUE` SHALL đặt giá BQ sau = (tồn × giá BQ trước + chênh lệch) ÷ tồn, làm tròn như luật giá BQ; SHALL bị từ chối khi tổng tồn của (mã hàng + tình trạng) bằng 0 hoặc giá trị sau âm. Mọi loại khác SHALL ghi theo giá vốn bình quân hiện tại của (mã hàng + tình trạng) của chính dòng đó, nên không làm đổi giá vốn bình quân.

#### Scenario: Xuất cho công trình không đổi giá vốn
- **WHEN** `GG-K17` Tốt có giá vốn BQ 195.000 ₫ và phiếu `PX-2026-118` xuất 300 cái từ `BAI-01` tới công trình `CT-0003`
- **THEN** sổ có 2 dòng: `DELIVERY_OUT` −300 tại `BAI-01` và `DELIVERY_IN` +300 tại `CT-0003`, cả hai đơn giá 195.000 ₫ **AND** giá vốn BQ sau vẫn là 195.000 ₫

#### Scenario: Chuyển chỗ không đổi giá BQ và tổng giá trị
- **WHEN** `GG-K17` Tốt tổng tồn 3.420 cái giá BQ 195.282 ₫ (tổng giá trị 667.864.440 ₫), rồi lần lượt xuất 120 cái cho công trình, thu hồi 40 cái về bãi, chuyển 30 cái bãi → xưởng, xuất 200 cái
- **THEN** sau mỗi bước giá BQ vẫn 195.282 ₫ **AND** tổng tồn vẫn 3.420 **AND** tổng giá trị vẫn 667.864.440 ₫

#### Scenario: Thu hồi sang tình trạng khác
- **WHEN** thu hồi 10 cái `GG-K17` từ công trình đang ở tình trạng Tốt (giá BQ 195.282 ₫) về bãi ở tình trạng Chờ sửa (giá BQ 160.000 ₫)
- **THEN** dòng `RETURN_OUT` −10 Tốt ghi 195.282 ₫ **AND** dòng `RETURN_IN` +10 Chờ sửa ghi 160.000 ₫ **AND** giá BQ của Tốt và Chờ sửa đều không đổi

#### Scenario: Dòng điều chỉnh giá đổi giá BQ
- **WHEN** `GG-K17` Tốt tổng tồn 1.220 cái giá BQ 195.000 ₫ và ghi dòng `REVALUE` +610.000 ₫
- **THEN** dòng có số lượng 0, giá trị +610.000 ₫, giá BQ sau **195.500 ₫**, tồn sau 1.220 **AND** giá BQ hiện tại của `GG-K17` Tốt là 195.500 ₫

#### Scenario: Điều chỉnh giá khi tồn bằng 0
- **WHEN** `PK-KU` Mới tồn 0 và một chứng từ ghi dòng `REVALUE` +300.000 ₫
- **THEN** hệ thống từ chối với "PK-KU Mới đã hết hàng, không điều chỉnh giá trị được" **AND** không dòng nào của chứng từ được ghi

#### Scenario: Điều chỉnh giá làm giá trị âm
- **WHEN** `GG-K17` Phế liệu tồn 42 cái giá BQ 160.000 ₫ và một chứng từ ghi dòng `REVALUE` −7.000.000 ₫
- **THEN** hệ thống từ chối với "Giá trị sau điều chỉnh của GG-K17 Phế liệu bị âm (−280.000 ₫)"

### Requirement: Đối chiếu giá vốn hiện tại với sổ kho
Giá vốn BQ hiện tại lưu riêng để khóa và đọc nhanh SHALL luôn khớp sổ kho: tổng số lượng bằng tổng các dòng của (mã hàng + tình trạng), giá BQ bằng giá BQ sau của dòng cuối (kể cả khi dòng cuối là `REVALUE`). Lệnh `npm run inventory:check` SHALL liệt kê mọi (mã hàng + tình trạng) bị lệch và thoát với mã lỗi khác 0 nếu có lệch.

#### Scenario: Không lệch
- **WHEN** chạy `npm run inventory:check` sau chuỗi ghi sổ mẫu của thẻ kho `GG-K17`
- **THEN** lệnh in "Sổ kho khớp: 0 lệch" và thoát mã 0

#### Scenario: Không lệch sau điều chỉnh giá
- **WHEN** chạy `npm run inventory:check` ngay sau khi ghi dòng `REVALUE` đưa `GG-K17` Tốt từ 195.282 ₫ về 194.072 ₫
- **THEN** lệnh in "Sổ kho khớp: 0 lệch" và thoát mã 0

#### Scenario: Có lệch
- **WHEN** bảng giá vốn hiện tại của `GG-K17` Tốt bị sửa tay thành 196.000 ₫ trong khi dòng sổ cuối ghi 195.282 ₫
- **THEN** lệnh in dòng "GG-K17 Tốt: giá BQ 196.000 ₫, sổ kho 195.282 ₫" và thoát mã 1
