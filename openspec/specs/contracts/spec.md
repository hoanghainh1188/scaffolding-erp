# contracts Specification

## Purpose
Hợp đồng cho thuê và hợp đồng bán của công ty: giá, điều khoản, giá đền bù, cọc và kế hoạch giao của từng nhà thầu + công trình, qua Giám đốc duyệt trước khi xuất hàng. Báo giá là hợp đồng ở trạng thái Nháp.

## Requirements

### Requirement: Hai loại hợp đồng, một công trình
Mỗi hợp đồng SHALL có đúng một loại: **Cho thuê** hoặc **Bán**, và đúng một nhà thầu. Hợp đồng cho thuê SHALL có đúng một công trình của chính nhà thầu đó. Hợp đồng bán MAY để trống công trình (hiện "Nhận hàng tại bãi"). Loại và nhà thầu SHALL không đổi được sau lần lưu đầu (số hợp đồng đã mang tên khách); muốn đổi thì hủy nháp, lập mới. Công trình SHALL đổi được khi còn Nháp (vẫn phải của nhà thầu đó), không đổi được sau khi gửi duyệt, kể cả bằng phụ lục.

#### Scenario: Hợp đồng thuê cho một công trình
- **WHEN** `quocbao` tạo hợp đồng Cho thuê cho "Cty TNHH Xây dựng Minh Phát" (`NT-0003`), công trình "Trường THCS Dương Nội" (`CT-0003`)
- **THEN** hợp đồng được lưu Nháp với đúng nhà thầu và công trình đó

#### Scenario: Công trình của nhà thầu khác
- **WHEN** `quocbao` chọn nhà thầu `NT-0003` và công trình `CT-0007` của nhà thầu `NT-0005`
- **THEN** hệ thống từ chối với "Công trình CT-0007 không thuộc nhà thầu Minh Phát. Bạn chọn lại công trình của nhà thầu này." và không lưu

#### Scenario: Hợp đồng thuê thiếu công trình
- **WHEN** `quocbao` lưu hợp đồng Cho thuê không chọn công trình
- **THEN** hệ thống từ chối với "Hợp đồng cho thuê cần một công trình." và không lưu

#### Scenario: Hợp đồng bán không có công trình
- **WHEN** `quocbao` tạo hợp đồng Bán cho "Anh Phạm Đức Long" không chọn công trình
- **THEN** hợp đồng được lưu và D4 hiện "Nhận hàng tại bãi" ở cột công trình

#### Scenario: Đổi nhà thầu của nháp đã có số
- **WHEN** nháp `112026/ANPHAT-MINHPHAT` của `NT-0003` đã lưu và `quocbao` gửi lệnh sửa đổi nhà thầu sang `NT-0005`
- **THEN** hệ thống từ chối với "Hợp đồng đã có số theo nhà thầu Minh Phát nên không đổi nhà thầu được. Bạn hủy nháp này và lập hợp đồng mới." và không đổi dữ liệu

#### Scenario: Đổi loại của nháp đã có số
- **WHEN** `quocbao` gửi lệnh sửa đổi nháp Cho thuê `112026/ANPHAT-MINHPHAT` sang loại Bán
- **THEN** hệ thống từ chối với "Hợp đồng đã lưu nên không đổi loại được. Bạn hủy nháp này và lập hợp đồng mới." và không đổi dữ liệu

#### Scenario: Đổi công trình khi còn Nháp
- **WHEN** nháp của `NT-0003` đang chọn `CT-0003` và `quocbao` đổi sang `CT-0004` cũng của `NT-0003`
- **THEN** nháp lưu công trình `CT-0004`, số hợp đồng không đổi

### Requirement: Số hợp đồng tự sinh
Khi lưu lần đầu, hệ thống SHALL cấp số `MMYYYY/<VIẾT_TẮT>-<KHÁCH>`: `MMYYYY` là tháng, năm của ngày bắt đầu (thuê từ ngày, hoặc ngày giao của hợp đồng bán); `<VIẾT_TẮT>` là tên viết tắt công ty trong Cài đặt; `<KHÁCH>` do người lập gõ hoặc để mặc định. Cả hai phần viết hoa, bỏ dấu, chỉ giữ A–Z và 0–9. Số SHALL không đổi sau khi cấp, kể cả khi sửa ngày hay tên viết tắt.

#### Scenario: Số theo mẫu
- **WHEN** tên viết tắt công ty là "An Phát", `quocbao` lưu lần đầu hợp đồng thuê từ 01/11/2026 với phần khách "Minh Phát"
- **THEN** hợp đồng có số `112026/ANPHAT-MINHPHAT`

#### Scenario: Phần khách mặc định
- **WHEN** nhà thầu `NT-0003` chưa có hợp đồng nào và `quocbao` không gõ phần khách
- **THEN** phần khách mặc định là `NT0003`

#### Scenario: Phần khách lấy theo hợp đồng trước
- **WHEN** nhà thầu `NT-0003` đã có hợp đồng `102026/ANPHAT-MINHPHAT` và `quocbao` tạo hợp đồng mới cho nhà thầu này
- **THEN** ô phần khách điền sẵn `MINHPHAT`

#### Scenario: Đổi ngày sau khi đã cấp số
- **WHEN** hợp đồng `112026/ANPHAT-MINHPHAT` còn Nháp và `quocbao` đổi ngày thuê từ 01/11/2026 sang 05/12/2026
- **THEN** số vẫn là `112026/ANPHAT-MINHPHAT`

#### Scenario: Chưa có tên viết tắt công ty
- **WHEN** Cài đặt công ty chưa có tên viết tắt và `quocbao` lưu hợp đồng mới
- **THEN** hệ thống từ chối với "Công ty chưa có tên viết tắt nên chưa đặt được số hợp đồng. Giám đốc điền tên viết tắt ở Cài đặt → Công ty." và không lưu

