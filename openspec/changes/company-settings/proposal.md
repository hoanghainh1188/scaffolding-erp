# Proposal: company-settings (K10)

Cài đặt thông tin công ty (tên, mã số thuế, địa chỉ, số điện thoại, email, tài khoản ngân hàng, logo) phục vụ tiêu đề app và các biểu mẫu in ấn, do Giám đốc quản lý và có ghi nhật ký kiểm toán.

Refs: #77

## Why

Theo quy ước 0.2 #33 mục 4 và CLAUDE.md: không viết cứng thông tin doanh nghiệp (tên, MST, địa chỉ, hotline, logo) trên giao diện hay các chứng từ in ấn (phiếu nhập, phiếu sửa chữa, hợp đồng bán/thuê), mà phải lưu trong bảng cài đặt để giữ đường lui cho mô hình SaaS (mỗi công ty một database riêng).

Hiện tại hệ thống chưa có bảng cấu hình này. Cần bổ sung bảng cài đặt công ty, API quản lý với phân quyền nghiêm ngặt (chỉ Giám đốc được sửa, tất cả vai trò được đọc để hiển thị và in ấn) và ghi nhận vết thay đổi vào nhật ký hoạt động D18.

## What Changes

1. **Schema CSDL (`src/db/schema/company.ts`)**:
   - Tạo bảng `company_profile` (dạng singleton row: `id = 1`) lưu trữ:
     - `name`: Tên công ty đầy đủ (bắt buộc, 1–255 ký tự).
     - `shortName`: Tên viết tắt / hiển thị ngắn (tùy chọn, tối đa 50 ký tự).
     - `taxId`: Mã số thuế doanh nghiệp (tùy chọn, định dạng 10 hoặc 13 chữ số theo luật VN).
     - `address`: Địa chỉ trụ sở / văn phòng (tùy chọn, tối đa 500 ký tự).
     - `phone`: Số điện thoại / hotline (tùy chọn, 8–20 ký tự).
     - `email`: Email liên hệ (tùy chọn).
     - `website`: Website (tùy chọn).
     - `bankAccount`: Số tài khoản ngân hàng (tùy chọn, tối đa 50 ký tự).
     - `bankName`: Tên ngân hàng & chi nhánh (tùy chọn, tối đa 200 ký tự).
     - `logoUrl`: Chuỗi URL hoặc data URL (base64 image, tối đa 500KB) hỗ trợ Vercel serverless.
     - `updatedBy`: ID người cập nhật (FK `user.id`).
     - `updatedAt`: Thời điểm cập nhật.

2. **Domain Logic & Validation (`src/domain/tax-id.ts`, `src/domain/company.ts`)**:
   - Kiểm tra định dạng Mã số thuế Việt Nam (`^\d{10}(-\d{3})?$`).
   - Kiểm tra giới hạn độ dài và định dạng email, phone, logo size.

3. **Phân quyền (`src/domain/permissions.ts`)**:
   - `company.read`: Cho phép mọi vai trò (`EVERYONE`) đọc thông tin để hiển thị trên app header và phiếu in.
   - `company.manage`: Chỉ vai trò Giám đốc (`["DIRECTOR"]`) có quyền chỉnh sửa.

4. **Service & Activity Log (`src/lib/company/`)**:
   - Hàm `getCompanyProfile()` và `updateCompanyProfile(db, actor, input)`.
   - Ghi nhật ký vào `activity_log` (loại `SETTINGS`, mã `COMPANY`) khi có sự thay đổi thực tế. Nếu không có trường nào thay đổi thì không ghi nhật ký.

5. **API Routes (`src/app/api/settings/company/route.ts`)**:
   - `GET /api/settings/company`: Đọc thông tin công ty.
   - `PUT /api/settings/company`: Cập nhật thông tin công ty (yêu cầu quyền `company.manage`).

6. **Màn hình giao diện (`src/components/settings/company-profile-form.tsx`, `/settings/company`)**:
   - Giao diện form cập nhật thông tin công ty cho Giám đốc.

## Impact & Migration

- Tạo bảng mới `company_profile` với một bản ghi mặc định khởi tạo.
- Không ảnh hưởng đến dữ liệu hay các tính năng hiện hữu.
