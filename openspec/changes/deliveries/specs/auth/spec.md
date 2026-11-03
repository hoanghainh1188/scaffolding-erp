# Spec Delta

## ADDED Requirements

### Requirement: Quyền phiếu xuất theo vai trò
Bảng quyền SHALL có `deliveries.pick` (bắt đầu nhặt, trả lại văn phòng, xác nhận xe rời bãi) cho `DIRECTOR`, `WAREHOUSE`. Lập, sửa, rút về, hủy phiếu xuất SHALL dùng quyền sửa hợp đồng của đúng loại; xem phiếu xuất trên Desktop SHALL dùng quyền xem hợp đồng của đúng loại. Không khai báo vai trò cho phiếu xuất ở chỗ khác.

#### Scenario: Đọc bảng quyền phiếu xuất
- **WHEN** đọc bảng quyền cho quyền nhặt hàng
- **THEN** `deliveries.pick` chỉ cho `DIRECTOR`, `WAREHOUSE`

#### Scenario: Thủ kho nhặt nhưng không mở D6
- **WHEN** `vantung` (Thủ kho) gửi `GET /api/m/deliveries/PX-2026-140` rồi mở `/sales/contracts/<id>/deliveries`
- **THEN** API trả dữ liệu nhặt hàng không có giá **AND** trang trả 403

#### Scenario: Xưởng gọi API nhặt hàng
- **WHEN** một tài khoản `WORKSHOP` gửi `POST /api/m/deliveries/PX-2026-140/start`
- **THEN** API trả 403 với "Bạn không có quyền thực hiện thao tác này" và phiếu vẫn Chờ nhặt