### Requirement: Số hợp đồng không trùng
Hai hợp đồng SHALL không bao giờ cùng số. Khi gốc `MMYYYY/<VIẾT_TẮT>-<KHÁCH>` đã được cấp, hợp đồng sau cùng gốc SHALL nhận hậu tố `-2`, `-3`... theo thứ tự lưu, kể cả khi lưu cùng lúc. Số đã cấp SHALL không dùng lại, kể cả khi hợp đồng bị hủy.

#### Scenario: Hai công trình cùng khách trong tháng
- **WHEN** đã có `112026/ANPHAT-MINHPHAT` và `quocbao` lưu hợp đồng thứ hai của Minh Phát, thuê từ 15/11/2026, phần khách `MINHPHAT`
- **THEN** hợp đồng thứ hai có số `112026/ANPHAT-MINHPHAT-2`

#### Scenario: Lưu cùng lúc
- **WHEN** `quocbao` và Giám đốc cùng lưu lần đầu hai hợp đồng có gốc `112026/ANPHAT-MINHPHAT` vào cùng một lúc
- **THEN** hai hợp đồng có hai số khác nhau `112026/ANPHAT-MINHPHAT` và `112026/ANPHAT-MINHPHAT-2`

#### Scenario: Không dùng lại số của hợp đồng đã hủy
- **WHEN** `112026/ANPHAT-MINHPHAT-2` bị hủy rồi `quocbao` lưu hợp đồng mới cùng gốc
- **THEN** hợp đồng mới có số `112026/ANPHAT-MINHPHAT-3`

### Requirement: Dòng hàng theo bộ hoặc theo mã
Người lập SHALL thêm được hàng theo **mã vật tư** hoặc theo **bộ**. Thêm bộ × n SHALL tự tách thành linh kiện: mỗi linh kiện số lượng = số trong bộ × n. Mỗi mã SHALL chỉ có một dòng giá trên hợp đồng thuê: thêm bộ có linh kiện đã có dòng thì cộng số lượng vào dòng đó. Số lượng trên hợp đồng thuê chỉ là dự kiến.

#### Scenario: Thêm bộ
- **WHEN** bộ `BO-17` gồm 2 khung `H1,7`, 2 chéo `CHEO1,7`, 1 mâm `MAM1,6` và `quocbao` thêm `BO-17` × 300
- **THEN** hợp đồng có nhóm "Bộ giàn giáo 1,7m × 300 bộ" với 600 `H1,7`, 600 `CHEO1,7`, 300 `MAM1,6`

#### Scenario: Bộ trùng mã đã có
- **WHEN** hợp đồng đã có 100 `MAM1,6` thêm lẻ và `quocbao` thêm `BO-17` × 300
- **THEN** hợp đồng có một dòng `MAM1,6` số lượng 400 (300 theo bộ + 100 lẻ) với một giá thuê

#### Scenario: Số lượng 0
- **WHEN** `quocbao` nhập 0 cái cho `KU0,5`
- **THEN** hệ thống từ chối với "Số lượng phải lớn hơn 0. Bạn bỏ dòng nếu không thuê mã này." và không lưu

#### Scenario: Mã ngừng dùng
- **WHEN** `quocbao` thêm mã `GG-K15` đã ngừng dùng
- **THEN** ô chọn hàng không hiện `GG-K15`, và API từ chối với "Mã GG-K15 đã ngừng dùng."

### Requirement: Giá thuê lấy từ danh mục, sửa riêng
Khi thêm dòng hàng thuê, giá thuê/ngày SHALL điền sẵn bằng giá thuê mặc định của mã trong danh mục lúc đó và lưu kèm giá danh mục ấy. Người lập SHALL sửa được giá (số nguyên ≥ 0 ₫). Dòng có giá khác giá danh mục đã lưu SHALL được đánh dấu "Khác danh mục" kèm giá danh mục. Đổi giá danh mục sau đó SHALL không đổi giá trên hợp đồng.

#### Scenario: Giá sửa riêng
- **WHEN** `KU0,5` có giá danh mục 450 ₫/ngày và `quocbao` sửa giá trên hợp đồng thành 400 ₫
- **THEN** dòng lưu giá 400 ₫ **AND** D5a, D5 hiện "Danh mục: 450 ₫" cạnh giá

#### Scenario: Danh mục đổi sau khi lập
- **WHEN** hợp đồng có `H1,7` giá 1.200 ₫/ngày rồi Kinh doanh đổi giá danh mục `H1,7` thành 1.300 ₫
- **THEN** hợp đồng vẫn giá 1.200 ₫ và không bị đánh dấu "Khác danh mục"

#### Scenario: Mã không cho thuê
- **WHEN** `quocbao` thêm vào hợp đồng thuê mã `PL-SAT` không có giá thuê trong danh mục
- **THEN** ô giá để trống **AND** gửi duyệt bị từ chối với "Mã PL-SAT chưa có giá thuê. Bạn nhập giá cho dòng này." cho tới khi có giá

#### Scenario: Giá có số lẻ
- **WHEN** `quocbao` nhập giá thuê "1.200,5"
- **THEN** hệ thống từ chối theo quy tắc tiền là số nguyên VND

### Requirement: Hợp đồng bán theo cái hoặc theo kg
Mỗi dòng hợp đồng bán SHALL có tình trạng (Mới, Tốt hoặc Phế liệu), cách tính (theo đơn vị của mã, hoặc theo kg), số lượng và đơn giá nhập tay. Bán theo kg SHALL chỉ cho mã có trọng lượng chuẩn hoặc mã tính theo kg. Phế liệu SHALL chỉ bán theo kg. Tiền dòng = số × đơn giá, làm tròn 1 ₫ (0,5 lên).

#### Scenario: Bán mã tính theo cái theo kg
- **WHEN** `quocbao` lập dòng bán `H1,7` Tốt, cách tính kg, 1.250,5 kg × 14.000 ₫/kg
- **THEN** tiền dòng là 17.507.000 ₫

#### Scenario: Bán theo cái
- **WHEN** `quocbao` lập dòng bán `H1,7` Mới, 200 cái × 320.000 ₫
- **THEN** tiền dòng là 64.000.000 ₫

