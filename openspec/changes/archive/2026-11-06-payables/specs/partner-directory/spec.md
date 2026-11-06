## ADDED Requirements

### Requirement: Số ngày được nợ của nhà cung cấp
Nhà cung cấp SHALL có **số ngày được nợ** (số nguyên 0–365, mặc định 0 = trả ngay khi nhập) (0.2 #99). Form tạo / sửa nhà cung cấp trên D16 SHALL có ô này; chi tiết nhà cung cấp SHALL hiện "Trả ngay khi nhập" khi 0, "Nợ N ngày" khi > 0. Số này SHALL chỉ dùng để tính hạn trả của phiếu nhập ghi sổ sau đó (spec `payables`). Quyền sửa như các trường khác của nhà cung cấp (`partners.manage`). Nhà cung cấp có sẵn trước change này SHALL có số ngày được nợ 0.

#### Scenario: Tạo người bán không nhập số ngày
- **WHEN** Kinh doanh tạo nhà cung cấp cá nhân "Chú Ba ve chai" chỉ có tên
- **THEN** nhà cung cấp được lưu với số ngày được nợ 0 **AND** chi tiết D16 hiện "Trả ngay khi nhập"

#### Scenario: Công ty được nợ 30 ngày
- **WHEN** Kế toán sửa Cty TNHH Vật tư Hưng Thịnh, đặt số ngày được nợ 30
- **THEN** chi tiết D16 hiện "Nợ 30 ngày" **AND** nhật ký ghi dòng Sửa nhà cung cấp có trường số ngày được nợ 0 → 30

#### Scenario: Số ngày ngoài khoảng
- **WHEN** nhập số ngày được nợ 400 hoặc -1
- **THEN** hệ thống từ chối với "Số ngày được nợ từ 0 đến 365 ngày" và không lưu

#### Scenario: Thủ kho không sửa được
- **WHEN** `vantung` (Thủ kho) gửi lệnh sửa số ngày được nợ của một nhà cung cấp
- **THEN** hệ thống trả 403 và số ngày giữ nguyên
