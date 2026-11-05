## ADDED Requirements

### Requirement: Phiếu thu của nhà thầu
Kế toán hoặc Giám đốc SHALL ghi được phiếu thu cho một nhà thầu với: số tiền (> 0 ₫, số nguyên), ngày thu (không sau hôm nay, giờ Việt Nam), hình thức (Tiền mặt hoặc Chuyển khoản), loại (**Trả nợ** hoặc **Nộp cọc tiền**), ghi chú tùy chọn (tối đa 500 ký tự). Phiếu SHALL có mã `PT-YYYY-NNN` tự sinh theo năm của ngày ghi, đếm qua bảng đếm chứng từ, không trùng, không dùng lại số. Phiếu SHALL lưu người ghi và giờ ghi. Một lần bấm gửi SHALL chỉ tạo một phiếu (mã yêu cầu chống gửi lặp).

#### Scenario: Ghi phiếu thu chuyển khoản
- **WHEN** hôm nay 05/11/2026 và `thuha` ghi phiếu thu Trả nợ 30.000.000 ₫ chuyển khoản ngày 05/11/2026 cho Minh Phát, phiếu cuối năm 2026 là `PT-2026-131`
- **THEN** phiếu `PT-2026-132` được lưu với người ghi `thuha`

#### Scenario: Ngày thu sau hôm nay
- **WHEN** hôm nay 05/11/2026 và `thuha` đặt ngày thu 06/11/2026
- **THEN** hệ thống từ chối với "Ngày thu không được sau hôm nay (05/11/2026)." và không lưu

#### Scenario: Số tiền 0
- **WHEN** `thuha` ghi phiếu thu 0 ₫
- **THEN** hệ thống từ chối với "Số tiền phải lớn hơn 0 ₫." và không lưu

#### Scenario: Bấm hai lần
- **WHEN** mạng chậm và cùng một form gửi lệnh ghi hai lần với cùng mã yêu cầu
- **THEN** chỉ có một phiếu thu **AND** lần gửi thứ hai nhận lại phiếu đã tạo