#### Scenario: Phế liệu theo cái
- **WHEN** `quocbao` lập dòng bán `H1,7` Phế liệu, cách tính cái
- **THEN** hệ thống từ chối với "Phế liệu chỉ bán theo kg." và không lưu

#### Scenario: Mã không có trọng lượng chuẩn
- **WHEN** mã `ONG-49` đơn vị mét không có trọng lượng chuẩn và `quocbao` chọn bán theo kg
- **THEN** hệ thống từ chối với "Mã ONG-49 chưa có trọng lượng chuẩn nên chưa bán theo kg được." và không lưu

### Requirement: Cách tính tiền thuê theo hợp đồng
Tiền thuê của một lượng hàng SHALL = giá ngày × số ngày tính × số lượng. Số ngày = ngày trả − ngày xuất (không tính ngày xuất, tính ngày trả), trừ ngày nghỉ chung (`rental-holidays`). Số ngày tính của từng lượng hàng SHALL không nhỏ hơn số ngày thuê tối thiểu của hợp đồng (mặc định 45, đặt một chỗ; ngoại lệ theo `rental-billing`). Hàng chưa trả tính tới ngày đang tính. Giá tháng SHALL chỉ để hiện, không quy ra giá ngày. Ví dụ dưới đây khi không có ngày nghỉ, trừ khi có ghi.

#### Scenario: Thuê quá 45 ngày
- **WHEN** 600 `H1,7` giá 1.200 ₫/ngày xuất 01/11/2026, trả 21/03/2027
- **THEN** số ngày là 140 và tiền thuê là 100.800.000 ₫

#### Scenario: Trả sớm hơn 45 ngày
- **WHEN** 100 `H1,7` giá 1.200 ₫/ngày xuất 01/11/2026, trả 21/11/2026 (20 ngày)
- **THEN** số ngày tính là 45 và tiền thuê là 5.400.000 ₫

#### Scenario: Trả đúng ngày thứ 45
- **WHEN** 100 `H1,7` giá 1.200 ₫/ngày xuất 01/11/2026, trả 16/12/2026
- **THEN** số ngày là 45 và tiền thuê là 5.400.000 ₫

#### Scenario: Trả một phần giữa chừng
- **WHEN** 600 `H1,7` giá 1.200 ₫/ngày xuất 01/11/2026; 200 cái trả 20/01/2027, 400 cái trả 21/03/2027
- **THEN** tiền thuê là 200 × 80 × 1.200 + 400 × 140 × 1.200 = 19.200.000 + 67.200.000 = 86.400.000 ₫

#### Scenario: Tối thiểu theo từng lượng hàng
- **WHEN** 100 `H1,7` giá 1.200 ₫/ngày xuất 01/11/2026 và 100 `H1,7` xuất 01/12/2026; ngày 21/12/2026 trả 100 cái
- **THEN** 100 cái trả là lượng xuất 01/11/2026 (50 ngày, không bù) **AND** lượng xuất 01/12/2026 vẫn đang thuê, chưa có bù

#### Scenario: Trừ ngày nghỉ
- **WHEN** bảng ngày nghỉ có Tết 05/02 – 13/02/2027 và 100 `H1,7` giá 1.200 ₫/ngày xuất 01/01/2027, trả 31/03/2027
- **THEN** số ngày là 89 − 9 = 80 và tiền thuê là 9.600.000 ₫

#### Scenario: Số lượng 0
- **WHEN** tính tiền thuê cho 0 cái `H1,7`
- **THEN** tiền thuê là 0 ₫, không áp số ngày tối thiểu

#### Scenario: Hợp đồng đặt thuê tối thiểu khác
- **WHEN** hợp đồng ghi thuê tối thiểu 30 ngày và 100 `H1,7` giá 1.200 ₫/ngày trả sau 20 ngày
- **THEN** tiền thuê là 100 × 30 × 1.200 = 3.600.000 ₫

#### Scenario: Giá tháng hiển thị theo số ngày của tháng
- **WHEN** tiền thuê 1 ngày của hợp đồng là 1.330.000 ₫
- **THEN** D5a, D5 hiện "tháng 30 ngày ≈ 39.900.000 ₫, tháng 31 ngày ≈ 41.230.000 ₫"

#### Scenario: Đổi giá giữa chừng
- **WHEN** 600 `H1,7` xuất 01/11/2026, trả 21/03/2027, giá 1.200 ₫/ngày tới hết 14/12/2026 và 1.400 ₫/ngày từ 15/12/2026 theo phụ lục
- **THEN** tiền thuê là 600 × (43 × 1.200 + 97 × 1.400) = 30.960.000 + 81.480.000 = 112.440.000 ₫

### Requirement: Giá trị dự kiến
Hợp đồng thuê SHALL hiện **giá trị dự kiến** = tiền thuê 1 ngày (Σ số lượng × giá ngày) × max(số ngày dự kiến, số ngày tối thiểu), với số ngày dự kiến = ngày kết thúc dự kiến − ngày bắt đầu. Hợp đồng bán SHALL hiện tổng tiền dòng. Giá trị dự kiến SHALL ghi "chưa gồm VAT và vận chuyển".

#### Scenario: Giá trị dự kiến hợp đồng thuê
- **WHEN** hợp đồng thuê từ 01/11/2026 đến 21/03/2027, tiền thuê 1 ngày 1.330.000 ₫
- **THEN** giá trị dự kiến là 186.200.000 ₫ với chú thích "140 ngày × 1.330.000 ₫"

#### Scenario: Thời gian ngắn hơn tối thiểu
- **WHEN** hợp đồng thuê từ 01/11/2026 đến 21/11/2026, tiền thuê 1 ngày 100.000 ₫, thuê tối thiểu 45 ngày
- **THEN** giá trị dự kiến là 4.500.000 ₫ với chú thích "45 ngày (tối thiểu) × 100.000 ₫"

#### Scenario: Ngày kết thúc trước ngày bắt đầu
- **WHEN** `quocbao` nhập thuê từ 01/11/2026 đến 31/10/2026
- **THEN** hệ thống từ chối với "Ngày kết thúc phải sau ngày bắt đầu." và không lưu

