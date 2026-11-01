# company-settings Specification

## Purpose
TBD - created by archiving change company-settings. Update Purpose after archive.

## Requirements

### Requirement: Company Profile Storage

The system MUST persist company information in a dedicated singleton table `company_profile` (`id = 1`) including legal name, short name, tax ID, address, phone number, email, website, bank account, bank name, logo URL, updatedBy, and updatedAt.

#### Scenario: Truy vấn thông tin công ty thành công
- **GIVEN** hệ thống đã khởi tạo bảng `company_profile` với 1 dòng mặc định
- **WHEN** người dùng thực hiện yêu cầu lấy thông tin công ty
- **THEN** hệ thống trả về thông tin hồ sơ công ty đầy đủ

### Requirement: Company Information Validation

The system MUST validate company profile input: name is mandatory (1-255 characters), tax ID if present MUST match Vietnamese tax ID format (10 or 13 digits), phone if present MUST be 8-20 characters, and logo Data URL if present MUST NOT exceed 500 KB.

#### Scenario: Mã số thuế không đúng định dạng bị từ chối
- **GIVEN** Giám đốc đang chỉnh sửa thông tin công ty
- **WHEN** nhập mã số thuế không hợp lệ (ví dụ: `123`, `ABCXYZ`)
- **THEN** hệ thống trả về lỗi 400 kèm thông báo định dạng mã số thuế không hợp lệ

#### Scenario: Cập nhật thông tin công ty hợp lệ
- **GIVEN** Giám đốc nhập đầy đủ tên công ty và mã số thuế đúng định dạng 10 số
- **WHEN** gửi yêu cầu cập nhật thông tin công ty
- **THEN** hệ thống xác thực thành công và lưu thông tin vào cơ sở dữ liệu

### Requirement: Company Settings Permissions

The system MUST enforce role permissions: all authenticated users (`EVERYONE`) SHALL have permission `company.read` to fetch profile for display and printing, while only `DIRECTOR` SHALL have permission `company.manage` to update profile data.

#### Scenario: Người dùng không phải Giám đốc cố gắng cập nhật
- **GIVEN** người dùng đăng nhập với vai trò Kế toán hoặc Thủ kho
- **WHEN** gửi yêu cầu `PUT /api/settings/company`
- **THEN** hệ thống từ chối với mã phản hồi `403 Forbidden`

#### Scenario: Bất kỳ vai trò hợp lệ nào cũng đọc được thông tin công ty
- **GIVEN** người dùng đăng nhập với vai trò Kế toán, Kinh doanh hoặc Thủ kho
- **WHEN** gửi yêu cầu `GET /api/settings/company`
- **THEN** hệ thống trả về `200 OK` với thông tin công ty hiện hành

### Requirement: Company Profile Audit Logging

The system MUST record all company profile updates in `activity_log` under document type `SETTINGS` and code `COMPANY` within the same transaction, and MUST NOT write an activity log entry if no fields were changed.

#### Scenario: Ghi nhật ký khi thay đổi thông tin công ty
- **GIVEN** thông tin công ty hiện tại có tên "Công ty A"
- **WHEN** Giám đốc đổi tên thành "Công ty B"
- **THEN** một dòng nhật ký mới được tạo trong `activity_log` với loại `SETTINGS`, mã `COMPANY`, chi tiết thay đổi `name: "Công ty A" → "Công ty B"`

#### Scenario: Không ghi nhật ký khi dữ liệu không thay đổi
- **GIVEN** Giám đốc gửi yêu cầu cập nhật với dữ liệu giống hệt dữ liệu đang lưu trong cơ sở dữ liệu
- **WHEN** yêu cầu được thực thi thành công
- **THEN** không có bản ghi mới nào được thêm vào `activity_log`
