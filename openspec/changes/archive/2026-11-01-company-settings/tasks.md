# Tasks

## 1. Domain & Validation

- [x] 1.1 Tạo helper kiểm tra mã số thuế Việt Nam trong `src/domain/tax-id.ts` và unit tests.
- [x] 1.2 Tạo Zod schema xác thực thông tin công ty trong `src/domain/company.ts` và unit tests.

## 2. Database Schema & Migration

- [x] 2.1 Định nghĩa bảng `company_profile` trong `src/db/schema/company.ts` và export trong `src/db/schema/index.ts`.
- [x] 2.2 Tạo migration SQL tạo bảng `company_profile` với dòng khởi tạo mặc định.
- [x] 2.3 Viết schema integration test trong `src/db/schema/company.int.test.ts`.

## 3. Permissions & Service Layer

- [x] 3.1 Bổ sung quyền `company.read` và `company.manage` vào `src/domain/permissions.ts`.
- [x] 3.2 Viết service `src/lib/company/service.ts`: `getCompanyProfile` và `updateCompanyProfile`.
- [x] 3.3 Tích hợp `logActivity` ghi nhận chi tiết thay đổi và bỏ qua khi không đổi trường nào.
- [x] 3.4 Viết integration test trong `src/lib/company/service.int.test.ts` kiểm tra phân quyền, cập nhật và nhật ký kiểm toán.

## 4. API Endpoints

- [x] 4.1 Tạo route `GET` và `PUT` tại `src/app/api/settings/company/route.ts` với `withAuth`.
- [x] 4.2 Viết integration test cho API trong `src/app/api/settings/company/company-api.int.test.ts`.

## 5. UI Settings Screen

- [x] 5.1 Tạo component form `src/components/settings/company-profile-form.tsx` với preview logo và thông báo kết quả.
- [x] 5.2 Tích hợp trang `/settings/company` (hoặc tab Cài đặt công ty) cho Giám đốc.
- [x] 5.3 Viết component test cho `CompanyProfileForm`.

## 6. Verification

- [x] 6.1 Chạy `npx openspec validate company-settings --strict`.
- [x] 6.2 Chạy `npm run lint && npm run typecheck && npm test`.

## Workflow follow-up

- Dừng lại sau khi propose để Giám đốc duyệt trước khi apply.
