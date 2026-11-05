## ADDED Requirements

### Requirement: Ghi sổ xuất bán trừ tiền trả trước
Khi phiếu xuất của hợp đồng bán được ghi sổ, phiếu SHALL thành khoản nợ (tiền hàng + cước + VAT theo bản hợp đồng tại ngày giao, spec `receivables`), và nếu nhà thầu có tiền trả trước, hệ thống SHALL trong cùng transaction ghi sổ trừ tiền trả trước vào các khoản còn nợ theo luật "Tiền trả trước tự trừ khoản phát sinh sau" (spec `customer-receipts`). Phiếu xuất của hợp đồng thuê SHALL không thành khoản nợ riêng (cước của nó vào kỳ tiền thuê). API và màn M5 SHALL vẫn không trả giá, cước, tiền nợ.

#### Scenario: Khách trả trước rồi nhận hàng
- **WHEN** khách hợp đồng bán đã trả trước 20.000.000 ₫ và thủ kho xác nhận `PX-2026-055` ghi sổ với tiền hàng 15.000.000 ₫, không cước, không VAT
- **THEN** khoản `PX-2026-055` "Đã thu đủ" **AND** tiền trả trước còn 5.000.000 ₫ **AND** M5 không hiện số tiền nào

#### Scenario: Phiếu xuất thuê
- **WHEN** phiếu xuất của hợp đồng thuê ghi sổ có cước 1.800.000 ₫
- **THEN** D14 không có khoản riêng cho phiếu đó **AND** cước 1.800.000 ₫ nằm trong kỳ tiền thuê của tháng giao khi chốt