### Requirement: Điều khoản hợp đồng
Hợp đồng SHALL lưu: số ngày thuê tối thiểu (hợp đồng thuê, 1–365, mặc định 45), chốt kỳ (hợp đồng thuê, MVP chỉ "Hàng tháng · ngày cuối tháng"), hạn thanh toán (0–365 ngày, mặc định lấy từ nhà thầu, sửa được), ngày ký, ngày bắt đầu, ngày kết thúc dự kiến (hợp đồng thuê), vận chuyển (công ty gọi xe hay không, cước một chiều). Hợp đồng SHALL không tính lãi hay phạt chậm trả.

#### Scenario: Hạn thanh toán mặc định
- **WHEN** nhà thầu `NT-0003` có hạn thanh toán 30 ngày và `quocbao` tạo hợp đồng cho nhà thầu này
- **THEN** ô hạn thanh toán điền sẵn 30 ngày **AND** sửa thành 45 ngày thì hợp đồng lưu 45

#### Scenario: Nhà thầu đổi hạn sau khi lập
- **WHEN** hợp đồng lưu hạn 30 ngày rồi nhà thầu `NT-0003` đổi hạn mặc định thành 15 ngày
- **THEN** hợp đồng vẫn hạn 30 ngày

#### Scenario: Thuê tối thiểu ngoài khoảng
- **WHEN** `quocbao` nhập thuê tối thiểu 0 ngày
- **THEN** hệ thống từ chối với "Thuê tối thiểu từ 1 đến 365 ngày." và không lưu

### Requirement: VAT theo hợp đồng
Hợp đồng SHALL có cờ "Khách lấy hóa đơn VAT" và thuế suất (%, lớn hơn 0, tối đa 20, tối đa 2 chữ số lẻ) khi bật cờ. Tắt cờ thì không lưu thuế suất. Hợp đồng chỉ lưu cờ và thuế suất; tiền VAT cộng vào công nợ khi chốt kỳ (change sau).

#### Scenario: Bật VAT 8 %
- **WHEN** `quocbao` bật "Khách lấy hóa đơn VAT" với thuế suất 8 %
- **THEN** hợp đồng lưu VAT có, 8 % **AND** D5 hiện "VAT 8 % · cộng vào công nợ khi chốt kỳ"

#### Scenario: Bật VAT thiếu thuế suất
- **WHEN** `quocbao` bật VAT và để trống thuế suất
- **THEN** hệ thống từ chối với "Bạn nhập thuế suất VAT." và không lưu

#### Scenario: Không lấy hóa đơn
- **WHEN** hợp đồng không bật VAT
- **THEN** D5 hiện "Không lấy hóa đơn VAT" và không có thuế suất

### Requirement: Bảng giá đền bù chép từ bảng chung
Hợp đồng thuê SHALL có giá đền bù **mất** và **hỏng, sửa được** cho mỗi mã có dòng hàng. Khi thêm mã, hai giá SHALL chép từ giá đền bù mặc định của mã trong danh mục (bảng chung của công ty) và lưu kèm giá bảng chung lúc chép. Giá đã chép SHALL không đổi khi bảng chung đổi. Giá khác bảng chung đã lưu SHALL được đánh dấu.

#### Scenario: Chép từ bảng chung
- **WHEN** `H1,7` có giá mất 450.000 ₫, hỏng 50.000 ₫ trong danh mục và `quocbao` thêm `H1,7` vào hợp đồng
- **THEN** bảng giá đền bù có dòng `H1,7` mất 450.000 ₫, hỏng 50.000 ₫

#### Scenario: Bảng chung đổi sau khi chép
- **WHEN** hợp đồng đã chép giá mất `H1,7` 450.000 ₫ rồi Kinh doanh đổi giá mất mặc định của `H1,7` thành 480.000 ₫
- **THEN** hợp đồng vẫn giá mất 450.000 ₫ và không bị đánh dấu khác bảng chung

#### Scenario: Sửa riêng
- **WHEN** `quocbao` sửa giá mất `H1,7` trên hợp đồng thành 500.000 ₫
- **THEN** dòng lưu 500.000 ₫ **AND** hiện "Bảng chung: 450.000 ₫" cạnh giá

#### Scenario: Lấy lại bảng chung
- **WHEN** hợp đồng còn Nháp, giá mất `H1,7` đang 500.000 ₫, bảng chung đã là 480.000 ₫, và `quocbao` bấm "Lấy lại bảng chung"
- **THEN** mọi dòng đền bù lấy lại giá bảng chung hiện tại: `H1,7` mất 480.000 ₫

#### Scenario: Mã chưa có giá đền bù
- **WHEN** `KU0,5` không có giá đền bù trong danh mục
- **THEN** dòng đền bù `KU0,5` để trống **AND** gửi duyệt bị từ chối với "Mã KU0,5 chưa có giá đền bù. Bạn nhập giá mất và giá hỏng (có thể là 0 ₫)." cho tới khi có đủ hai giá

#### Scenario: Phế liệu tính như mất
- **WHEN** Giám đốc xem bảng giá đền bù trên D5
- **THEN** bảng ghi chú "Hàng hỏng đến mức thành phế liệu tính như mất."

### Requirement: Cọc tiền và bảo lãnh ngân hàng
Hợp đồng SHALL có không, một hoặc nhiều khoản cọc. **Cọc tiền** là khoản cọc **thỏa thuận**: số tiền (> 0 ₫), hình thức (tiền mặt hoặc chuyển khoản); hợp đồng không ghi đã nhận hay chưa. **Bảo lãnh ngân hàng**: ngân hàng, số chứng thư, giá trị (> 0 ₫), ngày hết hạn, đều bắt buộc. Tiền cọc đã nhận SHALL ghi bằng phiếu thu loại Nộp cọc tiền (spec `customer-receipts`) và chỉ cấn trừ khi thanh lý (spec `contract-settlement`). D5 SHALL hiện cọc tiền thỏa thuận và đã nhận.

