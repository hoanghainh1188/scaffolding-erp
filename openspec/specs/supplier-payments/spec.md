# supplier-payments Specification

## Purpose
Phiếu chi cho người bán (Trả tiền hàng / Ứng trước): mã `PC-YYYY-NNN`, tự trừ khoản đến hạn sớm nhất trước hoặc khoản được chỉ định, phần dư thành tiền ứng trước tự trừ vào phiếu nhập sau, hủy có lý do; phiếu, phân bổ và dòng hủy chỉ ghi thêm.

## Requirements

### Requirement: Phiếu chi cho người bán
Kế toán hoặc Giám đốc SHALL ghi được phiếu chi cho một nhà cung cấp (kể cả đã ngừng dùng) với: số tiền (> 0 ₫, số nguyên), ngày chi (không sau hôm nay, giờ Việt Nam), hình thức (Tiền mặt / Chuyển khoản), loại (**Trả tiền hàng** / **Ứng trước**), ghi chú tùy chọn (≤ 500 ký tự). Mã `PC-YYYY-NNN` SHALL tự sinh theo năm của ngày ghi qua bảng đếm chứng từ, không trùng, không dùng lại. Phiếu SHALL lưu người ghi, giờ ghi. Một lần bấm gửi SHALL chỉ tạo một phiếu.

#### Scenario: Ghi phiếu chi tiền mặt
- **WHEN** hôm nay 06/11/2026, phiếu chi cuối năm 2026 là `PC-2026-044`, và `thuha` ghi phiếu Trả tiền hàng 42.750.000 ₫ tiền mặt ngày 06/11/2026 cho Anh Lê Văn Tâm
- **THEN** phiếu `PC-2026-045` được lưu với người ghi `thuha`

#### Scenario: Ngày chi sau hôm nay
- **WHEN** hôm nay 06/11/2026 và `thuha` đặt ngày chi 07/11/2026
- **THEN** hệ thống từ chối với "Ngày chi không được sau hôm nay (06/11/2026)." và không lưu

#### Scenario: Số tiền 0
- **WHEN** `thuha` ghi phiếu chi 0 ₫
- **THEN** hệ thống từ chối với "Số tiền phải lớn hơn 0 ₫." và không lưu

#### Scenario: Bấm hai lần
- **WHEN** mạng chậm và cùng một form gửi lệnh ghi hai lần với cùng mã yêu cầu
- **THEN** chỉ có một phiếu chi **AND** lần gửi thứ hai nhận lại phiếu đã tạo

### Requirement: Trả tiền hàng tự trừ khoản đến hạn sớm nhất trước
Phiếu Trả tiền hàng không chỉ định khoản SHALL trừ lần lượt vào các khoản còn phải trả của người bán theo thứ tự cố định (spec `payables`), mỗi khoản trừ tối đa số còn lại, đến khi hết tiền. Mỗi lần trừ SHALL lưu thành một dòng phân bổ (phiếu chi, phiếu nhập, số tiền) không sửa, không xóa. Form SHALL xem trước khoản nào bị trừ bao nhiêu, khoản nào "Hết nợ", và câu "Sau khi ghi, <tên> hết nợ." hoặc "Sau khi ghi, <tên> còn phải trả x ₫."

#### Scenario: Trừ hai khoản theo hạn
- **WHEN** hôm nay 06/11/2026, Anh Tâm còn `PN-2026-090` 26.500.000 ₫ (hạn 04/11) và `PN-2026-091` 16.250.000 ₫ (hạn 05/11), và `thuha` ghi phiếu Trả tiền hàng 30.000.000 ₫
- **THEN** phiếu trừ `PN-2026-090` 26.500.000 ₫ và `PN-2026-091` 3.500.000 ₫ **AND** `PN-2026-091` còn 12.750.000 ₫ **AND** form đã hiện "Sau khi ghi, Anh Tâm còn phải trả 12.750.000 ₫."

#### Scenario: Trả vừa đủ
- **WHEN** Anh Tâm còn 42.750.000 ₫ và `thuha` ghi phiếu 42.750.000 ₫
- **THEN** cả hai khoản "Đã trả đủ" **AND** tiền ứng trước 0 ₫ **AND** form đã hiện "Sau khi ghi, Anh Tâm hết nợ."

#### Scenario: Trùng hạn theo mã phiếu nhập
- **WHEN** `PN-2026-091` và `PN-2026-092` cùng nhập và cùng hạn 05/11/2026, mỗi khoản còn 5.000.000 ₫, và `thuha` ghi phiếu 6.000.000 ₫
- **THEN** phiếu trừ `PN-2026-091` 5.000.000 ₫ rồi `PN-2026-092` 1.000.000 ₫

