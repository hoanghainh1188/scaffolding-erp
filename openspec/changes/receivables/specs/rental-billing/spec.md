## ADDED Requirements

### Requirement: Chốt kỳ trừ tiền trả trước
Khi chốt kỳ, nếu nhà thầu của hợp đồng có tiền trả trước hoặc kỳ có phải thu âm, hệ thống SHALL trong cùng transaction chốt kỳ trừ tiền trả trước vào các khoản còn nợ của nhà thầu theo luật "Tiền trả trước tự trừ khoản phát sinh sau" (spec `customer-receipts`). Số phải thu và hạn trả của kỳ SHALL không đổi; chỉ phần đã trừ của khoản thay đổi. Chốt bị từ chối SHALL không trừ gì.

#### Scenario: Chốt kỳ khi có trả trước
- **WHEN** Đông Á có tiền trả trước 5.000.000 ₫ và `thuha` chốt kỳ 11/2026 của hợp đồng thuê Đông Á, phải thu 8.000.000 ₫, hạn 15/12/2026
- **THEN** kỳ 11/2026 lưu phải thu 8.000.000 ₫, hạn 15/12/2026 **AND** trên D14 khoản kỳ 11/2026 đã trừ 5.000.000 ₫, còn lại 3.000.000 ₫

#### Scenario: Chốt bị từ chối
- **WHEN** lệnh chốt kỳ 11/2026 trả 409 vì số phải thu đã đổi
- **THEN** tiền trả trước của Đông Á giữ 5.000.000 ₫

### Requirement: Không điều chỉnh trên hợp đồng đã thanh lý
Dòng điều chỉnh SHALL không tạo, sửa, xóa được trên hợp đồng Thanh lý.

#### Scenario: Ghi điều chỉnh sau thanh lý
- **WHEN** `082026/ANPHAT-MINHPHAT` đã thanh lý và `thuha` ghi dòng điều chỉnh 50.000 ₫ cho kỳ 11/2026
- **THEN** hệ thống từ chối với "Hợp đồng đã thanh lý nên không ghi điều chỉnh được. Sai sót sau thanh lý ghi bằng phiếu thu hoặc trao đổi với khách." và không lưu