#### Scenario: Một cọc tiền và một bảo lãnh
- **WHEN** `quocbao` thêm cọc tiền 50.000.000 ₫ chuyển khoản và bảo lãnh Vietcombank số `BL-2026-1188` giá trị 100.000.000 ₫ hết hạn 31/03/2027
- **THEN** hợp đồng lưu hai khoản cọc **AND** D5 hiện tổng cọc tiền 50.000.000 ₫ và tổng bảo lãnh 100.000.000 ₫ tách riêng

#### Scenario: Bảo lãnh thiếu số chứng thư
- **WHEN** `quocbao` thêm bảo lãnh không có số chứng thư
- **THEN** hệ thống từ chối với "Bảo lãnh cần ngân hàng, số chứng thư, giá trị và ngày hết hạn." và không lưu

#### Scenario: Ghi chú cấn trừ
- **WHEN** người dùng xem khối Tiền cọc trên D5a hoặc D5
- **THEN** khối ghi "Cọc giữ riêng theo hợp đồng, chỉ cấn trừ khi thanh lý công trình; cọc thừa trả lại khách."

#### Scenario: D5 hiện cọc đã nhận
- **WHEN** hợp đồng có cọc tiền 50.000.000 ₫ và đã có phiếu cọc `PT-2026-104` 30.000.000 ₫
- **THEN** khối Tiền cọc trên D5 hiện "Cọc tiền 50.000.000 ₫ · đã nhận 30.000.000 ₫ (PT-2026-104) · còn thiếu 20.000.000 ₫"

### Requirement: Cảnh báo bảo lãnh
Với mỗi bảo lãnh, hệ thống SHALL tính theo ngày hôm nay (giờ Việt Nam): **sắp hết hạn** khi còn từ 0 đến 30 ngày (ngày hết hạn − hôm nay), **đã hết hạn** khi ngày hết hạn trước hôm nay, và **hết hạn trước ngày kết thúc dự kiến** của hợp đồng thuê. Cảnh báo hiện trên D4, D5 và ô kiểm tra khi gửi duyệt; không chặn gửi hay duyệt.

#### Scenario: Còn 31 ngày
- **WHEN** hôm nay là 28/02/2027 và bảo lãnh hết hạn 31/03/2027
- **THEN** không có cảnh báo sắp hết hạn

#### Scenario: Còn 30 ngày
- **WHEN** hôm nay là 01/03/2027 và bảo lãnh hết hạn 31/03/2027
- **THEN** D4 và D5 hiện "Bảo lãnh BL-2026-1188 còn 30 ngày (hết hạn 31/03/2027)"

#### Scenario: Đã hết hạn
- **WHEN** hôm nay là 01/04/2027 và bảo lãnh hết hạn 31/03/2027
- **THEN** D4 và D5 hiện "Bảo lãnh BL-2026-1188 đã hết hạn ngày 31/03/2027"

#### Scenario: Hết hạn trước ngày kết thúc dự kiến
- **WHEN** hợp đồng thuê kết thúc dự kiến 30/04/2027 và bảo lãnh hết hạn 31/03/2027
- **THEN** ô kiểm tra khi gửi duyệt và thanh duyệt của Giám đốc hiện "Bảo lãnh BL-2026-1188 hết hạn 31/03/2027, trước ngày kết thúc dự kiến 30/04/2027" **AND** vẫn gửi và duyệt được

#### Scenario: Ngày nhắc trên form
- **WHEN** `quocbao` nhập ngày hết hạn bảo lãnh 31/03/2027
- **THEN** D5a hiện "Nhắc trước 30 ngày: 01/03/2027"

### Requirement: Kế hoạch giao theo đợt
Hợp đồng MAY có nhiều đợt giao dự kiến, mỗi đợt có ngày dự kiến và hàng (bộ hoặc mã + số lượng). Kế hoạch SHALL chỉ là dự kiến để báo giá và nhắc việc: không giữ hàng, không ghi sổ kho, không ràng buộc số và ngày của phiếu xuất sau này. Hàng trong kế hoạch SHALL là hàng có trên hợp đồng.

#### Scenario: Hai đợt giao
- **WHEN** `quocbao` lập đợt 1 ngày 01/11/2026 "150 bộ giàn giáo 1,7m" và đợt 2 ngày 15/11/2026 "150 bộ giàn giáo 1,7m + 400 kích tăng U"
- **THEN** D5 hiện hai đợt theo thứ tự ngày

#### Scenario: Hàng không có trên hợp đồng
- **WHEN** `quocbao` thêm vào đợt 2 mã `CC3` chưa có dòng trên hợp đồng
- **THEN** hệ thống từ chối với "Mã CC3 chưa có trên hợp đồng. Bạn thêm dòng hàng trước." và không lưu

### Requirement: Nhân viên phụ trách theo nhà thầu
Khi tạo hợp đồng, hệ thống SHALL chép nhân viên phụ trách của nhà thầu vào hợp đồng. Đổi người phụ trách của nhà thầu sau đó SHALL không đổi hợp đồng đã tạo. D4 SHALL lọc được hợp đồng theo người phụ trách.

#### Scenario: Chép người phụ trách
- **WHEN** nhà thầu `NT-0003` do `quocbao` phụ trách và Giám đốc tạo hợp đồng cho nhà thầu này
- **THEN** hợp đồng có người phụ trách `quocbao` và D5a hiện "Phụ trách: Quốc Bảo · được nợ 30 ngày"

#### Scenario: Nhà thầu đổi người phụ trách
- **WHEN** hợp đồng đã tạo với `quocbao` rồi nhà thầu `NT-0003` chuyển sang `thuyvy` phụ trách
- **THEN** hợp đồng cũ vẫn ghi `quocbao`

