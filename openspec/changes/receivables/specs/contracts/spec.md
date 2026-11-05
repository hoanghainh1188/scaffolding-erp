## MODIFIED Requirements

### Requirement: Trạng thái hợp đồng
Hợp đồng SHALL có một trong các trạng thái: Nháp, Chờ duyệt, Đã duyệt, Đang thực hiện, Thanh lý, Đã hủy. Chuyển trạng thái SHALL theo bảng: Nháp → Chờ duyệt (gửi duyệt); Chờ duyệt → Đã duyệt (duyệt) hoặc → Nháp (trả lại, kèm lý do); Nháp → Đã hủy; Đã duyệt → Đã hủy khi chưa có hàng tới công trình và không còn phiếu xuất hay phiếu chuyển tới chưa xong; Đã duyệt → Đang thực hiện khi phiếu xuất hoặc phiếu chuyển tới đầu tiên ghi sổ; Đang thực hiện → Thanh lý khi thanh lý đủ điều kiện (spec `contract-settlement`). Thanh lý là trạng thái cuối, không chuyển đi đâu được. Chuyển khác SHALL bị từ chối.

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
