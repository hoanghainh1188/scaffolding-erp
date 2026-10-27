# inventory-ledger Specification

## Purpose
Sổ kho chỉ ghi thêm là nguồn duy nhất của tồn kho và giá vốn: mọi biến động hàng (nhập, xuất, thu hồi, sửa, điều chỉnh, tồn đầu kỳ) ghi thành dòng, tồn theo vị trí và giá vốn bình quân theo (mã hàng + tình trạng) tính từ các dòng đó.

## Requirements

### Requirement: Sổ kho chỉ ghi thêm
DB SHALL từ chối mọi lệnh UPDATE, DELETE, TRUNCATE trên sổ kho với thông báo "Sổ kho chỉ ghi thêm, sai thì lập phiếu điều chỉnh". Mã hàng và vị trí đã có dòng sổ SHALL không xóa được (khóa ngoại `ON DELETE RESTRICT`).

#### Scenario: Sửa dòng sổ bằng SQL
- **WHEN** chạy `UPDATE inventory_ledger SET quantity = 200` trên dòng nhập 160 cái `GG-K17` của `PN-2026-087`
- **THEN** DB báo lỗi "Sổ kho chỉ ghi thêm, sai thì lập phiếu điều chỉnh" **AND** dòng vẫn là 160 cái

#### Scenario: Xóa dòng sổ
- **WHEN** chạy `DELETE` hoặc `TRUNCATE` trên `inventory_ledger`
- **THEN** DB báo cùng lỗi đó **AND** số dòng sổ không đổi

#### Scenario: Xóa mã hàng đã có giao dịch
- **WHEN** Kinh doanh xóa `GG-K17` đã có dòng sổ kho
- **THEN** hệ thống từ chối với "Vật tư đã được dùng nên chỉ ngừng dùng được"

### Requirement: Nội dung một dòng sổ kho
Mỗi dòng sổ kho SHALL ghi: mã hàng, tình trạng (`NEW`, `GOOD`, `NEEDS_REPAIR`, `SCRAP`), vị trí, số lượng có dấu (dương là vào, âm là ra, khác 0), đơn giá ghi sổ, giá vốn bình quân của (mã hàng + tình trạng) sau dòng, loại biến động, chứng từ gốc (loại, mã, diễn giải), ngày nghiệp vụ, người ghi, thời điểm ghi.

#### Scenario: Dòng số lượng 0
- **WHEN** một chứng từ ghi dòng 0 cái `GG-CH`
- **THEN** hệ thống từ chối với "Số lượng ghi sổ phải khác 0" **AND** không dòng nào của chứng từ được ghi

### Requirement: Các loại biến động
Mỗi dòng sổ SHALL thuộc một loại biến động: `OPENING` (tồn đầu kỳ), `PURCHASE_IN` (nhập mua), `REPAIR_OUT` / `REPAIR_IN` (ra khỏi Chờ sửa để sửa / nhập sau sửa), `DELIVERY_OUT` / `DELIVERY_IN` (bãi → công trình), `RETURN_OUT` / `RETURN_IN` (công trình → bãi), `TRANSFER_OUT` / `TRANSFER_IN` (chuyển vị trí khác), `SALE_OUT` (bán), `ADJUST_OUT` / `ADJUST_IN` (điều chỉnh). Loại `..._IN` và `OPENING` SHALL có số lượng dương, `..._OUT` số lượng âm.

#### Scenario: Loại biến động sai dấu
- **WHEN** một chứng từ ghi `PURCHASE_IN` với số lượng −5
- **THEN** hệ thống từ chối với "Dòng nhập phải có số lượng dương"

### Requirement: Chỉ nhập mua, nhập sau sửa, tồn đầu kỳ làm đổi giá vốn
Chỉ dòng `OPENING`, `PURCHASE_IN`, `REPAIR_IN` SHALL làm đổi giá vốn bình quân, và người ghi SHALL đưa tổng giá trị của dòng (VND, số nguyên). Mọi loại khác SHALL ghi theo giá vốn bình quân hiện tại của (mã hàng + tình trạng) của chính dòng đó, nên không làm đổi giá vốn bình quân.

#### Scenario: Xuất cho công trình không đổi giá vốn
- **WHEN** `GG-K17` Tốt có giá vốn BQ 195.000 ₫ và phiếu `PX-2026-118` xuất 300 cái từ `BAI-01` tới công trình `CT-0003`
- **THEN** sổ có 2 dòng: `DELIVERY_OUT` −300 tại `BAI-01` và `DELIVERY_IN` +300 tại `CT-0003`, cả hai đơn giá 195.000 ₫ **AND** giá vốn BQ sau vẫn là 195.000 ₫