### Requirement: Trạng thái hợp đồng
Hợp đồng SHALL có một trong các trạng thái: Nháp, Chờ duyệt, Đã duyệt, Đang thực hiện, Thanh lý, Đã hủy. Chỉ các chuyển sau SHALL được phép, còn lại bị từ chối: Nháp → Chờ duyệt hoặc Đã hủy; Chờ duyệt → Đã duyệt hoặc Nháp (trả lại có lý do); Đã duyệt → Đã hủy khi chưa có hàng tới công trình, không còn phiếu xuất hay phiếu chuyển tới chưa xong; Đã duyệt → Đang thực hiện khi phiếu xuất hoặc phiếu chuyển tới đầu tiên ghi sổ; Đang thực hiện → Thanh lý (trạng thái cuối, spec `contract-settlement`).

#### Scenario: Gửi duyệt
- **WHEN** `quocbao` bấm "Gửi Giám đốc duyệt" trên hợp đồng Nháp đủ dữ liệu
- **THEN** hợp đồng sang Chờ duyệt **AND** D4 tăng đếm "Chờ duyệt" lên 1

#### Scenario: Trả lại
- **WHEN** Giám đốc trả lại hợp đồng Chờ duyệt với lý do "Giá kích tăng U thấp quá, báo lại 450 ₫"
- **THEN** hợp đồng về Nháp **AND** D5 hiện lý do trả lại cho người lập

#### Scenario: Trả lại thiếu lý do
- **WHEN** Giám đốc bấm "Từ chối" mà để trống lý do
- **THEN** hệ thống từ chối với "Bạn ghi lý do để người lập biết cần sửa gì." và hợp đồng vẫn Chờ duyệt

#### Scenario: Hủy báo giá khách không lấy
- **WHEN** `quocbao` hủy hợp đồng Nháp với lý do "Khách thuê chỗ khác"
- **THEN** hợp đồng sang Đã hủy, giữ số, D4 xếp vào nhóm "Đã kết thúc"

#### Scenario: Chuyển không hợp lệ
- **WHEN** có lệnh gửi duyệt cho hợp đồng đang Đã duyệt
- **THEN** hệ thống từ chối với "Hợp đồng đã được duyệt nên không gửi duyệt lại được. Bạn lập phụ lục nếu cần đổi." và không đổi dữ liệu

#### Scenario: Phiếu xuất đầu tiên
- **WHEN** hợp đồng `112026/ANPHAT-MINHPHAT` Đã duyệt và thủ kho xác nhận phiếu xuất đầu tiên `PX-2026-001`
- **THEN** hợp đồng sang Đang thực hiện trong cùng lần ghi sổ **AND** D5 hiện trạng thái "Đang thực hiện"

#### Scenario: Phiếu chuyển công trình đầu tiên
- **WHEN** hợp đồng `112026/ANPHAT-MINHPHAT` Đã duyệt, chưa xuất lần nào, và `CCT-2026-004` chuyển hàng tới nó được ghi sổ
- **THEN** hợp đồng sang Đang thực hiện trong cùng lần ghi sổ

#### Scenario: Hủy hợp đồng còn phiếu xuất chưa xong
- **WHEN** hợp đồng Đã duyệt có `PX-2026-141` Chờ nhặt và Giám đốc hủy hợp đồng
- **THEN** hệ thống từ chối với "Hợp đồng còn phiếu xuất PX-2026-141 chưa xong. Bạn hủy phiếu xuất đó trước rồi hủy hợp đồng." và không đổi dữ liệu

#### Scenario: Thanh lý
- **WHEN** `082026/ANPHAT-MINHPHAT` Đang thực hiện đủ điều kiện và `thuha` thanh lý ngày 04/12/2026
- **THEN** hợp đồng sang Thanh lý **AND** D4 xếp vào nhóm "Đã kết thúc"

#### Scenario: Hủy hợp đồng đã thanh lý
- **WHEN** có lệnh hủy hợp đồng Thanh lý
- **THEN** hệ thống từ chối và hợp đồng vẫn Thanh lý

### Requirement: Kiểm tra trước khi gửi duyệt
Gửi duyệt SHALL bị chặn khi thiếu: ít nhất một dòng hàng, giá mỗi dòng, ngày bắt đầu, ngày kết thúc dự kiến (hợp đồng thuê), đủ giá đền bù (hợp đồng thuê). D5a và thanh duyệt SHALL hiện ô kiểm tra không chặn: tồn Mới + Tốt ở bãi đủ cho đợt giao đầu, giá khác danh mục, bảo lãnh, nhà thầu đang nợ quá hạn.

#### Scenario: Ô kiểm tra đủ hàng đợt 1
- **WHEN** đợt 1 cần 300 `H1,7` và bãi có 250 `H1,7` Tốt + 20 Mới
- **THEN** ô kiểm tra hiện "Kho thiếu 30 H1,7 cho đợt 1 (cần 300, bãi có 270 Mới + Tốt)" **AND** vẫn gửi duyệt được

#### Scenario: Đếm giá khác danh mục
- **WHEN** hợp đồng có 1 giá thuê và 1 giá đền bù khác danh mục
- **THEN** ô kiểm tra hiện "1 giá thuê và 1 giá đền bù khác danh mục"

#### Scenario: Thiếu dòng hàng
- **WHEN** `quocbao` gửi duyệt hợp đồng chưa có dòng hàng
- **THEN** hệ thống từ chối với "Hợp đồng chưa có hàng. Bạn thêm ít nhất một dòng trước khi gửi duyệt." và hợp đồng vẫn Nháp

### Requirement: Chỉ Giám đốc duyệt hợp đồng
Chỉ người có quyền duyệt hợp đồng (Giám đốc) SHALL duyệt, trả lại hợp đồng Chờ duyệt và hủy hợp đồng Đã duyệt. Hợp đồng SHALL chỉ có hiệu lực sau khi duyệt. Duyệt hai lần cùng lúc SHALL chỉ duyệt một lần.

#### Scenario: Kinh doanh gọi API duyệt
- **WHEN** `quocbao` (Kinh doanh) gửi `POST /api/contracts/<id>/approve` cho hợp đồng Chờ duyệt
- **THEN** API trả 403 với "Bạn không có quyền thực hiện thao tác này" **AND** hợp đồng vẫn Chờ duyệt

