# Spec Delta

## ADDED Requirements

### Requirement: Đặt phạm vi hợp đồng cho Kinh doanh
Giám đốc SHALL đặt được phạm vi hợp đồng cho tài khoản vai trò Kinh doanh ở D17: Cả hai, Chỉ cho thuê, Chỉ bán. Tài khoản mới mặc định Cả hai. D17 SHALL hiện phạm vi ở dòng của tài khoản Kinh doanh và không hiện ô này cho vai trò khác. Đổi phạm vi SHALL có hiệu lực ở yêu cầu kế tiếp của người đó và ghi nhật ký như đổi vai trò.

#### Scenario: Đặt Chỉ cho thuê
- **WHEN** Giám đốc đặt phạm vi của `quocbao` (Kinh doanh) thành Chỉ cho thuê
- **THEN** dòng `quocbao` trên D17 hiện "Kinh doanh · Chỉ cho thuê" **AND** nhật ký có một dòng Sửa loại Người dùng với trường "Phạm vi hợp đồng" Cả hai → Chỉ cho thuê

#### Scenario: Tài khoản Kinh doanh mới
- **WHEN** Giám đốc tạo tài khoản `thuyvy` vai trò Kinh doanh không chọn phạm vi
- **THEN** `thuyvy` có phạm vi Cả hai

#### Scenario: Vai trò khác không có ô phạm vi
- **WHEN** Giám đốc mở form sửa tài khoản `thuha` (Kế toán)
- **THEN** form không có ô "Phạm vi hợp đồng"

#### Scenario: Người không phải Giám đốc đổi phạm vi
- **WHEN** `quocbao` gửi lệnh đổi phạm vi hợp đồng của chính mình thành Cả hai
- **THEN** API trả 403 và phạm vi không đổi