#### Scenario: Chuyển chỗ không đổi giá BQ và tổng giá trị
- **WHEN** `GG-K17` Tốt tổng tồn 3.420 cái giá BQ 195.282 ₫ (tổng giá trị 667.864.440 ₫), rồi lần lượt xuất 120 cái cho công trình, thu hồi 40 cái về bãi, chuyển 30 cái bãi → xưởng, xuất 200 cái
- **THEN** sau mỗi bước giá BQ vẫn 195.282 ₫ **AND** tổng tồn vẫn 3.420 **AND** tổng giá trị vẫn 667.864.440 ₫

#### Scenario: Thu hồi sang tình trạng khác
- **WHEN** thu hồi 10 cái `GG-K17` từ công trình đang ở tình trạng Tốt (giá BQ 195.282 ₫) về bãi ở tình trạng Chờ sửa (giá BQ 160.000 ₫)
- **THEN** dòng `RETURN_OUT` −10 Tốt ghi 195.282 ₫ **AND** dòng `RETURN_IN` +10 Chờ sửa ghi 160.000 ₫ **AND** giá BQ của Tốt và Chờ sửa đều không đổi

### Requirement: Giá vốn bình quân gia quyền theo mã hàng và tình trạng
Giá vốn bình quân SHALL tính riêng cho từng (mã hàng + tình trạng), gộp **toàn bộ hàng của công ty** ở mọi vị trí (bãi, xưởng, công trình). Khi có dòng làm đổi giá: giá mới = (tồn trước × giá BQ trước + giá trị dòng vào) ÷ (tồn trước + số lượng vào), **làm tròn đến 1 ₫, 0,5 làm tròn lên**. Tồn trước là tổng tồn của (mã hàng + tình trạng) ở mọi vị trí ngay trước dòng đó. Phép tính SHALL dùng số nguyên lớn, không dùng số thực.

#### Scenario: Chuỗi nhập mua rồi nhập sau sửa
- **WHEN** `GG-K17` Tốt tổng tồn 920 cái (mọi vị trí) giá BQ 195.000 ₫, rồi `PN-2026-087` nhập 160 cái tổng 31.384.800 ₫ (196.155 ₫/cái)
- **THEN** giá BQ mới = (920 × 195.000 + 31.384.800) ÷ 1.080 = 195.171,11 → **195.171 ₫**
- **AND WHEN** sau đó `PSC-2026-021` nhập sau sửa 40 cái tổng 8.580.000 ₫ (214.500 ₫/cái)
- **THEN** giá BQ mới = (1.080 × 195.171 + 8.580.000) ÷ 1.120 = 195.861,32 → **195.861 ₫**

#### Scenario: Hàng ở công trình cũng tính vào giá BQ
- **WHEN** `GG-K17` Tốt có 920 cái tại bãi và 300 cái đang ở `CT-0003`, giá BQ 195.000 ₫, rồi nhập 160 cái tổng 31.384.800 ₫
- **THEN** giá BQ mới tính trên 1.220 cái: (1.220 × 195.000 + 31.384.800) ÷ 1.380 = 195.133,91 → **195.134 ₫**

#### Scenario: Đúng nửa đồng làm tròn lên
- **WHEN** `GG-CH` Tốt tồn 1 cái giá BQ 100 ₫ và nhập 1 cái giá trị 101 ₫
- **THEN** giá BQ mới = 201 ÷ 2 = 100,5 → **101 ₫**

#### Scenario: Dưới nửa đồng làm tròn xuống
- **WHEN** `GG-CH` Tốt tồn 2 cái giá BQ 100 ₫ và nhập 1 cái giá trị 101 ₫
- **THEN** giá BQ mới = 301 ÷ 3 = 100,33 → **100 ₫**

#### Scenario: Tình trạng riêng giá riêng
- **WHEN** `GG-K17` Mới giá BQ 210.000 ₫ và nhập 100 cái `GG-K17` Tốt tổng 18.000.000 ₫
- **THEN** giá BQ của Mới vẫn là 210.000 ₫ **AND** chỉ giá BQ của Tốt đổi

#### Scenario: Hàng tính theo kg
- **WHEN** `PL-SAT` tồn 1.000 kg giá BQ 8.000 ₫/kg và nhập 500,5 kg tổng 4.254.250 ₫
- **THEN** giá BQ mới = 12.254.250 ÷ 1.500,5 = 8.166,78 → **8.167 ₫/kg**

#### Scenario: Số lớn không tràn
- **WHEN** một mã tồn 9.000.000 cái giá BQ 1.000.000.000 ₫ và nhập thêm 1 cái giá trị 999.999.999 ₫
- **THEN** giá BQ mới tính đúng là 1.000.000.000 ₫ (9.000.000.999.999.999 ÷ 9.000.001 = 999.999.999,9999999 → làm tròn lên)

