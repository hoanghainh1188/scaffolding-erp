## MODIFIED Requirements

### Requirement: Ngày hiệu lực của phụ lục
Ngày hiệu lực SHALL không trước ngày bắt đầu hợp đồng, không trước ngày hiệu lực của phụ lục đã duyệt gần nhất, SHALL sau ngày cuối của kỳ tính tiền thuê đã chốt gần nhất, và với hợp đồng bán SHALL sau ngày giao của phiếu xuất bán đã ghi sổ gần nhất (để VAT và hạn trả của hàng đã giao không đổi, spec `receivables`). Hệ thống SHALL kiểm lúc lưu, lúc gửi duyệt và lúc duyệt. D5b SHALL hiện ngày cuối kỳ đã chốt gần nhất.

#### Scenario: Ngày hiệu lực trong kỳ đã chốt
- **WHEN** kỳ 01–30/11/2026 của hợp đồng đã chốt và `quocbao` đặt ngày hiệu lực 30/11/2026
- **THEN** hệ thống từ chối với "Ngày hiệu lực phải sau ngày chốt kỳ gần nhất (30/11/2026). Kỳ đã chốt không tính lại." và không lưu

#### Scenario: Ngày đầu tiên sau kỳ đã chốt
- **WHEN** kỳ 01–30/11/2026 đã chốt và ngày hiệu lực là 01/12/2026
- **THEN** phụ lục được lưu

#### Scenario: Kỳ được chốt trong lúc chờ duyệt
- **WHEN** phụ lục hiệu lực 15/12/2026 đang Chờ duyệt, rồi kỳ 01–31/12/2026 được chốt, rồi Giám đốc duyệt phụ lục
- **THEN** hệ thống từ chối duyệt với "Ngày hiệu lực phải sau ngày chốt kỳ gần nhất (31/12/2026). Kỳ đã chốt không tính lại." **AND** phụ lục vẫn Chờ duyệt

#### Scenario: Chưa có kỳ nào được chốt
- **WHEN** hợp đồng bắt đầu 01/11/2026, chưa có kỳ nào chốt, và ngày hiệu lực là 05/11/2026
- **THEN** phụ lục được lưu **AND** D5b hiện "Chưa có kỳ nào được chốt"

#### Scenario: Trước ngày bắt đầu hợp đồng
- **WHEN** hợp đồng bắt đầu 01/11/2026 và ngày hiệu lực là 25/10/2026
- **THEN** hệ thống từ chối với "Ngày hiệu lực không được trước ngày bắt đầu hợp đồng (01/11/2026)." và không lưu

#### Scenario: Hợp đồng bán, hiệu lực không sau ngày giao gần nhất
- **WHEN** hợp đồng bán có `PX-2026-041` ghi sổ ngày 02/10/2026 và `quocbao` đặt ngày hiệu lực phụ lục 02/10/2026
- **THEN** hệ thống từ chối với "Ngày hiệu lực phải sau ngày giao hàng gần nhất (02/10/2026). Hàng đã giao giữ VAT và hạn trả cũ." và không lưu

#### Scenario: Hợp đồng bán, hiệu lực sau ngày giao
- **WHEN** phiếu xuất bán gần nhất ghi sổ 02/10/2026 và ngày hiệu lực là 03/10/2026
- **THEN** phụ lục được lưu
