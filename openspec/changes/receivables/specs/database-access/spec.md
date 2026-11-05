## MODIFIED Requirements

### Requirement: Quyền tối thiểu trên bảng
Role app SHALL có `SELECT`, `INSERT` trên mọi bảng trong schema `public` và `USAGE` trên mọi sequence ở đó. Role app SHALL có `UPDATE`, `DELETE` trên mọi bảng trừ bảng chỉ ghi thêm: `inventory_ledger`, `activity_log`, `scrap_price`, `billing_period`, `billing_period_line`, `billing_period_freight`, `receipt`, `receipt_allocation`, `receipt_cancellation`, `contract_settlement` (công nợ phải thu). Role app SHALL không có `TRUNCATE`, `REFERENCES`, `TRIGGER`, không có `CREATE` trên schema nào, không có quyền gì trên schema `drizzle`.

#### Scenario: Ghi thêm dòng sổ kho được
- **WHEN** role app ghi phiếu nhập 120 cây `GG-K17` tình trạng Tốt vào `BAI-01`
- **THEN** dòng `PURCHASE_IN` số lượng 120 được thêm vào `inventory_ledger`

#### Scenario: Sửa dòng sổ kho bị từ chối
- **WHEN** role app chạy `UPDATE inventory_ledger SET quantity = 200 WHERE id = 1`
- **THEN** PostgreSQL từ chối với lỗi thiếu quyền (mã `42501`), dòng 1 giữ số lượng cũ

#### Scenario: Xóa nhật ký bị từ chối
- **WHEN** role app chạy `DELETE FROM activity_log`
- **THEN** PostgreSQL từ chối với lỗi thiếu quyền (mã `42501`), số dòng nhật ký không đổi

#### Scenario: TRUNCATE bị từ chối
- **WHEN** role app chạy `TRUNCATE inventory_ledger`, `TRUNCATE activity_log` hoặc `TRUNCATE purchase_order`
- **THEN** cả ba lệnh bị từ chối với mã `42501`

#### Scenario: Sửa giá sắt vụn đã ghi bị từ chối
- **WHEN** role app chạy `UPDATE scrap_price SET price_per_kg = 8000`
- **THEN** bị từ chối với mã `42501`; giá 7.500 ₫/kg đã ghi giữ nguyên

#### Scenario: Bảng thường vẫn sửa được
- **WHEN** role app sửa tên vật tư `GG-K17` hoặc xóa đơn thu mua nháp chưa có phiếu nhập
- **THEN** thao tác thành công như trước change này

#### Scenario: Sửa kỳ tiền thuê đã chốt bị từ chối
- **WHEN** role app chạy `UPDATE billing_period SET total_amount = 0` hoặc `DELETE FROM billing_period_line`
- **THEN** cả hai lệnh bị từ chối với mã `42501`; kỳ đã chốt giữ nguyên số

#### Scenario: Sửa phiếu thu bị từ chối
- **WHEN** role app chạy `UPDATE receipt SET amount = 0` hoặc `DELETE FROM receipt_allocation`
- **THEN** cả hai lệnh bị từ chối với mã `42501`; phiếu thu và phân bổ giữ nguyên
