## MODIFIED Requirements

### Requirement: Bảng lợi nhuận gộp ba cột
Bảng SHALL có cột Kỳ này, Kỳ trước, Lũy kế năm; dòng Doanh thu (4 dòng con), Giá vốn và hao hụt (6 dòng con), Lợi nhuận gộp, Tỷ suất; dưới bảng ghi "Chi phí sửa đã chi trong kỳ" và "Công sản xuất đã chi trong kỳ" của từng cột, "Hàng cho thuê không trừ khấu hao", "Chưa gồm chi phí ngoài sổ kho (xe, nhân công…)" và "Hàng mất tính theo ngày trả, đền bù theo ngày duyệt". Cột có tiền thuê tạm tính SHALL có dấu "tạm tính".

#### Scenario: Khớp ô số
- **WHEN** Giám đốc xem tháng 10/2026
- **THEN** dòng Doanh thu và Lợi nhuận gộp của cột Kỳ này bằng đúng số trong ô Doanh thu và ô Lợi nhuận gộp

#### Scenario: Nhãn dòng và ghi chú
- **WHEN** Giám đốc xem bảng lợi nhuận gộp
- **THEN** có dòng "Giảm giá trị khi trả về đổi tình trạng", "Sửa chữa (lỗ hỏng hàng)", "Chênh lệch kiểm kê và điều chỉnh" **AND** dưới bảng có "Chưa gồm chi phí ngoài sổ kho (xe, nhân công…)"

#### Scenario: Công sản xuất dưới bảng
- **WHEN** Giám đốc xem tháng 11/2026, trong tháng chỉ có lệnh `LSX-2026-004` ghi sổ với công 5.100.000 ₫
- **THEN** dưới bảng cột Kỳ này có "Công sản xuất đã chi trong kỳ: 5.100.000 ₫" **AND** cột Kỳ trước (tháng 10/2026) ghi 0 ₫