### Requirement: Trả nợ tự trừ khoản đến hạn sớm nhất trước
Phiếu Trả nợ không chỉ định khoản SHALL trừ lần lượt vào các khoản còn nợ của nhà thầu theo thứ tự cố định (spec `receivables`), mỗi khoản trừ tối đa số còn lại, đến khi hết tiền (0.2 #19). Mỗi lần trừ SHALL lưu thành một dòng phân bổ (phiếu, khoản, số tiền) không sửa, không xóa. Form SHALL xem trước khoản nào bị trừ bao nhiêu và số còn nợ sau khi ghi.

#### Scenario: Trừ ba khoản theo hạn
- **WHEN** hôm nay 05/11/2026, Minh Phát còn nợ `PX-2026-041` 21.500.000 ₫ (hạn 17/10), `ĐB-2026-009` 4.250.000 ₫ (hạn 06/11), kỳ 10/2026 `082026` 22.800.000 ₫ và kỳ 10/2026 `092026` 14.500.000 ₫ (cùng hạn 15/11), `MLA-2026-003` 6.000.000 ₫ (hạn 18/11), và `thuha` ghi phiếu Trả nợ 30.000.000 ₫
- **THEN** phiếu trừ `PX-2026-041` 21.500.000 ₫, `ĐB-2026-009` 4.250.000 ₫, kỳ 10/2026 `082026` 4.250.000 ₫ **AND** kỳ 10/2026 `082026` còn 18.550.000 ₫ **AND** form đã hiện "Sau khi ghi, Minh Phát còn nợ 39.050.000 ₫."

#### Scenario: Trả vừa đủ
- **WHEN** nhà thầu chỉ nợ một khoản 12.000.000 ₫ và trả 12.000.000 ₫
- **THEN** khoản đó "Đã thu đủ" và tiền trả trước 0 ₫

### Requirement: Kế toán chỉ định khoản khác
Khi khách chỉ định trả khoản khác, người ghi SHALL chọn được các khoản và số trừ từng khoản (> 0, không quá số còn lại của khoản, các khoản thuộc nhà thầu đó). Tổng số chỉ định SHALL không quá số tiền phiếu. Phần còn lại sau chỉ định SHALL tự trừ theo thứ tự cố định, rồi mới thành tiền trả trước. Số chỉ định SHALL được kiểm lại trong transaction ghi; khoản đã bị trừ bởi phiếu khác thì từ chối.

#### Scenario: Khách trả kỳ mới trước
- **WHEN** Minh Phát nợ như ví dụ trên, khách chuyển 14.500.000 ₫ ghi rõ "trả kỳ 10/2026 Lê Văn Lương" và `thuha` chỉ định kỳ 10/2026 `092026` 14.500.000 ₫
- **THEN** kỳ 10/2026 `092026` "Đã thu đủ" **AND** `PX-2026-041` vẫn còn 21.500.000 ₫ quá hạn

#### Scenario: Chỉ định một phần, còn dư
- **WHEN** `thuha` ghi phiếu 10.000.000 ₫, chỉ định `MLA-2026-003` 6.000.000 ₫
- **THEN** phiếu trừ `MLA-2026-003` 6.000.000 ₫ rồi `PX-2026-041` 4.000.000 ₫

#### Scenario: Chỉ định quá số còn lại
- **WHEN** `ĐB-2026-009` còn 4.250.000 ₫ và `thuha` chỉ định 5.000.000 ₫ cho nó
- **THEN** hệ thống từ chối với "ĐB-2026-009 chỉ còn 4.250.000 ₫." và không lưu

#### Scenario: Khoản vừa được trừ bởi phiếu khác
- **WHEN** `thuha` mở form chỉ định `ĐB-2026-009` 4.250.000 ₫, trong lúc đó Giám đốc ghi phiếu khác trừ hết `ĐB-2026-009`, rồi `thuha` bấm ghi
- **THEN** hệ thống trả 409 với "ĐB-2026-009 đã được trừ đủ bởi phiếu khác. Bạn xem lại rồi ghi." và không lưu

### Requirement: Trả dư giữ làm tiền trả trước
Phần tiền phiếu Trả nợ còn lại sau khi trừ hết các khoản đang nợ SHALL là **tiền trả trước** của nhà thầu (0.2 #82). Tiền trả trước SHALL tính ra = tổng phiếu Trả nợ còn hiệu lực + khoản giảm nợ − tổng phân bổ từ chúng; không lưu số dư. Tiền trả trước SHALL không cấn với cọc và không trừ vào cọc khi thanh lý.

#### Scenario: Trả dư
- **WHEN** Đông Á nợ 12.000.000 ₫ và trả 17.000.000 ₫
- **THEN** khoản 12.000.000 ₫ "Đã thu đủ" **AND** Đông Á có tiền trả trước 5.000.000 ₫ **AND** form đã hiện "Trả dư 5.000.000 ₫ giữ làm tiền trả trước, tự trừ vào khoản phát sinh sau."

#### Scenario: Trả khi không nợ
- **WHEN** Đông Á không nợ khoản nào và ghi phiếu Trả nợ 3.000.000 ₫
- **THEN** tiền trả trước của Đông Á tăng 3.000.000 ₫

### Requirement: Tiền trả trước tự trừ khoản phát sinh sau
Khi một khoản nợ mới phát sinh (chốt kỳ tiền thuê, duyệt phiếu đền bù, duyệt phiếu mua lại, ghi sổ phiếu xuất bán), nếu nhà thầu có tiền trả trước, hệ thống SHALL trong **cùng transaction** trừ tiền trả trước vào các khoản còn nợ theo thứ tự cố định; nguồn trả trước dùng theo thứ tự phiếu cũ trước (ngày thu, rồi mã phiếu), khoản giảm nợ theo ngày cuối kỳ. Mỗi lần trừ SHALL lưu thành dòng phân bổ của phiếu nguồn. Khoản giảm nợ (kỳ có tổng âm) SHALL trừ như tiền trả trước ngay khi kỳ được chốt.

#### Scenario: Chốt kỳ trừ tiền trả trước
- **WHEN** Đông Á có tiền trả trước 5.000.000 ₫ (dư của `PT-2026-140`) và `thuha` chốt kỳ 11/2026 phải thu 8.000.000 ₫
- **THEN** kỳ 11/2026 đã trừ 5.000.000 ₫, còn lại 3.000.000 ₫ **AND** tiền trả trước của Đông Á 0 ₫ **AND** danh sách phiếu thu hiện `PT-2026-140` "đã trừ vào … Kỳ 11/2026 5.000.000 ₫"

#### Scenario: Trả trước lớn hơn khoản mới
- **WHEN** Đông Á có tiền trả trước 5.000.000 ₫ và Giám đốc duyệt `ĐB-2026-020` 1.200.000 ₫
- **THEN** `ĐB-2026-020` "Đã thu đủ" ngay khi duyệt **AND** tiền trả trước còn 3.800.000 ₫

#### Scenario: Khoản giảm nợ
- **WHEN** Đông Á nợ `PX-2026-060` 200.000 ₫ và kỳ 03/2027 được chốt với phải thu −50.000 ₫
- **THEN** `PX-2026-060` còn 150.000 ₫ **AND** tiền trả trước của Đông Á 0 ₫

### Requirement: Nộp cọc tiền
Phiếu Nộp cọc tiền SHALL ghi cho một hợp đồng của chính nhà thầu đó, ở trạng thái Đã duyệt hoặc Đang thực hiện, có cọc tiền thỏa thuận ở bản đang áp dụng hôm nay. Tổng cọc đã nhận (phiếu cọc còn hiệu lực) cộng phiếu mới SHALL không vượt tổng cọc tiền thỏa thuận. Phiếu cọc SHALL không trừ vào khoản nợ nào và không thành tiền trả trước; chỉ cấn trừ khi thanh lý (0.2 #40, spec `contract-settlement`).

#### Scenario: Nộp cọc
- **WHEN** `082026/ANPHAT-MINHPHAT` Đã duyệt có cọc tiền 50.000.000 ₫ và `thuha` ghi phiếu Nộp cọc tiền 50.000.000 ₫ tiền mặt ngày 05/08/2026
- **THEN** phiếu `PT-2026-104` được lưu **AND** công nợ của Minh Phát không đổi **AND** khối cọc hiện "Đã nhận đủ 05/08 (PT-2026-104)"

#### Scenario: Nộp vượt cọc thỏa thuận
- **WHEN** cọc tiền thỏa thuận 50.000.000 ₫, đã nhận 30.000.000 ₫, và `thuha` ghi phiếu cọc 25.000.000 ₫
- **THEN** hệ thống từ chối với "Hợp đồng 082026/ANPHAT-MINHPHAT còn nhận cọc tối đa 20.000.000 ₫ (thỏa thuận 50.000.000 ₫, đã nhận 30.000.000 ₫)." và không lưu

#### Scenario: Hợp đồng đã thanh lý
- **WHEN** `thuha` ghi phiếu cọc cho hợp đồng Thanh lý
- **THEN** hệ thống từ chối với "Hợp đồng đã thanh lý nên không nhận cọc." và không lưu

### Requirement: Phiếu thu không sửa, hủy có lý do
Phiếu thu SHALL không sửa được. Kế toán hoặc Giám đốc SHALL hủy được phiếu kèm lý do (1–500 ký tự) (0.2 #83). Hủy SHALL trong một transaction: ghi dòng hủy (lý do, người, giờ); mọi phân bổ từ phiếu đó hết hiệu lực nên các khoản đã trừ mở lại đúng số; rồi tiền trả trước còn lại tự trừ lại theo thứ tự cố định. Phiếu đã hủy, phân bổ cũ và dòng hủy SHALL vẫn giữ và xem được. Hủy hai lần, hoặc hủy phiếu cọc đã cấn trừ khi thanh lý, SHALL bị từ chối.

#### Scenario: Hủy mở lại hai khoản
- **WHEN** hôm nay 05/11/2026, `PT-2026-131` 60.000.000 ₫ đã trừ kỳ 09/2026 23.100.000 ₫ và `PX-2026-041` 36.900.000 ₫, và `thuha` hủy với lý do "Ghi nhầm nhà thầu"
- **THEN** kỳ 09/2026 còn 23.100.000 ₫ "Quá hạn 21 ngày" **AND** `PX-2026-041` còn 58.400.000 ₫ **AND** `PT-2026-131` hiện "Đã hủy · Ghi nhầm nhà thầu"

#### Scenario: Hủy phiếu có phần đã trừ từ trả trước
- **WHEN** `PT-2026-140` 17.000.000 ₫ đã trừ khoản 12.000.000 ₫ và (từ phần trả trước) kỳ 11/2026 5.000.000 ₫, và `thuha` hủy `PT-2026-140`
- **THEN** khoản 12.000.000 ₫ mở lại đủ 12.000.000 ₫ **AND** kỳ 11/2026 mở lại thêm 5.000.000 ₫ **AND** tiền trả trước của Đông Á 0 ₫

#### Scenario: Hủy rồi trả trước khác tự trừ lại
- **WHEN** Đông Á có tiền trả trước 2.000.000 ₫ từ `PT-2026-150` và `thuha` hủy `PT-2026-141` đã trừ kỳ 10/2026 3.000.000 ₫
- **THEN** kỳ 10/2026 bị trừ 2.000.000 ₫ từ `PT-2026-150`, còn 1.000.000 ₫ **AND** tiền trả trước 0 ₫

#### Scenario: Hủy không lý do
- **WHEN** `thuha` bấm Hủy `PT-2026-131` để trống lý do
- **THEN** hệ thống từ chối với "Bạn ghi lý do hủy phiếu thu." và phiếu giữ nguyên

#### Scenario: Hủy phiếu đã hủy
- **WHEN** `PT-2026-131` đã hủy và có lệnh hủy lần nữa
- **THEN** hệ thống từ chối với "Phiếu PT-2026-131 đã hủy lúc 10:02 05/11/2026 bởi Thu Hà." và không ghi thêm

#### Scenario: Hủy phiếu cọc đã cấn trừ
- **WHEN** `PT-2026-104` (cọc của `082026/ANPHAT-MINHPHAT`) đã cấn trừ khi thanh lý và `thuha` hủy nó
- **THEN** hệ thống từ chối với "Phiếu PT-2026-104 là cọc đã cấn trừ khi thanh lý 082026/ANPHAT-MINHPHAT nên không hủy được." và không đổi dữ liệu

### Requirement: Không trừ trùng khi ghi cùng lúc
Các lệnh làm đổi phân bổ của một nhà thầu (ghi phiếu thu, hủy phiếu thu, trừ tiền trả trước khi khoản mới phát sinh, thanh lý) SHALL chạy lần lượt cho cùng nhà thầu. Tổng phân bổ còn hiệu lực vào một khoản SHALL không bao giờ vượt số phát sinh; tổng phân bổ từ một phiếu SHALL không vượt số tiền phiếu.

#### Scenario: Hai phiếu thu cùng lúc
- **WHEN** Minh Phát chỉ nợ `ĐB-2026-009` 4.250.000 ₫ và `thuha`, Giám đốc cùng lúc ghi hai phiếu Trả nợ 4.250.000 ₫
- **THEN** đúng một phiếu trừ `ĐB-2026-009` 4.250.000 ₫ **AND** phiếu còn lại thành tiền trả trước 4.250.000 ₫ **AND** `ĐB-2026-009` đã trừ đúng 4.250.000 ₫

#### Scenario: Ghi phiếu thu trong lúc chốt kỳ
- **WHEN** Đông Á có tiền trả trước 5.000.000 ₫, `thuha` chốt kỳ 11/2026 (8.000.000 ₫) cùng lúc Giám đốc ghi phiếu Trả nợ 8.000.000 ₫
- **THEN** tổng đã trừ vào kỳ 11/2026 là 8.000.000 ₫ **AND** tiền trả trước còn lại của Đông Á là 5.000.000 ₫

### Requirement: Danh sách phiếu thu của nhà thầu
D14 SHALL liệt kê phiếu thu của nhà thầu đang chọn, mới nhất trước: mã, ngày thu, hình thức, người ghi, số tiền, đã trừ vào (từng khoản và số, hoặc "Cọc … · giữ riêng", hoặc "Trả trước x ₫"), trạng thái (còn hiệu lực / Đã hủy + lý do), nút Hủy cho người có quyền. Ghi chú dưới bảng SHALL nói "Phiếu thu không sửa. Ghi sai thì Kế toán hủy và ghi lý do: các khoản đã trừ mở lại, rồi lập phiếu mới."

#### Scenario: Phiếu trừ nhiều khoản
- **WHEN** `PT-2026-131` 60.000.000 ₫ trừ kỳ 09/2026 23.100.000 ₫ và `PX-2026-041` 36.900.000 ₫
- **THEN** dòng `PT-2026-131` hiện "Kỳ 09/2026 23.100.000 ₫ · PX-2026-041 36.900.000 ₫"

### Requirement: Quyền ghi và hủy phiếu thu
Chỉ Kế toán và Giám đốc SHALL ghi và hủy phiếu thu (`receipts.manage`), kiểm ở server. Người khác SHALL nhận 403 và không thấy form ghi, nút Hủy.

#### Scenario: Kinh doanh ghi phiếu thu
- **WHEN** `quocbao` (Kinh doanh) gọi lệnh ghi phiếu thu
- **THEN** hệ thống trả 403 và không lưu

#### Scenario: Giám đốc hủy phiếu thu
- **WHEN** Giám đốc hủy `PT-2026-118` với lý do "Trùng phiếu PT-2026-117"
- **THEN** phiếu Đã hủy và nhật ký ghi người hủy là Giám đốc