### Requirement: Giá vốn khi tồn bằng 0
Khi tồn trước bằng 0, giá mới SHALL bằng giá trị ÷ số lượng (làm tròn như trên), không pha giá cũ. Khi tồn về 0, giá BQ cuối cùng SHALL được giữ để ghi các dòng sau.

#### Scenario: Nhập khi tồn bằng 0
- **WHEN** `PK-KU` Mới đã xuất hết (tồn 0, giá BQ cuối 52.000 ₫) rồi nhập 500 cái tổng 27.500.000 ₫
- **THEN** giá BQ mới là **55.000 ₫** (không pha giá cũ)

#### Scenario: Xuất hết vẫn giữ giá cuối
- **WHEN** `GG-M16` Tốt tồn 12 cái giá BQ 152.000 ₫ và xuất cả 12 cái
- **THEN** tồn là 0 **AND** giá BQ vẫn là 152.000 ₫ **AND** dòng thu hồi sau đó ghi theo 152.000 ₫

### Requirement: Dòng vào tình trạng chưa từng có giá
Khi một dòng không làm đổi giá (thu hồi, điều chỉnh, chuyển) vào một (mã hàng + tình trạng) chưa từng có dòng sổ nào, đơn giá ghi sổ SHALL lấy bằng đơn giá của dòng ra đi cùng trong chứng từ; nếu không có dòng ra đi cùng (điều chỉnh tăng số lượng) thì người lập SHALL nhập đơn giá. Dòng đó SHALL đặt giá BQ đầu tiên của (mã hàng + tình trạng).

#### Scenario: Thu hồi phế liệu lần đầu
- **WHEN** `GG-K15` chưa từng có tình trạng Phế liệu và thu hồi 3 cái từ công trình (Tốt, giá BQ 167.000 ₫) về bãi là Phế liệu
- **THEN** dòng `RETURN_IN` +3 Phế liệu ghi 167.000 ₫ **AND** giá BQ Phế liệu của `GG-K15` là 167.000 ₫

#### Scenario: Điều chỉnh tăng khi chưa có giá
- **WHEN** điều chỉnh tăng 20 cái `GG-K15` Mới khi mã này chưa từng có tình trạng Mới và không nhập đơn giá
- **THEN** hệ thống từ chối với "GG-K15 Mới chưa có giá vốn, nhập đơn giá"

### Requirement: Tồn theo vị trí không âm
Tồn của (mã hàng + tình trạng + vị trí) SHALL bằng tổng số lượng các dòng sổ của bộ ba đó. Vị trí là bãi (`YARD`), xưởng (`WORKSHOP`) hoặc công trình (`SITE`, mỗi công trình một vị trí đi kèm). Một lần ghi làm tồn của bất kỳ bộ ba nào xuống dưới 0 SHALL bị từ chối toàn bộ, kèm số còn lại.

#### Scenario: Xuất quá số tồn
- **WHEN** `GG-K17` Tốt tại `BAI-01` còn 120 cái và một phiếu xuất 150 cái
- **THEN** hệ thống từ chối với "Không đủ hàng: GG-K17 Tốt tại BAI-01 còn 120 cái" **AND** không dòng nào được ghi

#### Scenario: Hàng ở công trình
- **WHEN** đã xuất 300 cái `GG-K17` Tốt tới `CT-0003` và chưa thu hồi
- **THEN** tồn `GG-K17` Tốt tại vị trí `CT-0003` là 300 **AND** tồn tại `BAI-01` giảm 300

### Requirement: Ghi một chứng từ trong một transaction
Mọi dòng sổ của một chứng từ SHALL ghi trong cùng một transaction với việc lưu chứng từ đó (VD: duyệt phiếu điều chỉnh, xác nhận phiếu nhập). Một dòng lỗi SHALL làm cả chứng từ không được ghi. Mỗi dòng ghi sổ SHALL cập nhật giá vốn BQ hiện tại của (mã hàng + tình trạng) trong cùng transaction.

#### Scenario: Một dòng lỗi
- **WHEN** phiếu điều chỉnh có 3 dòng và dòng thứ 3 làm tồn âm
- **THEN** cả 3 dòng không được ghi **AND** phiếu vẫn ở trạng thái chờ duyệt

### Requirement: Ghi đồng thời không làm sai giá vốn
Hai lần ghi sổ cùng lúc chạm cùng (mã hàng + tình trạng) SHALL chạy lần lượt (khóa theo mã hàng + tình trạng, khóa theo thứ tự cố định để không kẹt). Kết quả SHALL giống như ghi lần lượt theo thứ tự hoàn tất.

