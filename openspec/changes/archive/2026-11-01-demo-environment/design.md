# Design: demo-environment (K9)

## Overview

Tài liệu thiết kế chi tiết cho chế độ demo (`DEMO_MODE`), đảm bảo môi trường thử nghiệm trên Vercel + Neon vận hành ổn định, bảo vệ các tài khoản dùng chung, hiển thị thông tin rõ ràng và hỗ trợ seed dữ liệu theo thời gian thực tế.

---

## Decisions

### 1. Cấu hình `DEMO_MODE` trong `src/lib/env.ts`

- **Tên biến**: `DEMO_MODE` (boolean).
- **Giá trị mặc định**: `false`.
- **Cú pháp hợp lệ**: Nhận diện `true`, `false`, `1`, `0`, `yes`, `no` (không phân biệt hoa thường).
- **An toàn phòng tránh bật nhầm trên Production thật**:
  - `DEMO_MODE` chỉ phục vụ các database demo/thử nghiệm (ví dụ nhánh Neon `demo` hoặc local).
  - Có thể export helper:
    ```ts
    export function isDemoMode(): boolean {
      return getEnv().DEMO_MODE;
    }
    ```

### 2. Danh sách tài khoản demo và cơ chế bảo vệ

- **Danh sách tài khoản được bảo vệ**:
  Khớp với `DEV_ACCOUNTS` trong `src/lib/users/seed.ts`:
  - `giamdoc` (Giám đốc)
  - `ketoan` (Kế toán)
  - `kinhdoanh` (Kinh doanh)
  - `thukho` (Thủ kho)
  - `xuong` (Xưởng)
  - Helper: `isDemoAccount(username: string): boolean`.

- **Các thao tác bị chặn khi `DEMO_MODE=true`**:
  1. **Tự đổi mật khẩu** (`src/lib/auth/change-password.ts`):
     - Chặn tài khoản demo tự đổi mật khẩu cá nhân.
     - HTTP Status: `400 Bad Request`.
     - Thông báo lỗi: `"Tài khoản demo dùng chung không được đổi mật khẩu"`.
  2. **Đặt lại mật khẩu từ Giám đốc** (`resetPassword` trong `src/lib/users/service.ts`):
     - Chặn Giám đốc đặt lại mật khẩu cho bất kỳ tài khoản nào trong danh sách 5 tài khoản demo.
     - HTTP Status: `409 Conflict`.
     - Thông báo lỗi: `"Tài khoản demo dùng chung không thể đặt lại mật khẩu"`.
  3. **Khóa tài khoản** (`lockUser` trong `src/lib/users/service.ts`):
     - Chặn Giám đốc khóa tài khoản demo.
     - HTTP Status: `409 Conflict`.
     - Thông báo lỗi: `"Tài khoản demo dùng chung không thể khóa"`.
  4. **Đổi vai trò** (`changeRole` trong `src/lib/users/service.ts`):
     - Chặn thay đổi vai trò của 5 tài khoản demo.
     - HTTP Status: `409 Conflict`.
     - Thông báo lỗi: `"Tài khoản demo dùng chung không thể đổi vai trò"`.

- **Tài khoản mới tạo**:
  - Giám đốc vẫn có thể tạo thêm tài khoản mới trên màn hình D17 để thử nghiệm tính năng tạo người dùng và cấp mật khẩu tạm.
  - Các tài khoản mới tạo này (không thuộc danh sách 5 tài khoản demo) vẫn có thể đổi mật khẩu, bị khóa hoặc đổi vai trò bình thường.

### 3. Thành phần Banner Demo (`<DemoBanner />`)

- **Nội dung hiển thị**:
  `"Bản thử nghiệm — Dữ liệu được làm mới vào 0:00 mỗi ngày"`
- **Vị trí**:
  - Đặt ở đầu trang trong `src/app/layout.tsx` (ngay đầu thẻ `<body>`), giúp xuất hiện đồng bộ ở mọi màn hình (trang đăng nhập `/login`, desktop app `/dashboard`, `/inventory`... và mobile app `/m`).
- **Giao diện & Màu sắc (Design Tokens)**:
  - Nền tone cảnh báo/nhắc nhở nổi bật nhưng tinh tế: `bg-amber-500 text-amber-950 font-medium text-xs sm:text-sm py-1.5 px-3 text-center border-b border-amber-600/20 shadow-sm`.
  - Có icon thông báo nhẹ nhàng (ví dụ `Info` hoặc `AlertTriangle` của Lucide) và text căn giữa, không chiếm dụng nhiều không gian làm việc.

### 4. Lệnh Seed Demo (`scripts/seed-demo.mts`)

- **Cách thức chạy**: `npm run db:seed:demo`.
- **Điều kiện chạy**:
  - Chạy được ở `NODE_ENV=production` nếu `DEMO_MODE=true`.
  - Từ chối nếu `NODE_ENV=production` mà `DEMO_MODE=false`:
    `"db:seed:demo từ chối chạy ở production khi DEMO_MODE tắt.\n"`
- **Dời ngày mẫu theo thời điểm chạy**:
  - Lấy ngày hiện tại ở múi giờ Việt Nam (`Asia/Ho_Chi_Minh`).
  - Ngày mẫu gốc được thiết lập quanh 27–28/10/2026. Hàm seed demo sẽ tính khoảng chênh lệch số ngày giữa ngày gốc và ngày chạy hiện tại, dời các mốc thời gian giao dịch (đơn thu mua D3, phiếu nhập M3, xuất kho, kiểm kê D13) tương ứng về thời điểm gần nhất (ví dụ hôm nay, hôm qua, vài ngày trước).

### 5. Hỗ trợ Vercel Preview cho `BETTER_AUTH_URL`

- Trong `src/lib/env.ts`:
  Khi `NODE_ENV === "production"`, nếu không có `BETTER_AUTH_URL` cấu hình tường minh, kiểm tra:
  ```ts
  if (!authUrl && source.VERCEL_ENV === "preview" && source.VERCEL_URL) {
    return `https://${source.VERCEL_URL}`;
  }
  ```
  Nhờ đó, các deployment xem trước (Preview deployments) cho từng Pull Request của Vercel tự động hoạt động chức năng đăng nhập/xác thực của Better Auth mà không cần người dùng can thiệp cấu hình.

### 6. Thẻ Meta Robots `noindex` khi Demo

- Trong `src/app/layout.tsx`:
  Bổ sung vào `metadata`:
  ```ts
  export async function generateMetadata(): Promise<Metadata> { ... }
  // hoặc cấu hình động robots
  robots: isDemoMode() ? { index: false, follow: false } : undefined
  ```
  Đảm bảo các bot tìm kiếm (Google, Bing, v.v.) không bao giờ thu thập và lập chỉ mục nội dung trang demo.
