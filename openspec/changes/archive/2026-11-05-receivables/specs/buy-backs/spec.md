## ADDED Requirements

### Requirement: Duyệt phiếu mua lại trừ tiền trả trước
Khi Giám đốc duyệt phiếu mua lại, nếu nhà thầu có tiền trả trước, hệ thống SHALL trong cùng transaction duyệt trừ tiền trả trước vào các khoản còn nợ của nhà thầu theo luật "Tiền trả trước tự trừ khoản phát sinh sau" (spec `customer-receipts`). Tiền bán và hạn trả lưu trên phiếu SHALL không đổi. Phiếu mua lại SHALL không cộng VAT (0.2 #84).

#### Scenario: Duyệt khi có trả trước
- **WHEN** Minh Phát có tiền trả trước 2.000.000 ₫, không nợ khoản nào, và `minhanh` duyệt `MLA-2026-003` tiền bán 6.000.000 ₫ ngày 03/11/2026
- **THEN** khoản `MLA-2026-003` đã trừ 2.000.000 ₫, còn 4.000.000 ₫, hạn 18/11/2026 **AND** tiền trả trước 0 ₫
