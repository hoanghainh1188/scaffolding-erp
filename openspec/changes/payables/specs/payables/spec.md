## ADDED Requirements

### Requirement: Mỗi phiếu nhập đã ghi sổ là một khoản phải trả
Mỗi phiếu nhập đã ghi sổ SHALL là một khoản phải trả người bán (0.2 #99). Số phát sinh SHALL = Σ dòng đã đếm, mỗi dòng = số thực nhận theo đơn vị dòng đơn (dòng kg: kg cân thực tế) × đơn giá dòng đơn, làm tròn 1 ₫ (0,5 lên), đúng cách tính "Phải trả người bán" của spec `goods-receipts`. Chi phí chuyến SHALL không cộng vào (0.2 #26, #98); số SHALL chưa có VAT (0.2 #101). Phiếu có số phát sinh 0 ₫ SHALL không thành khoản.

#### Scenario: Khoản theo số cái thực nhận
- **WHEN** `PN-2026-091` (chuyến 2 của `PO-2026-052`, Anh Lê Văn Tâm) nhận 650 chéo 1,7m cũ, đơn giá dòng đơn 25.000 ₫/cái, chuyến có cước xe 800.000 ₫
- **THEN** khoản `PN-2026-091` phát sinh 16.250.000 ₫ **AND** cước 800.000 ₫ không có trong khoản

#### Scenario: Khoản theo kg cân thực tế
- **WHEN** dòng sắt ống của `PO-2026-052` đặt 3.400 kg × 8.000 ₫/kg và `PN-2026-090` cân thực tế 3.312,5 kg
- **THEN** khoản `PN-2026-090` phát sinh 26.500.000 ₫, không phải 27.200.000 ₫ theo số trên đơn

#### Scenario: Làm tròn từng dòng
- **WHEN** một phiếu có dòng 12,345 kg × 7.500 ₫/kg và dòng 40 cái × 195.000 ₫
- **THEN** khoản phát sinh 92.588 + 7.800.000 = 7.892.588 ₫

#### Scenario: Khớp số "Phải trả người bán" trên D3b
- **WHEN** `PO-2026-052` có hai phiếu nhập `PN-2026-090` 26.500.000 ₫ và `PN-2026-091` 16.250.000 ₫
- **THEN** D3b hiện "Phải trả người bán" 42.750.000 ₫ **AND** tổng phát sinh hai khoản trên D14c cũng là 42.750.000 ₫

#### Scenario: Dòng "Chuyến này không có"
- **WHEN** `PN-2026-091` có dòng Mâm đánh dấu "Chuyến này không có"
- **THEN** dòng đó góp 0 ₫ vào khoản

#### Scenario: Điều chỉnh giá trị không đổi phải trả
- **WHEN** phiếu điều chỉnh giá trị `ĐCG` sửa chi phí chuyến của `PN-2026-090` thêm 300.000 ₫ được duyệt
- **THEN** giá vốn của hàng trong chuyến đổi theo spec `stock-value-adjustments` **AND** khoản `PN-2026-090` vẫn phát sinh 26.500.000 ₫

### Requirement: Số phải trả tính ra, không lưu
Số phát sinh của khoản phải trả SHALL tính ra mỗi lần đọc từ dòng phiếu nhập và đơn giá dòng đơn, không lưu bản sao. Còn lại của khoản SHALL = phát sinh − Σ phân bổ còn hiệu lực (spec `supplier-payments`), không bao giờ âm.

#### Scenario: Khoản chưa trả
- **WHEN** `PN-2026-090` phát sinh 26.500.000 ₫ và chưa có phiếu chi nào trừ vào
- **THEN** khoản còn lại 26.500.000 ₫

#### Scenario: Phiếu chi bị hủy
- **WHEN** `PN-2026-090` đã được `PC-2026-045` trừ 26.500.000 ₫ rồi `PC-2026-045` bị hủy
- **THEN** khoản còn lại 26.500.000 ₫

### Requirement: Hạn trả của khoản phải trả
Hạn trả của khoản SHALL = ngày nhập của phiếu + số ngày được nợ của người bán **tại lúc ghi sổ phiếu** (0.2 #99), lưu trên phiếu nhập khi ghi sổ. Số ngày được nợ 0 SHALL cho hạn đúng ngày nhập ("trả ngay"). Đổi số ngày được nợ của người bán SHALL chỉ áp cho phiếu nhập ghi sổ sau đó. Phiếu nhập ghi sổ trước change này SHALL có hạn = ngày nhập.

#### Scenario: Người bán nợ 15 ngày
- **WHEN** Cty CP Thép Nam Sơn có số ngày được nợ 15 và phiếu nhập ghi sổ ngày 27/10/2026
- **THEN** hạn của khoản là 11/11/2026

#### Scenario: Mặc định trả ngay
- **WHEN** Anh Lê Văn Tâm có số ngày được nợ 0 và `PN-2026-090` ghi sổ ngày 04/11/2026
- **THEN** hạn của `PN-2026-090` là 04/11/2026

#### Scenario: Đổi số ngày chỉ áp phiếu sau
- **WHEN** Thép Nam Sơn có `PN-2026-080` ghi sổ 17/10/2026 khi được nợ 15 ngày (hạn 01/11/2026), rồi Kế toán đổi thành 30 ngày ngày 03/11/2026, rồi `PN-2026-095` ghi sổ 05/11/2026
- **THEN** `PN-2026-080` vẫn hạn 01/11/2026 **AND** `PN-2026-095` hạn 05/12/2026

### Requirement: Quá hạn phải trả tính theo ngày Việt Nam
Một khoản phải trả SHALL **quá hạn** khi còn lại > 0 và hạn **trước** hôm nay (ngày theo giờ Asia/Ho_Chi_Minh); số ngày quá hạn = hôm nay − hạn. Quá hạn SHALL tính mỗi lần đọc, không lưu. Tình hình một khoản SHALL là: "Đã trả đủ" (còn lại 0), "Quá hạn N ngày", "Hạn hôm nay", "Hạn mai", hoặc "Chưa đến hạn". Nợ quá hạn của người bán SHALL = tổng còn lại các khoản quá hạn, số ngày = số ngày quá hạn của khoản quá hạn có hạn sớm nhất.

#### Scenario: Trả ngay, cuối ngày nhập
- **WHEN** `PN-2026-091` còn 16.250.000 ₫, hạn 05/11/2026, và giờ là 05/11/2026 23:59 giờ Việt Nam (16:59 UTC)
- **THEN** khoản hiện "Hạn hôm nay", không quá hạn

#### Scenario: Qua 0 giờ
- **WHEN** giờ là 06/11/2026 00:00 giờ Việt Nam (05/11/2026 17:00 UTC)
- **THEN** `PN-2026-091` hiện "Quá hạn 1 ngày"

#### Scenario: Nợ quá hạn của một người bán
- **WHEN** hôm nay 06/11/2026, Anh Tâm còn `PN-2026-090` 26.500.000 ₫ hạn 04/11 và `PN-2026-091` 16.250.000 ₫ hạn 05/11
- **THEN** nợ quá hạn của Anh Tâm là 42.750.000 ₫, 2 ngày

#### Scenario: Trả đủ sau hạn
- **WHEN** `PN-2026-087` hạn 22/10/2026 được trả đủ ngày 25/10/2026
- **THEN** khoản hiện "Đã trả đủ" và không tính vào nợ quá hạn

### Requirement: Thứ tự cố định của các khoản phải trả
Các khoản của một người bán SHALL có một thứ tự cố định dùng cho phân bổ và hiển thị: hạn sớm trước; trùng hạn thì ngày nhập sớm trước; rồi mã phiếu nhập tăng dần.

#### Scenario: Hai phiếu cùng ngày
- **WHEN** Anh Tâm có `PN-2026-092` và `PN-2026-091` cùng nhập 05/11/2026, cùng hạn 05/11/2026
- **THEN** `PN-2026-091` đứng trước `PN-2026-092`

#### Scenario: Hạn quyết định trước ngày nhập
- **WHEN** một người bán có `PN-2026-080` nhập 17/10 hạn 01/11 (được nợ 15 ngày), rồi số ngày được nợ đổi về 0 và `PN-2026-082` nhập 20/10 hạn 20/10
- **THEN** `PN-2026-082` đứng trước `PN-2026-080`

### Requirement: Thanh tab Phải thu / Phải trả
Màn Công nợ SHALL có thanh tab **Phải thu** (D14, `/receivables`) và **Phải trả** (D14c, `/payables`) ở đầu trang, tab đang mở được đánh dấu. Mỗi tab SHALL chỉ hiện cho người có quyền xem của tab đó. Menu Công nợ SHALL mở tab đầu tiên người dùng được xem và SHALL được đánh dấu đang chọn ở cả hai đường dẫn.

#### Scenario: Kế toán chuyển tab
- **WHEN** `thuha` (Kế toán) đang ở D14 và bấm tab "Phải trả"
- **THEN** trình duyệt mở `/payables` **AND** tab "Phải trả" được đánh dấu **AND** mục menu "Công nợ" vẫn đang chọn

### Requirement: Màn D14c theo người bán
D14c SHALL hiện "Số liệu đến hết ngày <hôm nay>", câu giải thích cách tính (số thực nhận × đơn giá trên đơn, kg theo cân thực tế, không gồm cước xe, bốc xếp, chưa VAT) và bốn ô: **Tổng phải trả** (số người bán còn phải trả), **Quá hạn** (số người bán, số ngày lâu nhất), **Đến hạn trong 7 ngày** (hạn từ hôm nay tới hôm nay + 7), **Đã ứng trước** (kèm "tự trừ khi nhập"). Ô Đến hạn và ô Ứng trước SHALL ghi tên người bán khi chỉ có một, không thì số người bán.

#### Scenario: Bốn ô tổng
- **WHEN** hôm nay 06/11/2026; Hưng Thịnh còn 186.400.000 ₫ hạn 20/11; Anh Tâm quá hạn 42.750.000 ₫ (2 ngày); Thép Nam Sơn còn 64.800.000 ₫ trong đó quá hạn 12.300.000 ₫ (5 ngày) và 52.500.000 ₫ hạn 11/11; Chị Hoa không nợ, ứng trước 10.000.000 ₫
- **THEN** ô Tổng phải trả "293.950.000 ₫ · 3 người bán" **AND** ô Quá hạn "55.050.000 ₫ · 2 người bán · lâu nhất 5 ngày" **AND** ô Đến hạn trong 7 ngày "52.500.000 ₫ · Thép Nam Sơn" **AND** ô Đã ứng trước "10.000.000 ₫ · Chị Hoa · tự trừ khi nhập"

### Requirement: Bảng người bán trên D14c
Bảng người bán SHALL có cột: người bán (tên; loại · "trả ngay" hoặc "nợ N ngày"), còn phải trả, trong đó quá hạn, đã ứng trước, tình hình. Tình hình SHALL theo luật của D14 (0.2 #104): "Quá hạn N ngày"; không quá hạn mà khoản hạn sớm nhất trong 7 ngày tới thì "Hạn dd/mm"; còn nợ nhưng hạn xa hơn thì "Chưa đến hạn"; chỉ có ứng trước thì "Đã ứng trước"; còn lại "Hết nợ". Dưới bảng SHALL có câu "Số ngày được nợ đặt ở danh mục người bán (D16), mặc định 0 = trả ngay khi nhập."

#### Scenario: Hạn xa hơn 7 ngày
- **WHEN** hôm nay 06/11/2026 và Hưng Thịnh (nợ 30 ngày) chỉ còn khoản hạn 20/11/2026
- **THEN** dòng Hưng Thịnh hiện "Công ty · nợ 30 ngày", tình hình "Chưa đến hạn"

#### Scenario: Ranh giới 7 ngày
- **WHEN** hôm nay 06/11/2026 và khoản hạn sớm nhất của một người bán là 13/11/2026 (còn 7 ngày)
- **THEN** tình hình là "Hạn 13/11" **AND** nếu hạn là 14/11/2026 (còn 8 ngày) thì tình hình là "Chưa đến hạn"

#### Scenario: Người bán chỉ có ứng trước
- **WHEN** Chị Hoa (cá nhân, trả ngay) không còn khoản và đã ứng trước 10.000.000 ₫
- **THEN** dòng Chị Hoa hiện "Cá nhân · trả ngay", còn phải trả 0 ₫, đã ứng trước 10.000.000 ₫, tình hình "Đã ứng trước"

### Requirement: Lọc, tìm và phân trang D14c
Bảng người bán SHALL lọc được **Còn phải trả** (mặc định), **Quá hạn**, **Có ứng trước**, **Tất cả** (nhà cung cấp đang dùng, và nhà cung cấp ngừng dùng đã có phiếu nhập hoặc phiếu chi), kèm số đếm; tìm theo tên hoặc mã (không phân biệt dấu); sắp quá hạn nhiều trước, rồi còn phải trả nhiều trước, rồi tên; 50 người bán một trang. Lọc, tìm, trang, người bán đang chọn, "Ẩn khoản đã trả đủ" SHALL nằm trên URL. Bốn ô tổng SHALL tính trên mọi người bán.

#### Scenario: Lọc quá hạn
- **WHEN** `thuha` chọn "Quá hạn (2)"
- **THEN** bảng có Anh Tâm (42.750.000 ₫) rồi Thép Nam Sơn (12.300.000 ₫) **AND** URL có `filter=overdue`

#### Scenario: Tìm không dấu
- **WHEN** `thuha` gõ "nam son"
- **THEN** bảng chỉ còn Cty CP Thép Nam Sơn

#### Scenario: Nhiều người bán
- **WHEN** có 120 người bán còn phải trả
- **THEN** trang 1 có 50 người bán, có nút sang trang 2 và 3 **AND** bốn ô tổng tính trên cả 120

### Requirement: Các khoản của một người bán trên D14c
Chọn một người bán SHALL hiện: "Trả ngay khi nhập" hoặc "Nợ N ngày", số đơn mua có khoản, số tài khoản (dạng che) và ngân hàng nếu có; bảng các khoản theo thứ tự cố định với cột phiếu nhập ("Nhập dd/mm · <mã đơn> · chuyến N"), hàng, tiền hàng, đã trả, còn lại, hạn, tình hình; dòng cộng "Còn phải trả <tên>". Ô "Ẩn khoản đã trả đủ" SHALL bật mặc định. Mã phiếu nhập SHALL mở màn phiếu, mã đơn mở D3b.

#### Scenario: Ẩn khoản đã trả đủ
- **WHEN** `thuha` chọn Anh Tâm có `PN-2026-087` đã trả đủ, `PN-2026-090` và `PN-2026-091` còn nợ
- **THEN** bảng hiện 2 khoản và dòng "Còn phải trả Anh Tâm 42.750.000 ₫" **AND** bỏ chọn ô thì hiện cả `PN-2026-087` với tình hình "Đã trả đủ"

#### Scenario: Khoản trả một phần
- **WHEN** `PN-2026-091` phát sinh 16.250.000 ₫ đã trả 3.500.000 ₫, hôm nay 06/11/2026
- **THEN** dòng hiện đã trả 3.500.000 ₫, còn lại 12.750.000 ₫, hạn 05/11, "Quá hạn 1 ngày"

### Requirement: Cột hàng của khoản phải trả
Cột hàng SHALL tóm tắt tối đa hai dòng của phiếu dạng "số + đơn vị + tên" (dòng kg thêm "cân thực tế"), thêm "và N mã khác" khi phiếu có nhiều dòng hơn.

#### Scenario: Phiếu nhiều dòng
- **WHEN** một phiếu có 4 dòng đã đếm: 650 chéo 1,7m cũ, 120 khung 1,7m cũ, 80 mâm, 40 cây chống
- **THEN** cột hàng hiện "650 chéo 1,7m cũ, 120 khung 1,7m cũ và 2 mã khác"

#### Scenario: Hàng của phiếu theo kg
- **WHEN** `PN-2026-090` chỉ có dòng sắt ống cân 3.312,5 kg
- **THEN** cột hàng hiện "3.312,5 kg sắt ống cân thực tế"

### Requirement: Che CCCD và số tài khoản trên D14c
D14c, API của D14c và file Excel phải trả SHALL chỉ có CCCD và số tài khoản của người bán ở dạng che như D16 (`•••• •••• 2345`, `•••• 5678`); số đầy đủ SHALL không có trong phản hồi hay file.

#### Scenario: Người bán cá nhân có CCCD
- **WHEN** Anh Tâm có CCCD `001203012345`, tài khoản `0451000312345678` tại Vietcombank, và `thuha` mở Anh Tâm trên D14c
- **THEN** màn hiện "STK •••• 5678 · Vietcombank" **AND** chuỗi `001203012345` và `0451000312345678` không có trong phản hồi `GET /api/payables/suppliers/{id}`

### Requirement: Xuất Excel phải trả
"Xuất Excel" trên D14c SHALL tải `cong-no-phai-tra-<YYYY-MM-DD>.xlsx` theo **bộ lọc và ô tìm đang chọn**, không theo trang, gồm ba sheet "Theo người bán", "Các khoản" (cả khoản đã trả đủ), "Phiếu chi" (cả phiếu đã hủy), cột như design D8. Tiền SHALL là ô số nguyên, ngày là ô ngày. Xuất SHALL không ghi nhật ký.

#### Scenario: Cột của một khoản
- **WHEN** hôm nay 06/11/2026, `thuha` xuất Excel và sheet "Các khoản" có dòng `PN-2026-090`
- **THEN** dòng đó có người bán "Anh Lê Văn Tâm", đơn `PO-2026-052`, chuyến 1, ngày nhập 04/11/2026, tiền hàng 26500000, đã trả 0, còn lại 26500000, hạn 04/11/2026, quá hạn 2

#### Scenario: Xuất theo bộ lọc
- **WHEN** `thuha` đang lọc "Quá hạn" rồi bấm Xuất Excel
- **THEN** sheet "Theo người bán" có đúng 2 dòng Anh Tâm, Thép Nam Sơn **AND** sheet "Các khoản", "Phiếu chi" chỉ có của hai người bán đó

#### Scenario: Tiền là số, CCCD đã che
- **WHEN** mở file bằng Excel
- **THEN** ô 26.500.000 là số 26500000 (không phải chữ, không có phần lẻ) **AND** cột CCCD của Anh Tâm là `•••• •••• 2345`

### Requirement: Quyền xem phải trả
Chỉ Giám đốc và Kế toán SHALL xem D14c, các khoản, phiếu chi và xuất Excel phải trả (`payables.view`), kiểm ở server. Kinh doanh, Thủ kho, Xưởng SHALL bị từ chối (403) ở API, bị chặn khi mở `/payables`, và không thấy tab Phải trả.

#### Scenario: Kinh doanh gọi API
- **WHEN** `quocbao` (Kinh doanh) gọi `GET /api/payables/suppliers`
- **THEN** hệ thống trả 403 và không có số liệu

#### Scenario: Thủ kho xuất Excel
- **WHEN** `vantung` (Thủ kho) gọi `GET /api/payables/export`
- **THEN** hệ thống trả 403

#### Scenario: Giám đốc xem
- **WHEN** Giám đốc mở `/payables`
- **THEN** D14c hiện đủ bốn ô, bảng người bán và nút Xuất Excel
