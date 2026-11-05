# database-access Specification

## Purpose

Quy định role nào kết nối cơ sở dữ liệu cho việc gì, để ứng dụng chỉ có quyền tối thiểu: không đổi được cấu trúc bảng và không sửa, xóa được dữ liệu chỉ ghi thêm (sổ kho, nhật ký thao tác, giá sắt vụn).

## Requirements

### Requirement: Hai role kết nối tách biệt
Mỗi cơ sở dữ liệu của hệ thống SHALL có hai role: role owner (chủ mọi bảng, dùng cho migration, sao lưu, vận hành) và role app (role đăng nhập của ứng dụng, mặc định tên `erp_app`, đổi được bằng biến `DB_APP_ROLE`). Ứng dụng khi chạy (`DATABASE_URL`) SHALL kết nối bằng role app. Role app SHALL không là chủ bảng nào, không là superuser, không có quyền `CREATEROLE`, `CREATEDB`, `BYPASSRLS`, và không là thành viên của role có các quyền đó.

#### Scenario: App chạy bằng role app
- **WHEN** ứng dụng đang chạy trên demo và thực hiện `select current_user`
- **THEN** kết quả là `erp_app`, không phải role owner

#### Scenario: Role app không là chủ bảng
- **WHEN** kiểm tra chủ của 35 bảng hiện có trong schema `public`
- **THEN** không bảng nào có chủ là `erp_app`

### Requirement: Quyền tối thiểu trên bảng
Role app SHALL có `SELECT`, `INSERT` trên mọi bảng trong schema `public` và `USAGE` trên mọi sequence ở đó. Role app SHALL có `UPDATE`, `DELETE` trên mọi bảng trừ bảng chỉ ghi thêm: `inventory_ledger`, `activity_log`, `scrap_price`, `billing_period`, `billing_period_line`, `billing_period_freight`. Role app SHALL không có `TRUNCATE`, `REFERENCES`, `TRIGGER`, không có `CREATE` trên schema nào, không có quyền gì trên schema `drizzle`.

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

### Requirement: Role app không đổi được cấu trúc và trigger
Role app SHALL không chạy được lệnh DDL trên bảng có sẵn hay tạo đối tượng mới: `ALTER TABLE` (kể cả `DISABLE TRIGGER`), `DROP TABLE`, `CREATE TABLE`, `CREATE FUNCTION`, và không đổi được `session_replication_role`.

#### Scenario: Tắt trigger sổ kho bị từ chối
- **WHEN** role app chạy `ALTER TABLE inventory_ledger DISABLE TRIGGER inventory_ledger_no_update_delete`
- **THEN** PostgreSQL từ chối (mã `42501`, phải là chủ bảng), trigger vẫn bật

#### Scenario: Xóa bảng nhật ký bị từ chối
- **WHEN** role app chạy `DROP TABLE activity_log`
- **THEN** bị từ chối với mã `42501`

#### Scenario: Tạo bảng mới bị từ chối
- **WHEN** role app chạy `CREATE TABLE public.x (id int)`
- **THEN** bị từ chối với mã `42501`

#### Scenario: Bỏ qua trigger bằng chế độ sao chép bị từ chối
- **WHEN** role app chạy `SET session_replication_role = replica`
- **THEN** bị từ chối với mã `42501`

### Requirement: Migration chạy bằng role owner
Lệnh migration SHALL chỉ kết nối bằng `DATABASE_URL_MIGRATE` (role owner) và SHALL không dùng `DATABASE_URL` thay thế. Thiếu biến này thì lệnh SHALL dừng trước khi kết nối, mã thoát khác 0, thông báo nêu tên `DATABASE_URL_MIGRATE` và không in giá trị bí mật.

#### Scenario: Thiếu URL migrate
- **WHEN** chạy `npm run db:migrate` chỉ có `DATABASE_URL`, không có `DATABASE_URL_MIGRATE`
- **THEN** lệnh dừng, mã thoát 1, thông báo có chữ `DATABASE_URL_MIGRATE`, không có migration nào chạy

### Requirement: Migration tự cấp và kiểm tra quyền role app
Sau khi áp migration, lệnh migration SHALL cấp lại quyền cho role app theo yêu cầu "Quyền tối thiểu trên bảng", chạy lại nhiều lần cho cùng kết quả và tự cấp cho bảng mới, rồi kiểm tra lại. Role app chưa tồn tại, hoặc còn quyền vượt mức sau khi cấp, thì lệnh SHALL thoát mã khác 0 và nêu rõ quyền nào sai.

#### Scenario: Bảng mới tự được cấp quyền
- **WHEN** một migration mới tạo bảng `contract` rồi chạy `npm run db:migrate`
- **THEN** role app có `SELECT`, `INSERT`, `UPDATE`, `DELETE` trên `contract` mà không cần viết `GRANT` trong migration đó

#### Scenario: Chạy lại không đổi kết quả
- **WHEN** chạy `npm run db:migrate` hai lần liên tiếp không có migration mới
- **THEN** cả hai lần thành công, quyền của role app giống hệt nhau

#### Scenario: Chưa tạo role app
- **WHEN** chạy `npm run db:migrate` trên cơ sở dữ liệu chưa có role `erp_app`
- **THEN** migration vẫn áp xong, nhưng lệnh thoát mã 1 với thông báo role `erp_app` chưa có và chỉ tới hướng dẫn tạo role

#### Scenario: Role app có quyền vượt mức
- **WHEN** ai đó đã chạy tay `GRANT UPDATE ON inventory_ledger TO erp_app` rồi chạy `npm run db:migrate`
- **THEN** bước cấp quyền thu hồi `UPDATE` đó, kiểm tra lại thấy đúng mức và lệnh thành công

### Requirement: URL owner không nằm trên server app
Ở môi trường `production`, ứng dụng SHALL từ chối khởi động nếu biến `DATABASE_URL_MIGRATE` có mặt trong môi trường của server app, với thông báo nêu tên biến và không in giá trị.

#### Scenario: Lỡ đặt URL migrate trên Vercel
- **WHEN** khởi động bản production có cả `DATABASE_URL` và `DATABASE_URL_MIGRATE`
- **THEN** ứng dụng không chạy, lỗi nêu `DATABASE_URL_MIGRATE` không được đặt trên server app

#### Scenario: Môi trường dev vẫn chạy
- **WHEN** chạy `npm run dev` với `.env` có cả hai biến
- **THEN** ứng dụng chạy bình thường

### Requirement: Mỗi cơ sở dữ liệu có cặp role riêng
Tên role app SHALL cấu hình được qua `DB_APP_ROLE` (mặc định `erp_app`) để khi mỗi công ty có cơ sở dữ liệu riêng, mỗi cơ sở dữ liệu có role app riêng. Role app của một cơ sở dữ liệu SHALL không có quyền `CONNECT` vào cơ sở dữ liệu khác của hệ thống.

#### Scenario: Hai công ty trên cùng máy chủ
- **WHEN** cơ sở dữ liệu `erp_cty_a` cấp quyền cho `cty_a_app` và `erp_cty_b` cấp cho `cty_b_app`
- **THEN** `cty_a_app` kết nối `erp_cty_b` bị từ chối và không đọc được bảng nào của `erp_cty_b`
