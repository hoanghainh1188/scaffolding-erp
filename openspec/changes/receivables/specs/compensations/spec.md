## ADDED Requirements

### Requirement: Duyệt phiếu đền bù trừ tiền trả trước
Khi Giám đốc duyệt phiếu đền bù, nếu nhà thầu có tiền trả trước, hệ thống SHALL trong cùng transaction duyệt trừ tiền trả trước vào các khoản còn nợ của nhà thầu theo luật "Tiền trả trước tự trừ khoản phát sinh sau" (spec `customer-receipts`). Tiền phải thu và hạn trả lưu trên phiếu SHALL không đổi. Phiếu đền bù SHALL không cộng VAT (0.2 #84).

#### Scenario: Duyệt khi có trả trước
- **WHEN** Đông Á có tiền trả trước 5.000.000 ₫ và `minhanh` duyệt `ĐB-2026-020` phải thu 1.200.000 ₫
- **THEN** phiếu lưu phải thu 1.200.000 ₫ **AND** khoản `ĐB-2026-020` "Đã thu đủ" trên D14 **AND** tiền trả trước còn 3.800.000 ₫