### Requirement: Kế toán chỉ định khoản khác
Người ghi SHALL chọn được các khoản và số trừ từng khoản (> 0, không quá số còn lại của khoản, khoản thuộc người bán đó). Tổng số chỉ định SHALL không quá số tiền phiếu. Phần còn lại sau chỉ định SHALL tự trừ theo thứ tự cố định, rồi mới thành tiền ứng trước. Số chỉ định SHALL được kiểm lại trong transaction ghi; khoản đã bị trừ bởi phiếu khác thì từ chối với 409.

#### Scenario: Trả chuyến mới trước
- **WHEN** Anh Tâm còn `PN-2026-090` 26.500.000 ₫ và `PN-2026-091` 16.250.000 ₫, và `thuha` ghi phiếu 16.250.000 ₫ chỉ định `PN-2026-091`
- **THEN** `PN-2026-091` "Đã trả đủ" **AND** `PN-2026-090` vẫn còn 26.500.000 ₫ "Quá hạn 2 ngày"

#### Scenario: Chỉ định quá số còn lại
- **WHEN** `PN-2026-091` còn 16.250.000 ₫ và `thuha` chỉ định 20.000.000 ₫ cho nó
- **THEN** hệ thống từ chối với "PN-2026-091 chỉ còn 16.250.000 ₫." và không lưu

#### Scenario: Khoản vừa được trả bởi phiếu khác
- **WHEN** `thuha` mở form chỉ định `PN-2026-091` 16.250.000 ₫, trong lúc đó Giám đốc ghi phiếu khác trừ hết `PN-2026-091`, rồi `thuha` bấm ghi
- **THEN** hệ thống trả 409 với "PN-2026-091 đã được trả đủ bởi phiếu khác. Bạn xem lại rồi ghi." và không lưu

#### Scenario: Khoản của người bán khác
- **WHEN** `thuha` ghi phiếu cho Anh Tâm và chỉ định một khoản của Thép Nam Sơn
- **THEN** hệ thống từ chối với "Khoản được chọn không thuộc người bán này." và không lưu

