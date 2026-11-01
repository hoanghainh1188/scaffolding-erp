# Design: company-settings (K10)

## Overview

Tài liệu thiết kế chi tiết cho bảng cấu hình thông tin doanh nghiệp (`company_profile`), phục vụ cho các biểu mẫu in ấn (phiếu nhập hàng, phiếu sửa chữa, hợp đồng bán/cho thuê...) và thông tin hiển thị trên app, đảm bảo tuân thủ nguyên tắc giữ đường lui cho SaaS (0.2 #33 mục 4) và hoạt động bền vững trên môi trường Vercel serverless + Neon Postgres.

---

## Decisions

### 1. Cấu trúc bảng: Một dòng cố định (Singleton Table) hay Key–Value? Tách riêng hay chung với `scrap_price`?

- **Quyết định**: Sử dụng bảng riêng có cấu trúc cột rõ ràng, giới hạn duy nhất 1 dòng (`id = 1` hoặc singleton constraint):
  ```sql
  CREATE TABLE company_profile (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    name text NOT NULL,
    short_name text,
    tax_id text,
    address text,
    phone text,
    email text,
    website text,
    bank_account text,
    bank_name text,
    logo_url text,
    updated_by text REFERENCES "user"(id) ON DELETE RESTRICT,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  ```
- **Lý do**:
  1. *So với Key–Value*: Bảng có cột tường minh có kiểu dữ liệu rõ ràng (Zod schema và Drizzle schema), hỗ trợ constraint kiểm tra ở mức DB (độ dài, tax_id format), tránh việc phải ép kiểu từ `string` và không bị lỗi sai sót key name khi truy vấn.
  2. *So với gộp vào `scrap_price`*: Bảng `scrap_price` là bảng lịch sử dạng ghi thêm (append-only) theo thời gian, được liên kết khóa ngoại vào các phiếu nhập kho (`goods_receipt.scrap_price_id`). Thông tin công ty là thông tin hồ sơ thực thể (entity profile), sửa đổi tại chỗ và lưu vết qua `activity_log`, hoàn toàn khác biệt về mặt bản chất nghiệp vụ.

### 2. Lưu trữ Logo trên môi trường Vercel (Serverless, Ephemeral Disk)

- **Quyết định**: Lưu trữ logo dưới dạng chuỗi trong cột `logo_url text`:
  - Hỗ trợ **Data URL** (base64 image, ví dụ: `data:image/png;base64,...`, `data:image/jpeg;base64,...` hoặc `data:image/svg+xml;base64,...`) với giới hạn kích thước tối đa 500 KB.
  - Hỗ trợ **URL tuyệt đối** (`https://...`) nếu doanh nghiệp lưu trữ ảnh trên CDN/hosting ngoài.
- **Lý do**:
  1. Vercel là môi trường serverless không có ổ đĩa ghi vĩnh viễn (read-only filesystem).
  2. Lưu logo (dung lượng nhỏ < 500 KB) trực tiếp dưới dạng Data URL trong DB loại bỏ sự phụ thuộc vào các dịch vụ lưu trữ đám mây bên thứ ba (như S3, Cloudflare R2, Vercel Blob), giúp mã nguồn chạy ổn định tức thì trên cả môi trường local Docker, CI/CD, Neon test branch và Vercel production mà không cần cấu hình thêm API keys/credentials.
  3. Dễ dàng nhúng trực tiếp vào thẻ `<img src={profile.logoUrl} />` trong cả giao diện web lẫn bản xem trước khi in ấn (`@media print` / `window.print()`).

### 3. Phân quyền, Thẩm định Dữ liệu (MST) & Màn hình

- **Phân quyền**:
  - Đọc (`company.read`): Mọi vai trò (`EVERYONE`: Giám đốc, Kế toán, Kinh doanh, Thủ kho, Xưởng) đều có quyền đọc thông tin công ty để hiển thị tiêu đề và in ấn biểu mẫu.
  - Chỉnh sửa (`company.manage`): Chỉ vai trò Giám đốc (`["DIRECTOR"]`) mới có quyền cập nhật thông tin.
- **Kiểm tra Mã số thuế (MST)**:
  - Theo quy chuẩn Tổng cục Thuế Việt Nam (Thông tư 105/2020/TT-BTC):
    - Doanh nghiệp chính: gồm đúng 10 chữ số (`^\d{10}$`).
    - Chi nhánh / đơn vị trực thuộc: gồm 13 chữ số, có thể có dấu gạch ngang phân cách 3 số cuối (`^\d{10}-\d{3}$` hoặc `^\d{13}$`).
  - Hàm thẩm định `isValidTaxId(taxId)` chuẩn hóa loại bỏ khoảng trắng thừa và kiểm tra regex `^(\d{10}|\d{10}-\d{3}|\d{13})$`.
- **Màn hình giao diện**:
  - Tích hợp vào khu vực Cài đặt hệ thống: trang `/settings/company` (hoặc tab "Thông tin công ty" trong `/settings`), chỉ hiển thị với vai trò Giám đốc.
  - Sử dụng chung ngôn ngữ thiết kế Bright Blue Base, token chuẩn, có nút upload logo với preview tức thì, các ô nhập: Tên công ty (*), Tên viết tắt, Mã số thuế, Địa chỉ, Hotline, Email, Website, Thông tin ngân hàng.

### 4. Ghi nhật ký thay đổi (`activity_log`)

- **Cơ chế ghi nhật ký**:
  - Mọi thao tác cập nhật `updateCompanyProfile` phải chạy trong 1 transaction và gọi `logActivity(tx, actor, ...)`.
  - Loại tài liệu: `document: { type: "SETTINGS", code: "COMPANY", label: "Cài đặt công ty" }`.
  - Tóm tắt: `"Cập nhật thông tin công ty"`.
  - Liệt kê chi tiết các trường thay đổi qua `diffFields(before, after)`: Tên công ty, MST, Địa chỉ, Số điện thoại, v.v.
  - **Quy tắc quan trọng**: Nếu người dùng nhấn Lưu nhưng không có bất kỳ trường nào thay đổi giá trị so với hiện tại, hàm service **không ghi nhật ký** (tránh làm rác `activity_log`).
