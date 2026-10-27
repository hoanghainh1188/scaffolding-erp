# scrap-price Specification

## Purpose
Giá sắt vụn tham khảo (₫/kg) do Giám đốc nhập, dùng để định giá phần Phế liệu khi tách lô hàng cũ lúc nhập kho; lưu đủ lịch sử để biết phiếu nào dùng giá nào.

## Requirements

### Requirement: Giá sắt vụn chỉ ghi thêm
Giá sắt vụn tham khảo SHALL là số nguyên VND > 0 trên mỗi kg. Mỗi lần đổi giá SHALL thêm một bản ghi (giá, ghi chú, người đổi, thời điểm); giá hiện hành là bản ghi mới nhất. Bản ghi cũ SHALL không sửa, không xóa được.

#### Scenario: Đổi giá
- **WHEN** giá hiện hành là 7.500 ₫/kg và Giám đốc lưu giá mới 7.800 ₫/kg ngày 28/10/2026
- **THEN** giá hiện hành là 7.800 ₫/kg **AND** lịch sử còn dòng 7.500 ₫/kg

#### Scenario: Giá không hợp lệ
- **WHEN** Giám đốc lưu giá 0 hoặc 7.500,5
- **THEN** ô báo "Giá sắt vụn phải là số nguyên lớn hơn 0"

#### Scenario: Sửa bản ghi cũ bằng SQL
- **WHEN** chạy `UPDATE` hoặc `DELETE` trên bảng giá sắt vụn
- **THEN** DB báo "Giá sắt vụn chỉ ghi thêm"

### Requirement: Phiếu nhập dùng giá hiện hành lúc ghi sổ
Phiếu nhập có phần Phế liệu chia giá SHALL dùng giá hiện hành tại lúc ghi sổ và SHALL lưu lại giá đã dùng. Đổi giá sau đó SHALL không làm đổi giá trị đã ghi sổ của phiếu cũ.

#### Scenario: Đổi giá sau khi nhập
- **WHEN** `PN-2026-094` ghi sổ với giá 7.500 ₫/kg, rồi Giám đốc đổi giá thành 7.800 ₫/kg
- **THEN** `PN-2026-094` vẫn hiện "Giá sắt vụn 7.500 ₫/kg" **AND** dòng sổ Phế liệu của phiếu vẫn 1.215.000 ₫

#### Scenario: Đổi giá trong lúc Thủ kho đang đếm
- **WHEN** Thủ kho mở M3 lúc giá 7.500 ₫/kg, Giám đốc đổi giá thành 7.800 ₫/kg, rồi Thủ kho xác nhận
- **THEN** phiếu dùng 7.800 ₫/kg

### Requirement: Màn giá sắt vụn tham khảo
Trang `/settings/scrap-price` SHALL hiện giá hiện hành kèm người và ngày cập nhật, form nhập giá mới (₫/kg) với ghi chú không bắt buộc, và bảng 20 lần đổi gần nhất. Trang Cài đặt SHALL có thẻ "Giá sắt vụn tham khảo" dẫn tới trang này. Khi chưa có giá, khối giá hiện hành SHALL ghi "Chưa có giá. Lô hàng cũ có phế liệu chưa nhập kho được cho tới khi có giá."

#### Scenario: Chưa có giá
- **WHEN** Giám đốc mở `/settings/scrap-price` lần đầu
- **THEN** trang hiện "Chưa có giá. Lô hàng cũ có phế liệu chưa nhập kho được cho tới khi có giá."

#### Scenario: Có giá
- **WHEN** giá hiện hành là 7.500 ₫/kg do Giám Đốc cập nhật 20/10/2026
- **THEN** khối giá hiện hành hiện "7.500 ₫/kg" và "Giám Đốc · 20/10/2026"

### Requirement: Quyền đổi giá sắt vụn
Xem trang và đổi giá sắt vụn SHALL chỉ cho Giám đốc (`scrap-price.manage`). Server SHALL kiểm quyền ở mọi lệnh.

#### Scenario: Kế toán đổi giá
- **WHEN** `thuha` (Kế toán) gửi `POST /api/settings/scrap-price`
- **THEN** API trả 403 **AND** giá hiện hành không đổi

#### Scenario: Kinh doanh mở trang
- **WHEN** `quocbao` (Kinh doanh) mở `/settings/scrap-price`
- **THEN** nhận trang 403