### Requirement: Ứng trước và chi dư thành tiền ứng trước
Phần tiền phiếu Trả tiền hàng còn lại sau khi trừ hết các khoản đang nợ, và toàn bộ phiếu Ứng trước, SHALL là **tiền ứng trước** của người bán (0.2 #100). Phiếu **Ứng trước** SHALL chỉ ghi được khi người bán không còn khoản nào còn phải trả. Tiền ứng trước SHALL tính ra = tổng phiếu chi còn hiệu lực − tổng phân bổ từ các phiếu đó; không lưu số dư. Form SHALL nói "Chi dư thì phần dư thành tiền ứng trước, tự trừ vào phiếu nhập sau của người bán này."

#### Scenario: Ứng trước khi chưa nhận hàng
- **WHEN** Chị Nguyễn Thị Hoa không còn khoản nào và `thuha` ghi phiếu Ứng trước 10.000.000 ₫ ngày 01/11/2026
- **THEN** phiếu `PC-2026-040` được lưu **AND** Chị Hoa có tiền ứng trước 10.000.000 ₫

#### Scenario: Ứng trước khi còn nợ
- **WHEN** Anh Tâm còn phải trả 42.750.000 ₫ và `thuha` chọn loại Ứng trước 5.000.000 ₫
- **THEN** hệ thống từ chối với "Anh Lê Văn Tâm còn phải trả 42.750.000 ₫. Bạn chọn Trả tiền hàng: phần dư tự thành tiền ứng trước." và không lưu

#### Scenario: Chi dư
- **WHEN** Anh Tâm còn 42.750.000 ₫ và `thuha` ghi phiếu Trả tiền hàng 45.000.000 ₫
- **THEN** cả hai khoản "Đã trả đủ" **AND** Anh Tâm có tiền ứng trước 2.250.000 ₫ **AND** form đã hiện "Chi dư 2.250.000 ₫ giữ làm tiền ứng trước, tự trừ vào phiếu nhập sau."

### Requirement: Tiền ứng trước tự trừ khi ghi sổ phiếu nhập sau
Khi một phiếu nhập được ghi sổ và người bán có tiền ứng trước, hệ thống SHALL trong **cùng transaction** trừ tiền ứng trước vào các khoản còn phải trả theo thứ tự cố định; nguồn dùng phiếu chi cũ trước (ngày chi, rồi mã). Mỗi lần trừ SHALL lưu thành dòng phân bổ của phiếu chi nguồn, đánh dấu trừ từ ứng trước. Sau mỗi lệnh ghi, người bán có ứng trước > 0 SHALL không còn khoản nào còn phải trả. M3 SHALL không hiện số tiền này.

#### Scenario: Ứng trước lớn hơn khoản mới
- **WHEN** Chị Hoa có tiền ứng trước 10.000.000 ₫ (`PC-2026-040`) và `vantung` ghi sổ `PN-2026-093` của Chị Hoa phát sinh 6.400.000 ₫
- **THEN** `PN-2026-093` "Đã trả đủ" ngay khi ghi sổ **AND** tiền ứng trước còn 3.600.000 ₫ **AND** danh sách phiếu chi hiện `PC-2026-040` "Ứng trước · đã tự trừ vào PN-2026-093 ngày 06/11"

#### Scenario: Ứng trước nhỏ hơn khoản mới
- **WHEN** Chị Hoa có tiền ứng trước 10.000.000 ₫ và phiếu nhập mới phát sinh 14.000.000 ₫, hạn ngay ngày nhập 06/11/2026
- **THEN** khoản đó còn 4.000.000 ₫ hạn 06/11 **AND** tiền ứng trước 0 ₫

#### Scenario: Hai nguồn ứng trước
- **WHEN** Chị Hoa có ứng trước 3.000.000 ₫ từ `PC-2026-040` (01/11) và 5.000.000 ₫ từ `PC-2026-046` (05/11), và phiếu nhập mới phát sinh 4.000.000 ₫
- **THEN** khoản bị trừ 3.000.000 ₫ từ `PC-2026-040` rồi 1.000.000 ₫ từ `PC-2026-046` **AND** còn ứng trước 4.000.000 ₫ của `PC-2026-046`

#### Scenario: Lỗi ghi sổ không trừ ứng trước
- **WHEN** Chị Hoa có ứng trước 10.000.000 ₫ và ghi sổ phiếu nhập bị từ chối vì một vật tư vừa ngừng dùng
- **THEN** không có phiếu nhập **AND** tiền ứng trước vẫn 10.000.000 ₫

### Requirement: Phiếu chi không sửa, hủy có lý do
Phiếu chi SHALL không sửa được. Kế toán hoặc Giám đốc SHALL hủy được phiếu kèm lý do (1–500 ký tự) (0.2 #100). Hủy SHALL trong một transaction: ghi dòng hủy (lý do, người, giờ); mọi phân bổ từ phiếu đó hết hiệu lực nên các khoản đã trừ mở lại đúng số và tiền ứng trước của phiếu đó mất; rồi tiền ứng trước còn lại của người bán tự trừ lại theo thứ tự cố định. Phiếu đã hủy, phân bổ cũ và dòng hủy SHALL vẫn giữ và xem được. Hủy hai lần SHALL bị từ chối.

#### Scenario: Hủy mở lại khoản
- **WHEN** hôm nay 06/11/2026, `PC-2026-044` 38.000.000 ₫ đã trừ `PN-2026-087` (hạn 22/10) 38.000.000 ₫, và `thuha` hủy với lý do "Ghi nhầm số tiền"
- **THEN** `PN-2026-087` còn 38.000.000 ₫ "Quá hạn 15 ngày" **AND** `PC-2026-044` hiện "Đã hủy · Ghi nhầm số tiền"

#### Scenario: Hủy phiếu ứng trước đã tự trừ
- **WHEN** `PC-2026-041` Ứng trước 20.000.000 ₫ đã tự trừ vào `PN-2026-087` 20.000.000 ₫, và `thuha` hủy `PC-2026-041`
- **THEN** `PN-2026-087` mở lại thêm 20.000.000 ₫ **AND** tiền ứng trước của Anh Tâm không đổi

#### Scenario: Hủy phiếu còn giữ ứng trước
- **WHEN** Chị Hoa còn ứng trước 3.600.000 ₫ từ `PC-2026-040` và `thuha` hủy `PC-2026-040`
- **THEN** `PN-2026-093` mở lại 6.400.000 ₫ **AND** tiền ứng trước của Chị Hoa 0 ₫

#### Scenario: Hủy rồi ứng trước khác tự trừ lại
- **WHEN** Chị Hoa có ứng trước 3.600.000 ₫ từ `PC-2026-040` và `thuha` hủy `PC-2026-047` đã trừ `PN-2026-095` 2.000.000 ₫
- **THEN** `PN-2026-095` bị trừ 2.000.000 ₫ từ `PC-2026-040` nên vẫn "Đã trả đủ" **AND** tiền ứng trước còn 1.600.000 ₫

#### Scenario: Hủy không lý do
- **WHEN** `thuha` bấm Hủy `PC-2026-044` để trống lý do
- **THEN** hệ thống từ chối với "Bạn ghi lý do hủy phiếu chi." và phiếu giữ nguyên

#### Scenario: Hủy phiếu đã hủy
- **WHEN** `PC-2026-044` đã hủy và có lệnh hủy lần nữa
- **THEN** hệ thống từ chối với "Phiếu PC-2026-044 đã hủy lúc 10:02 06/11/2026 bởi Thu Hà." và không ghi thêm

### Requirement: Không trừ trùng khi ghi cùng lúc
Các lệnh làm đổi phân bổ của một người bán (ghi phiếu chi, hủy phiếu chi, trừ ứng trước khi ghi sổ phiếu nhập) SHALL chạy lần lượt cho cùng người bán. Tổng phân bổ còn hiệu lực vào một khoản SHALL không bao giờ vượt số phát sinh; tổng phân bổ từ một phiếu chi SHALL không vượt số tiền phiếu.

#### Scenario: Hai phiếu chi cùng lúc
- **WHEN** Anh Tâm chỉ còn `PN-2026-091` 16.250.000 ₫ và `thuha`, Giám đốc cùng lúc ghi hai phiếu Trả tiền hàng 16.250.000 ₫
- **THEN** đúng một phiếu trừ `PN-2026-091` 16.250.000 ₫ **AND** phiếu còn lại thành tiền ứng trước 16.250.000 ₫ **AND** `PN-2026-091` đã trừ đúng 16.250.000 ₫

#### Scenario: Ghi phiếu chi trong lúc ghi sổ phiếu nhập
- **WHEN** Chị Hoa có ứng trước 10.000.000 ₫, `vantung` ghi sổ phiếu nhập 6.400.000 ₫ của Chị Hoa cùng lúc `thuha` ghi phiếu Trả tiền hàng 6.400.000 ₫
- **THEN** tổng đã trừ vào phiếu nhập đó là 6.400.000 ₫ **AND** tiền ứng trước còn lại của Chị Hoa là 10.000.000 ₫

### Requirement: Danh sách phiếu chi của người bán
D14c SHALL liệt kê phiếu chi của người bán đang chọn, mới nhất trước: mã, ngày chi · hình thức, số tiền, đã trừ vào (từng phiếu nhập và số; với phiếu Ứng trước: "Ứng trước · đã tự trừ vào <mã> ngày dd/mm" hoặc "Ứng trước · còn giữ x ₫"; với phần chi dư: "Ứng trước x ₫"), trạng thái (còn hiệu lực / Đã hủy + lý do), nút Hủy cho người có quyền; 20 dòng đầu và "Xem thêm". Ghi chú dưới bảng SHALL nói "Phiếu chi không sửa. Ghi sai thì Kế toán hủy và ghi lý do: khoản đã trừ mở lại, rồi lập phiếu mới."

#### Scenario: Phiếu chi trừ một khoản
- **WHEN** `PC-2026-044` ngày 22/10 tiền mặt 38.000.000 ₫ trừ `PN-2026-087` 38.000.000 ₫
- **THEN** dòng hiện "22/10 · Tiền mặt", 38.000.000 ₫, "PN-2026-087 38.000.000 ₫" và nút Hủy

### Requirement: Quyền ghi và hủy phiếu chi
Chỉ Kế toán và Giám đốc SHALL ghi, xem trước và hủy phiếu chi (`payments.manage`), kiểm ở server. Người khác SHALL nhận 403 và không thấy form ghi, nút Hủy. Thủ kho trả tiền mặt cho người bán lúc nhận hàng SHALL báo Kế toán ghi phiếu chi với ngày chi là ngày trả thật.

#### Scenario: Thủ kho ghi phiếu chi
- **WHEN** `vantung` (Thủ kho) gọi `POST /api/payables/payments`
- **THEN** hệ thống trả 403 và không lưu

#### Scenario: Kinh doanh hủy phiếu chi
- **WHEN** `quocbao` (Kinh doanh) gọi `POST /api/payables/payments/{id}/cancel`
- **THEN** hệ thống trả 403 và phiếu giữ nguyên

#### Scenario: Giám đốc hủy phiếu chi
- **WHEN** Giám đốc hủy `PC-2026-043` với lý do "Trùng phiếu PC-2026-042"
- **THEN** phiếu Đã hủy và nhật ký ghi người hủy là Giám đốc

#### Scenario: Kế toán ghi phiếu cho tiền thủ kho đã trả
- **WHEN** hôm nay 06/11/2026, thủ kho đã trả Anh Tâm 16.250.000 ₫ tiền mặt ngày 05/11/2026 lúc nhận `PN-2026-091`, và `thuha` ghi phiếu chi tiền mặt ngày 05/11/2026 chỉ định `PN-2026-091`
- **THEN** `PN-2026-091` "Đã trả đủ" **AND** phiếu có ngày chi 05/11/2026, người ghi `thuha`