#### Scenario: Giám đốc duyệt
- **WHEN** Giám đốc duyệt `112026/ANPHAT-MINHPHAT` lúc 26/10/2026 08:15
- **THEN** hợp đồng sang Đã duyệt, lưu người duyệt và giờ duyệt **AND** D4 xếp vào nhóm "Đang hiệu lực"

#### Scenario: Duyệt hai lần cùng lúc
- **WHEN** Giám đốc bấm duyệt trên hai tab cùng lúc
- **THEN** đúng một lần duyệt thành công, lần kia nhận "Hợp đồng đã được duyệt." **AND** nhật ký chỉ có một dòng Duyệt

#### Scenario: Hủy hợp đồng đã duyệt đã có xuất hàng
- **WHEN** Giám đốc hủy hợp đồng Đã duyệt đã có phiếu xuất
- **THEN** hệ thống từ chối với "Hợp đồng đã xuất hàng nên không hủy được." và không đổi dữ liệu

### Requirement: Duyệt khi nhà thầu nợ quá hạn
Khi duyệt, nếu nhà thầu đang có nợ quá hạn (số tiền > 0), hệ thống SHALL cảnh báo số nợ và số ngày quá hạn, và SHALL bắt buộc lý do (1–500 ký tự). Lý do, số nợ và số ngày lúc duyệt SHALL lưu cùng lần duyệt. Không nợ quá hạn thì không cần lý do. Nợ quá hạn SHALL đọc từ công nợ phải thu lúc duyệt, trong transaction duyệt (spec `receivables`, "Số nợ quá hạn của nhà thầu").

#### Scenario: Nợ quá hạn mà không ghi lý do
- **WHEN** Minh Phát nợ quá hạn 96.000.000 ₫ (7 ngày) và Giám đốc bấm "Duyệt hợp đồng" để trống lý do
- **THEN** hệ thống từ chối với "Nhà thầu đang nợ quá hạn 96.000.000 ₫ (7 ngày). Bạn ghi lý do vẫn duyệt." và hợp đồng vẫn Chờ duyệt

#### Scenario: Nợ quá hạn có lý do
- **WHEN** Giám đốc duyệt với lý do "Minh Phát hẹn trả 96 triệu trước 05/11, đã gọi xác nhận."
- **THEN** hợp đồng Đã duyệt **AND** lần duyệt lưu lý do, 96.000.000 ₫, 7 ngày **AND** D5 hiện lý do dưới dòng duyệt

#### Scenario: Không nợ quá hạn
- **WHEN** nhà thầu không có nợ quá hạn và Giám đốc duyệt không ghi lý do
- **THEN** hợp đồng Đã duyệt

#### Scenario: Số nợ đọc từ công nợ
- **WHEN** hôm nay 05/11/2026 và Minh Phát còn `PX-2026-041` 21.500.000 ₫ hạn 17/10/2026, không khoản quá hạn nào khác
- **THEN** thanh duyệt hiện "Nhà thầu đang nợ quá hạn 21.500.000 ₫ (19 ngày)" **AND** duyệt có lý do lưu 21.500.000 ₫, 19 ngày

#### Scenario: Vừa trả hết nợ quá hạn
- **WHEN** Minh Phát vừa được ghi phiếu thu trừ hết `PX-2026-041` rồi Giám đốc duyệt hợp đồng không ghi lý do
- **THEN** hợp đồng Đã duyệt

### Requirement: Không sửa thẳng hợp đồng đã gửi
Chỉ hợp đồng Nháp SHALL sửa được. Hợp đồng Chờ duyệt, Đã duyệt, Đang thực hiện SHALL không sửa trực tiếp; đổi nội dung sau duyệt SHALL đi qua phụ lục. Lệnh sửa SHALL gửi kèm thời điểm cập nhật đã đọc; khác với bản đang lưu thì trả 409 và không ghi.

#### Scenario: Sửa hợp đồng đã duyệt
- **WHEN** `quocbao` gửi `PUT /api/contracts/<id>` đổi giá `H1,7` trên hợp đồng Đã duyệt
- **THEN** API từ chối với "Hợp đồng đã duyệt không sửa trực tiếp được. Bạn lập phụ lục để đổi." **AND** giá không đổi

#### Scenario: Hai người sửa cùng nháp
- **WHEN** `quocbao` và Giám đốc cùng mở nháp, Giám đốc lưu trước, rồi `quocbao` lưu bản đọc lúc trước
- **THEN** API trả 409 với "Hợp đồng vừa được người khác sửa. Bạn tải lại để xem bản mới rồi sửa tiếp." và giữ bản của Giám đốc

### Requirement: Quyền theo loại hợp đồng
Xem và tạo/sửa hợp đồng SHALL kiểm riêng cho từng loại ở server: quyền xem/sửa hợp đồng thuê chỉ mở hợp đồng thuê, quyền xem/sửa hợp đồng bán chỉ mở hợp đồng bán. Người không có quyền với loại nào SHALL không thấy hợp đồng loại đó trong D4, không mở được D5, và API trả 403 (mở thẳng theo mã cũng vậy).

#### Scenario: Kinh doanh chỉ cho thuê mở hợp đồng bán
- **WHEN** `quocbao` có phạm vi "Chỉ cho thuê" và mở thẳng D5 của hợp đồng bán `102026/ANPHAT-PDLONG`
- **THEN** trang hiện "Bạn không có quyền xem trang này" với mã 403 **AND** `GET /api/contracts/<id>` của hợp đồng đó trả 403

#### Scenario: Kinh doanh chỉ bán tạo hợp đồng thuê
- **WHEN** `thuyvy` có phạm vi "Chỉ bán" và gửi `POST /api/contracts` loại Cho thuê
- **THEN** API trả 403 và không có hợp đồng nào được tạo

#### Scenario: Danh sách lọc theo quyền
- **WHEN** có 9 hợp đồng thuê và 3 hợp đồng bán, `quocbao` có phạm vi "Chỉ cho thuê" mở D4
- **THEN** D4 hiện 9 hợp đồng, không có bộ lọc "Bán đứt", ô đếm không tính hợp đồng bán

