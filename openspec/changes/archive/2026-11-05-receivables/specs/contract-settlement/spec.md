## ADDED Requirements

### Requirement: Điều kiện thanh lý hợp đồng
Chỉ hợp đồng **Đang thực hiện** SHALL thanh lý được (0.2 #81). Hợp đồng thuê SHALL đủ: không còn hàng ở công trình của hợp đồng; mọi tháng có tiền thuê, cước hay điều chỉnh đã chốt; không còn đền bù, mua lại Chờ duyệt; không còn phiếu xuất Chờ nhặt / Đang nhặt; không còn phiếu chuyển đi hoặc tới ở Nháp / Chờ xác nhận; không còn phụ lục Nháp / Chờ duyệt. Hợp đồng bán SHALL đủ hai điều kiện cuối về phiếu xuất và phụ lục. Server SHALL kiểm lại mọi điều kiện trong transaction thanh lý.

#### Scenario: Còn phụ lục Chờ duyệt
- **WHEN** phụ lục `/02` của hợp đồng còn Chờ duyệt
- **THEN** lệnh thanh lý bị từ chối với "Còn phụ lục 082026/ANPHAT-MINHPHAT/02 Chờ duyệt. Bạn duyệt hoặc hủy phụ lục trước rồi thanh lý."

#### Scenario: Còn hàng ở công trình
- **WHEN** công trình của hợp đồng còn 3 `PK-KU` Tốt và `thuha` gửi lệnh thanh lý
- **THEN** hệ thống từ chối với "Công trình còn 3 PK-KU của hợp đồng. Bạn thu hồi hết hàng rồi thanh lý." và hợp đồng vẫn Đang thực hiện

#### Scenario: Kỳ cuối chưa chốt
- **WHEN** hàng trả hết 20/11/2026, hôm nay 28/11/2026, kỳ 11/2026 chưa chốt
- **THEN** điều kiện "Kỳ tiền thuê cuối đã chốt" chưa đạt với "Kỳ 11/2026 chưa chốt (chốt được từ 01/12/2026)" **AND** lệnh thanh lý bị từ chối

#### Scenario: Còn phiếu đền bù Chờ duyệt
- **WHEN** `ĐB-2026-014` của hợp đồng còn Chờ duyệt
- **THEN** lệnh thanh lý bị từ chối với "Còn phiếu đền bù ĐB-2026-014 Chờ duyệt. Giám đốc duyệt hoặc từ chối trước rồi thanh lý."

#### Scenario: Còn dòng điều chỉnh chưa chốt
- **WHEN** kỳ 12/2026 chưa chốt có dòng điều chỉnh 93.000 ₫ của hợp đồng
- **THEN** điều kiện "Kỳ tiền thuê cuối đã chốt" chưa đạt với "Kỳ 12/2026 có điều chỉnh chưa chốt"

#### Scenario: Hợp đồng Đã duyệt chưa giao
- **WHEN** hợp đồng Đã duyệt chưa có phiếu xuất nào và có lệnh thanh lý
- **THEN** hệ thống từ chối với "Chỉ hợp đồng Đang thực hiện mới thanh lý được. Hợp đồng chưa giao hàng thì hủy." và không đổi dữ liệu

### Requirement: D14b hiện điều kiện thanh lý
D14b SHALL hiện từng điều kiện với dấu đạt / chưa đạt và chứng từ còn chặn. Nút thanh lý SHALL tắt khi còn điều kiện chưa đạt.

#### Scenario: Đủ điều kiện
- **WHEN** hôm nay 04/12/2026, `082026/ANPHAT-MINHPHAT` Đang thực hiện, hàng trả hết 20/11/2026 bằng `PTH-2026-031`, kỳ 11/2026 đã chốt 01/12/2026, không còn phiếu chờ
- **THEN** D14b hiện ba điều kiện đạt: "Hàng ở công trình: 0 · Trả hết 20/11/2026 (PTH-2026-031)", "Kỳ tiền thuê cuối đã chốt · Kỳ 11/2026 chốt 01/12/2026", "Không còn phiếu chờ" **AND** nút "Thanh lý và ghi cấn trừ cọc" bật

### Requirement: Cấn trừ cọc tiền vào nợ của chính hợp đồng
Khi thanh lý, cọc tiền đã nhận (tổng phiếu Nộp cọc tiền còn hiệu lực của hợp đồng) SHALL trừ vào các khoản còn nợ **của chính hợp đồng đó** theo thứ tự cố định, mỗi khoản tối đa số còn lại (0.2 #40, #81). Khoản của hợp đồng khác và tiền trả trước SHALL không cấn ở đây. Mỗi lần trừ SHALL lưu thành dòng phân bổ của phiếu cọc (cũ trước), gắn với lần thanh lý. Cọc thiếu thì phần còn lại SHALL vẫn là nợ thường. Bảo lãnh SHALL không cấn (0.2 #50).

#### Scenario: Cọc đủ, hoàn phần thừa
- **WHEN** `082026/ANPHAT-MINHPHAT` đã nhận cọc 50.000.000 ₫ và còn nợ kỳ 10/2026 18.550.000 ₫ (hạn 15/11), `ĐB-2026-014` 3.600.000 ₫ (hạn 05/12), kỳ 11/2026 11.750.000 ₫ (hạn 15/12), và `thuha` thanh lý ngày 04/12/2026
- **THEN** ba khoản "Đã thu đủ", cấn trừ 33.900.000 ₫ **AND** hoàn lại khách 16.100.000 ₫ **AND** hợp đồng Thanh lý

#### Scenario: Cọc thiếu
- **WHEN** hợp đồng đã nhận cọc 20.000.000 ₫ và còn nợ ba khoản như trên
- **THEN** kỳ 10/2026 "Đã thu đủ" (18.550.000 ₫), `ĐB-2026-014` trừ 1.450.000 ₫ còn 2.150.000 ₫, kỳ 11/2026 còn 11.750.000 ₫ **AND** hoàn lại 0 ₫ **AND** Minh Phát vẫn nợ 13.900.000 ₫ của hợp đồng này trên D14

#### Scenario: Không cấn nợ hợp đồng khác
- **WHEN** Minh Phát còn nợ kỳ 11/2026 của `092026/ANPHAT-MINHPHAT` 14.500.000 ₫ và thanh lý `082026/ANPHAT-MINHPHAT` cọc 50.000.000 ₫ nợ 33.900.000 ₫
- **THEN** hoàn lại 16.100.000 ₫ **AND** khoản của `092026/ANPHAT-MINHPHAT` vẫn còn 14.500.000 ₫ **AND** D14b ghi "Chỉ tính khoản của hợp đồng này. Nợ của hợp đồng khác và tiền trả trước của nhà thầu không cấn ở đây."

#### Scenario: Không có cọc
- **WHEN** hợp đồng không có phiếu cọc nào và còn nợ 2.000.000 ₫
- **THEN** thanh lý được, cấn 0 ₫, hoàn 0 ₫ **AND** khoản 2.000.000 ₫ vẫn là nợ thường

### Requirement: Ghi hoàn cọc thừa
Hoàn lại khách SHALL = cọc đã nhận − tổng cấn trừ, khớp từng đồng, không âm. Khi hoàn lại > 0, người thanh lý SHALL nhập ngày hoàn (không sau hôm nay) và hình thức (Tiền mặt hoặc Chuyển khoản); hoàn = 0 thì không cần. Lần thanh lý SHALL lưu: hợp đồng, ngày thanh lý, số hoàn, ngày hoàn, hình thức hoàn, người thanh lý, giờ ghi. Lệnh SHALL gửi kèm số hoàn đã xem; số đổi so với lúc mở D14b thì trả 409.

#### Scenario: Thiếu ngày hoàn
- **WHEN** hoàn lại 16.100.000 ₫ và `thuha` để trống ngày hoàn
- **THEN** hệ thống từ chối với "Bạn nhập ngày hoàn cọc và hình thức." và không lưu

#### Scenario: Số đã đổi từ lúc mở
- **WHEN** `thuha` mở D14b thấy hoàn 16.100.000 ₫, rồi Giám đốc ghi phiếu thu trừ 3.600.000 ₫ vào `ĐB-2026-014`, rồi `thuha` bấm thanh lý
- **THEN** hệ thống trả 409 với "Số hoàn cọc đã đổi từ 16.100.000 ₫ thành 19.700.000 ₫ từ lúc bạn mở. Bạn xem lại rồi thanh lý." và không lưu

### Requirement: Thanh lý trong một transaction
Thanh lý SHALL chạy trong một transaction: khóa hợp đồng, kiểm điều kiện, ghi phân bổ cấn trừ, ghi lần thanh lý, chuyển hợp đồng sang Thanh lý theo bảng trạng thái, ghi nhật ký. Lỗi ở bất kỳ bước nào SHALL không để lại dữ liệu nửa chừng. Hai lệnh thanh lý cùng lúc SHALL chỉ một lệnh thành công; lệnh sau nhận "Hợp đồng đã thanh lý lúc <giờ> bởi <người>."

#### Scenario: Hai người cùng bấm
- **WHEN** `thuha` và Giám đốc cùng bấm thanh lý `082026/ANPHAT-MINHPHAT`
- **THEN** chỉ có một lần thanh lý và một bộ phân bổ cấn trừ **AND** người sau nhận "Hợp đồng đã thanh lý lúc 09:12 04/12/2026 bởi Thu Hà."

### Requirement: Hợp đồng đã thanh lý bị khóa
Hợp đồng Thanh lý SHALL không: lập phiếu xuất, phiếu thu hồi, phiếu chuyển công trình đi hoặc tới, phiếu mua lại, đổi hàng; lập phụ lục; sửa; hủy; nhận phiếu cọc; ghi dòng điều chỉnh tiền thuê. Thanh lý SHALL không mở lại được. Khoản nợ còn lại của hợp đồng SHALL vẫn trả được bằng phiếu thu. D4 SHALL xếp hợp đồng Thanh lý vào nhóm "Đã kết thúc"; D5 SHALL hiện ngày thanh lý, cọc cấn trừ và số hoàn.

#### Scenario: Lập phiếu xuất sau thanh lý
- **WHEN** `quocbao` lập phiếu xuất cho `082026/ANPHAT-MINHPHAT` đã thanh lý
- **THEN** hệ thống từ chối với "Hợp đồng đã thanh lý nên không xuất hàng được." và không lưu

#### Scenario: Lập phụ lục sau thanh lý
- **WHEN** `quocbao` lập phụ lục cho hợp đồng đã thanh lý
- **THEN** hệ thống từ chối với "Hợp đồng đã thanh lý nên không lưu phụ lục được."

#### Scenario: Trả nợ còn lại sau thanh lý
- **WHEN** hợp đồng đã thanh lý còn `ĐB-2026-014` 2.150.000 ₫ và Minh Phát trả 2.150.000 ₫
- **THEN** phiếu thu trừ `ĐB-2026-014` như khoản thường

### Requirement: Quyền thanh lý
Kế toán và Giám đốc SHALL thanh lý được (`contracts.close`), không cần bước Giám đốc duyệt riêng; kiểm ở server. Người khác SHALL nhận 403; D5 và D14 SHALL không hiện liên kết thanh lý cho họ.

#### Scenario: Kinh doanh thanh lý
- **WHEN** `quocbao` (Kinh doanh) gửi lệnh thanh lý hợp đồng
- **THEN** hệ thống trả 403 và hợp đồng vẫn Đang thực hiện

#### Scenario: Kế toán thanh lý
- **WHEN** `thuha` (Kế toán) thanh lý hợp đồng đủ điều kiện
- **THEN** hợp đồng Thanh lý ngay, không chờ Giám đốc duyệt **AND** Giám đốc thấy dòng Thanh lý trên D18
