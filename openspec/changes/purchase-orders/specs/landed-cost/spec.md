# Spec Delta

## Purpose

Luật chia chi phí mua hàng (cước xe, bốc xếp, cầu đường...) vào giá nhập từng dòng hàng, và chia giá một dòng ra nhiều tình trạng. Đơn thu mua dùng để xem trước, phiếu nhập dùng để tính giá vốn thật.

## ADDED Requirements

### Requirement: Cách chia chi phí mua hàng
Chi phí mua hàng SHALL được chia vào các dòng hàng theo một trong hai cách: **theo giá trị** (tỷ lệ thành tiền của dòng) hoặc **theo trọng lượng** (tỷ lệ số kg của dòng). Số kg của dòng đặt theo cái = số cái × trọng lượng chuẩn của mã. Số kg của dòng đặt theo kg = số kg đó. Cách chia SHALL được chọn trên đơn thu mua, mặc định là theo giá trị. Dòng có số lượng 0 SHALL nhận 0 ₫ chi phí.

#### Scenario: Chia theo giá trị (số trên D3)
- **WHEN** chia 4.880.000 ₫ theo giá trị cho 4 dòng:
  - Khung 1,7m: 200 cái × 185.000 = 37.000.000 ₫
  - Chéo: 400 cái × 32.000 = 12.800.000 ₫
  - Mâm 1,6m: 150 cái × 145.000 = 21.750.000 ₫
  - Phế liệu sắt lẫn: 1.250,5 kg × 7.500 = 9.378.750 ₫
  - Tổng tiền hàng: 80.928.750 ₫
- **THEN** các dòng nhận 2.231.098 ₫, 771.840 ₫, 1.311.524 ₫, 565.538 ₫ **AND** tổng là đúng 4.880.000 ₫

#### Scenario: Chia theo trọng lượng
- **WHEN** chia 4.880.000 ₫ theo trọng lượng cho đúng 4 dòng trên. Trọng lượng chuẩn: Khung 13,5 kg, Chéo 2,8 kg, Mâm 11 kg. Số kg từng dòng: 2.700, 1.120, 1.650, 1.250,5; tổng 6.720,5 kg
- **THEN** các dòng nhận 1.960.568 ₫, 813.273 ₫, 1.198.125 ₫, 908.034 ₫ **AND** tổng là đúng 4.880.000 ₫

#### Scenario: Dòng số lượng 0
- **WHEN** một chuyến có dòng Mâm đánh dấu "Chuyến này không có" (0 cái) và chia 500.000 ₫ theo giá trị
- **THEN** dòng Mâm nhận 0 ₫ **AND** các dòng còn lại nhận đủ 500.000 ₫

#### Scenario: Không có chi phí
- **WHEN** tổng chi phí là 0 ₫
- **THEN** mọi dòng nhận 0 ₫

#### Scenario: Chia theo giá trị khi tiền hàng bằng 0
- **WHEN** chia 300.000 ₫ theo giá trị cho các dòng đều có đơn giá 0 ₫ (hàng cho không)
- **THEN** hệ thống báo "Tiền hàng bằng 0 nên không chia chi phí theo giá trị được, chọn chia theo trọng lượng"

#### Scenario: Có chi phí nhưng không có hàng
- **WHEN** chia 300.000 ₫ cho một danh sách không có dòng nào có số lượng lớn hơn 0
- **THEN** hệ thống báo "Không có hàng để chia chi phí"

### Requirement: Làm tròn khớp tổng
Mỗi phần chia SHALL là số nguyên đồng và tổng các phần SHALL bằng đúng số tiền đem chia. Cách làm:
1. Mỗi dòng trước hết nhận phần nguyên (làm tròn xuống) của phần chính xác.
2. Số đồng còn dư được cộng mỗi lần 1 ₫, cho các dòng có phần lẻ lớn nhất trước.
3. Hai dòng có phần lẻ bằng nhau thì dòng đứng trước nhận trước.

Kết quả SHALL không phụ thuộc thứ tự tính và SHALL không có dòng nào lệch quá 1 ₫ so với phần chính xác.

#### Scenario: Chia đều không hết
- **WHEN** chia 100 ₫ theo số lượng cho 3 dòng, mỗi dòng 1 cái
- **THEN** các dòng nhận 34 ₫, 33 ₫, 33 ₫

#### Scenario: Phần dư về dòng có phần lẻ lớn nhất
- **WHEN** chia 4.880.000 ₫ theo giá trị như kịch bản D3. Phần chính xác của 4 dòng: 2.231.098,34 / 771.839,43 / 1.311.524,03 / 565.538,20
- **THEN** sau khi lấy phần nguyên còn dư 1 ₫ **AND** 1 ₫ đó về dòng Chéo (phần lẻ 0,43 lớn nhất), thành 771.840 ₫

#### Scenario: Số lớn không sai
- **WHEN** chia 999.999.999 ₫ theo giá trị cho 2 dòng 9.000.000.000 ₫ và 1 ₫
- **THEN** tổng hai phần đúng 999.999.999 ₫ **AND** không có lỗi tràn số

### Requirement: Giá nhập một đơn vị
Giá nhập một đơn vị của dòng SHALL bằng (thành tiền + chi phí phân bổ) ÷ số lượng theo đơn vị đặt, làm tròn đến 1 ₫ (0,5 làm tròn lên). Giá này chỉ để hiển thị. Giá trị ghi sổ kho ở các change sau SHALL dùng tổng tiền đúng của dòng (thành tiền + chi phí phân bổ), không dùng giá một đơn vị nhân lại.

#### Scenario: Giá nhập trên D3
- **WHEN** dòng Khung 1,7m có 37.000.000 ₫ + 2.231.098 ₫, 200 cái
- **THEN** giá nhập hiện 196.155 ₫ / cái

#### Scenario: Giá nhập dòng kg
- **WHEN** dòng Phế liệu sắt lẫn có 9.378.750 ₫ + 565.538 ₫, 1.250,5 kg
- **THEN** giá nhập hiện 7.952 ₫ / kg

#### Scenario: Đúng nửa đồng
- **WHEN** dòng Mâm có 21.750.000 ₫ + 1.198.125 ₫, 150 cái (giá chính xác 152.987,5 ₫)
- **THEN** giá nhập hiện 152.988 ₫ / cái

### Requirement: Chia giá một dòng ra nhiều tình trạng
Hàng đã qua sử dụng mua theo lô chưa phân loại SHALL có **cùng giá nhập một cái** ở mọi tình trạng tách ra. Tổng tiền của dòng (thành tiền + chi phí phân bổ) SHALL được chia cho các tình trạng theo số cái, dùng cùng cách làm tròn khớp tổng. Mã tính theo kg chia theo số kg.

#### Scenario: Lô khung tách 3 tình trạng
- **WHEN** dòng Khung 1,7m có tổng 39.231.098 ₫ cho 200 cái, tách ra 150 Tốt, 38 Chờ sửa, 12 Phế liệu
- **THEN** giá trị từng tình trạng là 29.423.323 ₫, 7.453.909 ₫, 2.353.866 ₫ **AND** tổng là đúng 39.231.098 ₫

#### Scenario: Cả lô một tình trạng
- **WHEN** dòng Khung 1,7m tổng 39.231.098 ₫ được tách ra 200 Tốt, 0 Chờ sửa, 0 Phế liệu
- **THEN** Tốt nhận 39.231.098 ₫ **AND** hai tình trạng còn lại nhận 0 ₫
