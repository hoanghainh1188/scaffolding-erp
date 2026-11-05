## ADDED Requirements

### Requirement: Bốn loại khoản nợ của nhà thầu
Công nợ phải thu của nhà thầu SHALL gồm các khoản đọc từ chứng từ gốc, không lưu bản sao số tiền: **kỳ tiền thuê đã chốt** (phải thu đã lưu, tách thuê + điều chỉnh, cước, VAT); **phiếu xuất bán đã ghi sổ** (tiền hàng + cước + VAT); **phiếu đền bù đã duyệt** và **phiếu mua lại đã duyệt** (tiền đã lưu khi duyệt). Chứng từ chưa chốt, chưa ghi sổ, chưa duyệt hay đã từ chối SHALL không là khoản nợ. Còn lại = phát sinh − tổng phân bổ còn hiệu lực. Khoản 0 ₫ SHALL coi như đã thu đủ.

#### Scenario: Các khoản của Minh Phát
- **WHEN** hôm nay 05/11/2026, Minh Phát có kỳ 10/2026 của `082026/ANPHAT-MINHPHAT` đã chốt 22.800.000 ₫, `PX-2026-041` bán đã ghi sổ 58.400.000 ₫, `ĐB-2026-009` đã duyệt 4.250.000 ₫, `MLA-2026-003` đã duyệt 6.000.000 ₫, và kỳ 11/2026 chưa chốt
- **THEN** D14 liệt kê bốn khoản đó **AND** không có dòng kỳ 11/2026 **AND** ghi chú "Kỳ 11/2026 chưa chốt nên chưa vào sổ."

#### Scenario: Phiếu đền bù bị từ chối
- **WHEN** `ĐB-2026-011` 1.200.000 ₫ bị Giám đốc từ chối
- **THEN** công nợ của nhà thầu không có khoản `ĐB-2026-011`

#### Scenario: Đền bù được giảm hết
- **WHEN** `ĐB-2026-012` được duyệt với giảm trừ bằng tổng, tiền phải thu 0 ₫
- **THEN** khoản `ĐB-2026-012` hiện "Đã thu đủ" và không làm tăng số đang nợ

#### Scenario: Kỳ có tổng âm
- **WHEN** kỳ 03/2027 đã chốt với tiền thuê 20.000 ₫ và điều chỉnh −70.000 ₫, phải thu −50.000 ₫
- **THEN** kỳ đó là **khoản giảm nợ** 50.000 ₫ của nhà thầu, được trừ như tiền trả trước (spec `customer-receipts`), không hiện là nợ

