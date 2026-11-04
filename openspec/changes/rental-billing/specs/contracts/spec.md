## MODIFIED Requirements

### Requirement: Cách tính tiền thuê theo hợp đồng
Tiền thuê của một lượng hàng SHALL = giá ngày × số ngày tính × số lượng. Số ngày = ngày trả − ngày xuất (không tính ngày xuất, tính ngày trả), trừ các ngày nghỉ chung không tính thuê (capability `rental-holidays`). Số ngày tính của **từng lượng hàng xuất** SHALL không nhỏ hơn số ngày thuê tối thiểu của hợp đồng (0.2 #74); lượng hàng chuyển sang hợp đồng khác **cùng nhà thầu** không áp tối thiểu ở hợp đồng đi và tính tối thiểu tiếp ở hợp đồng nhận từ ngày xuất gốc (0.2 #70). Số ngày thuê tối thiểu mặc định 45, đặt ở một chỗ duy nhất. Hàng chưa trả tính tới ngày đang tính. Giá tháng SHALL chỉ để hiện: giá ngày × số ngày của tháng; không quy giá tháng ra giá ngày. Cách chia theo kỳ, tách dòng và chốt kỳ theo capability `rental-billing`. Các ví dụ dưới đây khi bảng ngày nghỉ trống, trừ ví dụ có ghi ngày nghỉ.

#### Scenario: Thuê quá 45 ngày
- **WHEN** 600 `H1,7` giá 1.200 ₫/ngày xuất 01/11/2026, trả 21/03/2027
- **THEN** số ngày là 140 và tiền thuê là 100.800.000 ₫

#### Scenario: Trả sớm hơn 45 ngày
- **WHEN** 100 `H1,7` giá 1.200 ₫/ngày xuất 01/11/2026, trả 21/11/2026 (20 ngày)
- **THEN** số ngày tính là 45 và tiền thuê là 5.400.000 ₫

#### Scenario: Trả đúng ngày thứ 45
- **WHEN** 100 `H1,7` giá 1.200 ₫/ngày xuất 01/11/2026, trả 16/12/2026
- **THEN** số ngày là 45 và tiền thuê là 5.400.000 ₫

#### Scenario: Trả một phần giữa chừng
- **WHEN** 600 `H1,7` giá 1.200 ₫/ngày xuất 01/11/2026; 200 cái trả 20/01/2027, 400 cái trả 21/03/2027
- **THEN** tiền thuê là 200 × 80 × 1.200 + 400 × 140 × 1.200 = 19.200.000 + 67.200.000 = 86.400.000 ₫

#### Scenario: Tối thiểu theo từng lượng hàng
- **WHEN** 100 `H1,7` giá 1.200 ₫/ngày xuất 01/11/2026 và 100 `H1,7` xuất 01/12/2026; ngày 21/12/2026 trả 100 cái
- **THEN** 100 cái trả là lượng xuất 01/11/2026 (50 ngày, không bù) **AND** lượng xuất 01/12/2026 vẫn đang thuê, chưa có bù

#### Scenario: Trừ ngày nghỉ
- **WHEN** bảng ngày nghỉ có Tết 05/02 – 13/02/2027 và 100 `H1,7` giá 1.200 ₫/ngày xuất 01/01/2027, trả 31/03/2027
- **THEN** số ngày là 89 − 9 = 80 và tiền thuê là 9.600.000 ₫

#### Scenario: Số lượng 0
- **WHEN** tính tiền thuê cho 0 cái `H1,7`
- **THEN** tiền thuê là 0 ₫, không áp số ngày tối thiểu

#### Scenario: Hợp đồng đặt thuê tối thiểu khác
- **WHEN** hợp đồng ghi thuê tối thiểu 30 ngày và 100 `H1,7` giá 1.200 ₫/ngày trả sau 20 ngày
- **THEN** tiền thuê là 100 × 30 × 1.200 = 3.600.000 ₫

#### Scenario: Giá tháng hiển thị theo số ngày của tháng
- **WHEN** tiền thuê 1 ngày của hợp đồng là 1.330.000 ₫
- **THEN** D5a, D5 hiện "tháng 30 ngày ≈ 39.900.000 ₫, tháng 31 ngày ≈ 41.230.000 ₫"

#### Scenario: Đổi giá giữa chừng
- **WHEN** 600 `H1,7` xuất 01/11/2026, trả 21/03/2027, giá 1.200 ₫/ngày tới hết 14/12/2026 và 1.400 ₫/ngày từ 15/12/2026 theo phụ lục
- **THEN** tiền thuê là 600 × (43 × 1.200 + 97 × 1.400) = 30.960.000 + 81.480.000 = 112.440.000 ₫