#### Scenario: Kế toán xem nhưng không sửa
- **WHEN** `thuha` (Kế toán) mở D5 của hợp đồng thuê rồi gửi `PUT /api/contracts/<id>`
- **THEN** trang mở được **AND** API trả 403

### Requirement: Danh sách hợp đồng D4
D4 SHALL liệt kê hợp đồng người dùng được xem, mới nhất trước, với số, loại, nhà thầu · công trình, thời gian, giá trị dự kiến, trạng thái và cảnh báo bảo lãnh. D4 SHALL có ô đếm Tất cả, Chờ duyệt, Đang hiệu lực (Đã duyệt + Đang thực hiện), Đã kết thúc (Thanh lý + Đã hủy), lọc theo loại, nhà thầu, công trình, người phụ trách và tìm theo số hợp đồng.

#### Scenario: Ô đếm
- **WHEN** có 2 hợp đồng Chờ duyệt, 9 Đã duyệt hoặc Đang thực hiện, 31 Thanh lý hoặc Đã hủy
- **THEN** D4 hiện "Tất cả · 42", "Chờ duyệt · 2", "Đang hiệu lực · 9", "Đã kết thúc · 31"

#### Scenario: Tìm theo số
- **WHEN** người dùng gõ "MINHPHAT" vào ô tìm
- **THEN** D4 chỉ hiện các hợp đồng có số chứa `MINHPHAT`

#### Scenario: Nhắc Giám đốc
- **WHEN** Giám đốc mở D4 khi có 2 hợp đồng Chờ duyệt
- **THEN** đầu trang hiện "2 hợp đồng đang chờ bạn duyệt"

### Requirement: Chi tiết hợp đồng D5 và thanh duyệt
D5 SHALL hiện nhà thầu, công trình, thời gian, điều khoản, dòng hàng (bộ hiện kèm linh kiện), tiền thuê 1 ngày và giá tháng, bảng giá đền bù, cọc, kế hoạch giao, giá trị dự kiến, ô kiểm tra, người lập, lịch sử duyệt và các bản (gốc, phụ lục). Với hợp đồng Chờ duyệt, Giám đốc SHALL thấy thanh duyệt có nút Duyệt, Từ chối và ô lý do.

#### Scenario: Thanh duyệt cho Giám đốc
- **WHEN** Giám đốc mở D5 của hợp đồng Chờ duyệt do `quocbao` gửi lúc 25/10/2026 16:20
- **THEN** đầu trang hiện "Hợp đồng này đang chờ bạn duyệt" và "Quốc Bảo gửi lúc 25/10/2026 16:20. Duyệt xong mới tạo được phiếu xuất."

#### Scenario: Kinh doanh không thấy thanh duyệt
- **WHEN** `quocbao` mở D5 của hợp đồng Chờ duyệt do chính mình gửi
- **THEN** trang không có nút Duyệt, Từ chối

### Requirement: In báo giá và hợp đồng
Hợp đồng ở mọi trạng thái SHALL in được qua trang in. Đầu trang in SHALL lấy tên, mã số thuế, địa chỉ, điện thoại, tài khoản ngân hàng và logo từ Cài đặt công ty, không viết cứng. Bản in hợp đồng Nháp SHALL có tiêu đề "Báo giá"; hợp đồng đã duyệt in tiêu đề "Hợp đồng" kèm số. Bản in SHALL gồm hàng, giá, điều khoản, VAT, bảng giá đền bù, cọc và kế hoạch giao.

#### Scenario: In báo giá
- **WHEN** `quocbao` bấm "In báo giá" trên hợp đồng Nháp `112026/ANPHAT-MINHPHAT`
- **THEN** bản in có tiêu đề "Báo giá 112026/ANPHAT-MINHPHAT", đầu trang là tên và mã số thuế công ty trong Cài đặt

#### Scenario: Đổi tên công ty
- **WHEN** Giám đốc đổi tên công ty trong Cài đặt rồi in lại hợp đồng cũ
- **THEN** bản in mang tên công ty mới, số hợp đồng không đổi

#### Scenario: Công ty chưa có logo
- **WHEN** Cài đặt công ty không có logo
- **THEN** bản in vẫn in được, đầu trang chỉ có chữ

### Requirement: Nhật ký thao tác hợp đồng
Mỗi lệnh làm đổi hợp đồng SHALL ghi đúng một dòng nhật ký trong cùng transaction: Tạo, Sửa (chỉ khi có trường đổi), Gửi duyệt, Duyệt, Trả lại, Hủy. Lệnh bị từ chối SHALL không ghi. Duyệt kèm lý do nợ quá hạn SHALL gắn cờ "Có xác nhận bất thường" và tóm tắt ghi số nợ.

#### Scenario: Tạo hợp đồng
- **WHEN** `quocbao` lưu lần đầu `112026/ANPHAT-MINHPHAT` cho thuê, 4 mã hàng, giá trị dự kiến 186.200.000 ₫
- **THEN** có một dòng Tạo `112026/ANPHAT-MINHPHAT` "Cho thuê · Minh Phát · Trường THCS Dương Nội · 4 mã hàng · 186.200.000 ₫"

#### Scenario: Duyệt khi nợ quá hạn
- **WHEN** Giám đốc duyệt với lý do khi Minh Phát nợ quá hạn 96.000.000 ₫ (7 ngày)
- **THEN** có một dòng Duyệt gắn cờ "Có xác nhận bất thường" với tóm tắt "Nhà thầu nợ quá hạn 96.000.000 ₫ (7 ngày) · lý do: Minh Phát hẹn trả 96 triệu trước 05/11, đã gọi xác nhận."

#### Scenario: Lưu không đổi gì
- **WHEN** `quocbao` bấm "Lưu nháp" mà không sửa trường nào
- **THEN** không có dòng nhật ký mới

#### Scenario: Gửi duyệt bị chặn
- **WHEN** gửi duyệt bị từ chối vì thiếu giá đền bù
- **THEN** không có dòng nhật ký Gửi duyệt