### Requirement: VAT của hàng bán theo ngày giao
Phiếu xuất bán SHALL cộng VAT khi bản hợp đồng tại **ngày giao** bật "Khách lấy hóa đơn VAT": VAT = (tiền hàng + cước) × thuế suất của bản đó, làm tròn tới 1 ₫ (nửa lên). Bản không bật VAT thì VAT 0 ₫. Phiếu đền bù và phiếu mua lại SHALL không cộng VAT, kể cả khi hợp đồng bật VAT (0.2 #84). Kỳ tiền thuê đã chốt dùng VAT đã lưu của kỳ, không tính lại.

#### Scenario: Bán có VAT 8 %
- **WHEN** `PX-2026-041` giao 02/10/2026 cho `102026/ANPHAT-MINHPHAT` (bản tại 02/10 bật VAT 8 %), tiền hàng 52.574.074 ₫, cước 1.500.000 ₫
- **THEN** VAT là 4.325.926 ₫ **AND** số phát sinh 58.400.000 ₫ **AND** D14 hiện "gồm VAT 4.325.926 ₫"

#### Scenario: Phụ lục bật VAT sau ngày giao
- **WHEN** hợp đồng bán không VAT, `PX-2026-050` giao 10/11/2026 tiền hàng 10.000.000 ₫, rồi phụ lục hiệu lực 20/11/2026 bật VAT 10 %
- **THEN** `PX-2026-050` vẫn 10.000.000 ₫ "không VAT" **AND** phiếu xuất bán giao từ 20/11/2026 cộng VAT 10 %

#### Scenario: Đền bù của hợp đồng có VAT
- **WHEN** hợp đồng thuê bật VAT 8 % và `ĐB-2026-009` được duyệt 4.250.000 ₫
- **THEN** khoản `ĐB-2026-009` là 4.250.000 ₫ "không VAT"

#### Scenario: Phiếu xuất bán không có cước
- **WHEN** khách tự chở, `PX-2026-052` tiền hàng 3.000.000 ₫, bản tại ngày giao VAT 10 %
- **THEN** VAT 300.000 ₫, số phát sinh 3.300.000 ₫

### Requirement: Hạn trả của từng khoản
Hạn trả SHALL là: kỳ tiền thuê = hạn đã lưu khi chốt (ngày cuối kỳ + số ngày được nợ, 0.2 #78); phiếu xuất bán = ngày giao + số ngày được nợ của bản hợp đồng tại ngày giao; phiếu đền bù, phiếu mua lại = hạn đã lưu khi duyệt (ngày duyệt + số ngày được nợ). Hạn SHALL không đổi sau khi khoản phát sinh.

#### Scenario: Hạn của hàng bán
- **WHEN** bản hợp đồng tại 02/10/2026 cho nợ 15 ngày và `PX-2026-041` giao 02/10/2026
- **THEN** hạn của `PX-2026-041` là 17/10/2026

#### Scenario: Hạn của kỳ tiền thuê
- **WHEN** kỳ 10/2026 của `082026/ANPHAT-MINHPHAT` đã chốt với hạn 15/11/2026
- **THEN** D14 hiện hạn 15/11 cho khoản đó

### Requirement: Quá hạn tính theo ngày Việt Nam
Một khoản SHALL **quá hạn** khi còn lại > 0 và hạn **trước** hôm nay (ngày theo giờ Asia/Ho_Chi_Minh); số ngày quá hạn = hôm nay − hạn. Quá hạn SHALL tính mỗi lần đọc, không lưu. Tình hình một khoản SHALL là: "Đã thu đủ" (còn lại 0), "Quá hạn N ngày", "Hạn hôm nay", "Hạn mai", hoặc "Chưa đến hạn".

#### Scenario: Ranh giới 0 giờ
- **WHEN** `ĐB-2026-009` còn 4.250.000 ₫, hạn 06/11/2026, và giờ là 06/11/2026 23:59 giờ Việt Nam (16:59 UTC)
- **THEN** khoản hiện "Hạn hôm nay", không quá hạn

#### Scenario: Qua 0 giờ
- **WHEN** giờ là 07/11/2026 00:00 giờ Việt Nam (06/11/2026 17:00 UTC)
- **THEN** khoản hiện "Quá hạn 1 ngày"

#### Scenario: Hạn mai
- **WHEN** hôm nay 05/11/2026 và hạn 06/11/2026
- **THEN** khoản hiện "Hạn mai"

#### Scenario: Đã trả đủ sau hạn
- **WHEN** `PX-2026-041` hạn 17/10/2026 được trả đủ ngày 20/10/2026
- **THEN** khoản hiện "Đã thu đủ" và không tính vào nợ quá hạn

### Requirement: Số nợ quá hạn của nhà thầu
Nợ quá hạn của nhà thầu SHALL = tổng còn lại của các khoản quá hạn; số ngày SHALL = số ngày quá hạn của khoản quá hạn có hạn sớm nhất. Không có khoản quá hạn thì 0 ₫ và 0 ngày. Màn duyệt hợp đồng, phụ lục, phiếu đền bù, phiếu mua lại SHALL đọc số này (0.2 #15) thay cho số 0 trước đây.

#### Scenario: Minh Phát quá hạn
- **WHEN** hôm nay 05/11/2026 và Minh Phát chỉ có `PX-2026-041` còn 21.500.000 ₫ hạn 17/10/2026 là quá hạn
- **THEN** nợ quá hạn của Minh Phát là 21.500.000 ₫, 19 ngày

#### Scenario: Duyệt hợp đồng thấy số thật
- **WHEN** Giám đốc mở thanh duyệt hợp đồng `112026/ANPHAT-MINHPHAT` ngày 05/11/2026
- **THEN** thanh duyệt hiện "Nhà thầu đang nợ quá hạn 21.500.000 ₫ (19 ngày)" **AND** duyệt không ghi lý do bị từ chối

#### Scenario: Hai khoản quá hạn
- **WHEN** hôm nay 05/11/2026, khoản A còn 1.000.000 ₫ hạn 10/10/2026 và khoản B còn 2.000.000 ₫ hạn 01/11/2026
- **THEN** nợ quá hạn là 3.000.000 ₫, 26 ngày

### Requirement: Thứ tự cố định của các khoản
Các khoản của một nhà thầu SHALL có một thứ tự cố định dùng cho phân bổ và hiển thị: hạn sớm trước; trùng hạn thì ngày phát sinh sớm trước; rồi loại theo thứ tự kỳ tiền thuê, phiếu xuất bán, phiếu đền bù, phiếu mua lại; rồi số hợp đồng; rồi mã chứng từ (hoặc tháng của kỳ).

#### Scenario: Hai kỳ cùng hạn
- **WHEN** kỳ 10/2026 của `082026/ANPHAT-MINHPHAT` và của `092026/ANPHAT-MINHPHAT` cùng hạn 15/11/2026, cùng ngày phát sinh 31/10/2026
- **THEN** khoản của `082026/ANPHAT-MINHPHAT` đứng trước

#### Scenario: Cùng hạn khác loại
- **WHEN** kỳ 10/2026 hạn 15/11/2026 phát sinh 31/10/2026 và `ĐB-2026-010` hạn 15/11/2026 phát sinh 31/10/2026
- **THEN** khoản kỳ 10/2026 đứng trước `ĐB-2026-010`

### Requirement: Màn D14 theo nhà thầu
D14 SHALL hiện "Số liệu đến hết ngày <hôm nay>" và bốn ô: Tổng phải thu (số nhà thầu đang nợ), Nợ quá hạn (số nhà thầu, số ngày lâu nhất), Đến hạn trong 7 ngày (hạn từ hôm nay tới hôm nay + 7), Tiền trả trước đang giữ. Bảng nhà thầu SHALL có cột: nhà thầu, thuê & cước, bán, đền bù và mua lại, đang nợ, trong đó quá hạn, trả trước, tình hình ("Quá hạn N ngày", "Hạn dd/mm" khi có khoản đến hạn trong 7 ngày, "Chưa đến hạn", "Trả trước", "Hết nợ"); số đã gồm VAT.

#### Scenario: Tình hình hạn gần
- **WHEN** hôm nay 05/11/2026 và Thành Công nợ 74.500.000 ₫, khoản sớm nhất hạn 10/11/2026
- **THEN** dòng Thành Công hiện tình hình "Hạn 10/11"

### Requirement: Lọc, tìm và phân trang D14
Bảng nhà thầu SHALL lọc được Đang nợ (mặc định), Quá hạn, Có trả trước, Tất cả, kèm số đếm; tìm theo tên hoặc mã nhà thầu; sắp theo quá hạn nhiều trước rồi đang nợ nhiều trước; phân trang 50 nhà thầu. Lọc, tìm, trang và nhà thầu đang chọn SHALL nằm trên URL.

#### Scenario: Bốn ô tổng
- **WHEN** hôm nay 05/11/2026, bốn nhà thầu đang nợ tổng 320.900.000 ₫, Sông Hồng quá hạn 168.200.000 ₫ (36 ngày), Minh Phát quá hạn 21.500.000 ₫ (19 ngày), Đông Á trả trước 5.000.000 ₫
- **THEN** ô Tổng phải thu "320.900.000 ₫ · 4 nhà thầu đang nợ" **AND** ô Nợ quá hạn "189.700.000 ₫ · 2 nhà thầu · lâu nhất 36 ngày" **AND** ô Tiền trả trước "5.000.000 ₫"

#### Scenario: Lọc quá hạn
- **WHEN** `thuha` chọn lọc "Quá hạn (2)"
- **THEN** bảng có Sông Hồng rồi Minh Phát **AND** URL có `filter=overdue`

#### Scenario: Nhiều nhà thầu
- **WHEN** có 130 nhà thầu đang nợ
- **THEN** trang 1 có 50 nhà thầu, có nút sang trang 2 và 3 **AND** bốn ô tổng vẫn tính trên cả 130

#### Scenario: Nhà thầu chỉ có trả trước
- **WHEN** Đông Á không còn khoản nợ và có tiền trả trước 5.000.000 ₫
- **THEN** Đông Á không nằm ở lọc "Đang nợ" **AND** ở lọc "Có trả trước" hiện đang nợ 0 ₫, trả trước 5.000.000 ₫, tình hình "Trả trước"

### Requirement: Các khoản của một nhà thầu trên D14
Chọn một nhà thầu SHALL hiện: số ngày được nợ mặc định, số hợp đồng; bảng các khoản theo thứ tự cố định với chứng từ, loại, ngày phát sinh, hợp đồng, nội dung, phát sinh (kèm "gồm VAT x ₫" hoặc "không VAT"), đã trừ, còn lại, hạn, tình hình; dòng cộng "đang nợ". Ô "Ẩn khoản đã thu đủ" SHALL bật mặc định. Mỗi chứng từ SHALL mở được màn gốc (D7 kỳ đã chốt, phiếu xuất, D8, D6c).

#### Scenario: Ẩn khoản đã thu đủ
- **WHEN** `thuha` chọn Minh Phát có 7 khoản, 2 khoản đã thu đủ
- **THEN** bảng hiện 5 khoản và dòng "Minh Phát đang nợ 69.050.000 ₫" **AND** bỏ chọn "Ẩn khoản đã thu đủ" thì hiện đủ 7 khoản

#### Scenario: Khoản trả một phần
- **WHEN** `PX-2026-041` phát sinh 58.400.000 ₫ đã trừ 36.900.000 ₫
- **THEN** dòng hiện đã trừ 36.900.000 ₫, còn lại 21.500.000 ₫, hạn 17/10, "Quá hạn 19 ngày"

### Requirement: Cọc và bảo lãnh trên D14
Với nhà thầu đang chọn, D14 SHALL hiện từng hợp đồng chưa thanh lý, chưa hủy có cọc: cọc tiền thỏa thuận (bản đang áp dụng hôm nay), đã nhận (phiếu cọc còn hiệu lực, kèm mã), tình hình "Đã nhận đủ", "Còn thiếu x ₫" hoặc "Chưa nhận"; từng bảo lãnh với cảnh báo theo luật "Cảnh báo bảo lãnh" của spec `contracts`. Bảo lãnh của mọi nhà thầu còn ≤ 30 ngày SHALL hiện thành băng nhắc ở đầu D14. Hợp đồng Đang thực hiện SHALL có liên kết "Thanh lý hợp đồng" cho người có quyền.

#### Scenario: Đã nhận đủ cọc
- **WHEN** `082026/ANPHAT-MINHPHAT` có cọc tiền 50.000.000 ₫ và `PT-2026-104` nộp cọc 50.000.000 ₫ ngày 05/08/2026
- **THEN** khối cọc hiện "Cọc tiền 50.000.000 ₫ · Đã nhận đủ 05/08 (PT-2026-104)"

#### Scenario: Băng nhắc bảo lãnh
- **WHEN** hôm nay 05/11/2026 và chứng thư `0457/BL` của `092026/ANPHAT-MINHPHAT` hết hạn 30/11/2026
- **THEN** đầu D14 hiện "Bảo lãnh sắp hết hạn: chứng thư 0457/BL của 092026/ANPHAT-MINHPHAT hết hạn 30/11/2026 (còn 25 ngày). Nhắc khách gia hạn."

### Requirement: Xuất Excel công nợ
"Xuất Excel" trên D14 SHALL tải `cong-no-<YYYY-MM-DD>.xlsx` theo **bộ lọc và ô tìm đang chọn**, không theo trang, gồm ba sheet: "Theo nhà thầu", "Các khoản" (cả khoản đã thu đủ; cột nhà thầu, hợp đồng, chứng từ, loại, ngày phát sinh, thuê, cước, bán, đền bù, mua lại, VAT, phát sinh, đã thu, còn nợ, hạn, số ngày quá hạn), "Phiếu thu" (cả phiếu đã hủy). Tiền SHALL là ô số nguyên, ngày là ô ngày. Cột thuê của kỳ = tiền thuê + điều chỉnh. Xuất SHALL không ghi nhật ký.

#### Scenario: Cột tách loại
- **WHEN** `thuha` xuất Excel và sheet "Các khoản" có dòng `PX-2026-041`
- **THEN** dòng đó có bán 52.574.074, cước 1.500.000, VAT 4.325.926, phát sinh 58.400.000, đã thu 36.900.000, còn nợ 21.500.000, hạn 17/10/2026, quá hạn 19, các cột thuê, đền bù, mua lại bằng 0

#### Scenario: Xuất theo bộ lọc
- **WHEN** `thuha` đang lọc "Quá hạn" ở trang 1 rồi bấm Xuất Excel
- **THEN** sheet "Theo nhà thầu" có đúng 2 dòng Sông Hồng, Minh Phát **AND** sheet "Các khoản" chỉ có khoản của hai nhà thầu đó

#### Scenario: Tiền là số
- **WHEN** mở file bằng Excel
- **THEN** ô 58.400.000 là số 58400000 (không phải chữ, không có phần lẻ)

### Requirement: Quyền xem công nợ
Chỉ Giám đốc và Kế toán SHALL xem D14, các khoản, phiếu thu và xuất Excel công nợ (`receivables.view`). Kinh doanh, Thủ kho, Xưởng SHALL bị từ chối (403) ở API và không thấy menu Công nợ. Số nợ quá hạn trên màn duyệt hợp đồng, đền bù, mua lại SHALL vẫn hiện cho người xem màn đó.

#### Scenario: Kinh doanh mở D14
- **WHEN** `quocbao` (Kinh doanh) gọi `GET /api/receivables/customers`
- **THEN** hệ thống trả 403 và không có số liệu

#### Scenario: Kinh doanh xem cảnh báo trên hợp đồng
- **WHEN** `quocbao` mở D5 hợp đồng Chờ duyệt của Minh Phát
- **THEN** ô kiểm tra hiện "Nhà thầu đang nợ quá hạn 21.500.000 ₫ (19 ngày)"