#### Scenario: Hai phiếu nhập cùng lúc
- **WHEN** `GG-K17` Tốt tồn 920 cái giá BQ 195.000 ₫ và cùng lúc ghi phiếu A nhập 160 cái tổng 31.384.800 ₫ và phiếu B nhập 40 cái tổng 8.580.000 ₫
- **THEN** tồn là 1.120 cái **AND** giá BQ cuối bằng kết quả ghi lần lượt theo thứ tự hai phiếu hoàn tất (195.861 ₫ nếu A trước B)

#### Scenario: Hai phiếu xuất cùng lúc vượt tồn
- **WHEN** `GG-CH` Tốt tại `BAI-01` còn 100 cái và cùng lúc hai phiếu, mỗi phiếu xuất 60 cái
- **THEN** đúng một phiếu ghi được **AND** phiếu kia bị từ chối "Không đủ hàng: GG-CH Tốt tại BAI-01 còn 40 cái" **AND** tồn còn 40

### Requirement: Ngày nghiệp vụ không lùi
Mỗi dòng sổ SHALL có ngày nghiệp vụ theo giờ Việt Nam. Ngày nghiệp vụ của dòng mới SHALL không sớm hơn ngày nghiệp vụ của dòng gần nhất cùng (mã hàng + tình trạng) và SHALL không sau hôm nay, để thứ tự theo ngày trùng thứ tự tính giá vốn. Thứ tự các dòng cùng ngày SHALL là thứ tự ghi.

#### Scenario: Ghi lùi ngày
- **WHEN** dòng gần nhất của `GG-K17` Tốt là ngày 22/10/2026 và một chứng từ ghi ngày 20/10/2026
- **THEN** hệ thống từ chối với "GG-K17 Tốt đã có biến động ngày 22/10/2026, không ghi lùi ngày được"

#### Scenario: Ghi ngày mai
- **WHEN** hôm nay là 27/10/2026 và một chứng từ ghi ngày 28/10/2026
- **THEN** hệ thống từ chối với "Ngày ghi sổ không được sau hôm nay"

### Requirement: Hàng tính theo kg và phế liệu
Mã tính theo kg (VD `PL-SAT`) SHALL ghi số lượng theo kg, chính xác tới 0,001 kg, giá vốn theo ₫/kg. Mã tính theo cái SHALL ghi số lượng là số nguyên cái ở mọi tình trạng, kể cả Phế liệu; kg của phế liệu đếm theo cái chỉ để hiển thị (số cái × trọng lượng chuẩn). Dòng sổ SHALL có thêm số kg cân thực tế (tùy chọn) để ghi khi bán phế liệu theo kg; số kg đó không đổi số lượng hay giá vốn.

#### Scenario: Số lẻ với hàng tính theo cái
- **WHEN** một chứng từ ghi 2,5 cái `GG-K17`
- **THEN** hệ thống từ chối với "GG-K17 tính theo cái, số lượng phải là số nguyên"

#### Scenario: Bán phế liệu đếm theo cái
- **WHEN** bán 42 cái `GG-K17` Phế liệu (giá BQ 160.000 ₫/cái), cân được 570,5 kg
- **THEN** dòng `SALE_OUT` −42 cái ghi 160.000 ₫ và kg cân 570,5 **AND** giá BQ Phế liệu của `GG-K17` không đổi

### Requirement: Không ghi cho vật tư hay vị trí ngừng dùng
Dòng sổ mới SHALL không được ghi cho vật tư hoặc vị trí đã ngừng dùng. Dòng sổ cũ của chúng vẫn hiện ở tồn kho và thẻ kho.

#### Scenario: Vật tư ngừng dùng
- **WHEN** `KK-01` đã ngừng dùng và một phiếu điều chỉnh có dòng `KK-01`
- **THEN** hệ thống từ chối với "Vật tư KK-01 đã ngừng dùng"

### Requirement: Đối chiếu giá vốn hiện tại với sổ kho
Giá vốn BQ hiện tại lưu riêng để khóa và đọc nhanh SHALL luôn khớp sổ kho: tổng số lượng bằng tổng các dòng của (mã hàng + tình trạng), giá BQ bằng giá BQ sau của dòng cuối. Lệnh `npm run inventory:check` SHALL liệt kê mọi (mã hàng + tình trạng) bị lệch và thoát với mã lỗi khác 0 nếu có lệch.

#### Scenario: Không lệch
- **WHEN** chạy `npm run inventory:check` sau chuỗi ghi sổ mẫu của thẻ kho `GG-K17`
- **THEN** lệnh in "Sổ kho khớp: 0 lệch" và thoát mã 0

#### Scenario: Có lệch
- **WHEN** bảng giá vốn hiện tại của `GG-K17` Tốt bị sửa tay thành 196.000 ₫ trong khi dòng sổ cuối ghi 195.282 ₫
- **THEN** lệnh in dòng "GG-K17 Tốt: giá BQ 196.000 ₫, sổ kho 195.282 ₫" và thoát mã 1
