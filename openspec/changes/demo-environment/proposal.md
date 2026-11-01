# Proposal: demo-environment (K9)

Chế độ demo (`DEMO_MODE`) cho bản thử nghiệm trên internet: hiển thị banner cảnh báo, bảo vệ các tài khoản demo dùng chung, tự động hỗ trợ preview trên Vercel và seed dữ liệu mẫu theo ngày chạy.

Refs: #76

## Why

Khi triển khai bản demo thử nghiệm trên Vercel + Neon cho khách hàng và nhân viên trải nghiệm (theo kế hoạch `docs/deploy-demo-plan.md`):
1. **Bảo vệ tài khoản dùng chung**: 5 tài khoản demo tương ứng với 5 vai trò (`giamdoc`, `ketoan`, `kinhdoanh`, `thukho`, `xuong`) được chia sẻ cho nhiều người cùng thử. Nếu ai đó đổi mật khẩu hoặc dùng tài khoản `giamdoc` khóa / đặt lại mật khẩu của người khác trên màn hình D17, những người sau sẽ không thể đăng nhập trải nghiệm.
2. **Nhận biết môi trường**: Người dùng cần biết rõ đây là bản thử nghiệm với dữ liệu giả định, dữ liệu được tự động làm mới vào 0:00 mỗi ngày, tránh nhầm lẫn với môi trường làm việc chính thức hoặc nhập dữ liệu nhạy cảm (như CCCD, STK thật).
3. **Chặn công cụ tìm kiếm**: Cần thêm `noindex, nofollow` để Google và các công cụ tìm kiếm không lập chỉ mục bản demo.
4. **Linh hoạt cho bản Vercel Preview**: Mỗi pull request trên Vercel sinh ra một URL preview riêng (`VERCEL_URL`); Better Auth cần URL này để xử lý redirect/cookie mà không bắt buộc người quản trị phải cấu hình thủ công `BETTER_AUTH_URL` cho từng PR.
5. **Dữ liệu mẫu linh hoạt theo thời gian**: Script `npm run db:seed:dev` hiện tại cố định ngày 27–28/10/2026 và từ chối chạy khi `NODE_ENV=production`. Cần lệnh `npm run db:seed:demo` có thể chạy được trên môi trường demo và dịch chuyển ngày mẫu sang mốc thời gian gần thời điểm chạy.

## What Changes

1. **Biến môi trường (`src/lib/env.ts`)**:
   - Thêm biến `DEMO_MODE` (boolean, mặc định `false`).
   - Tự động suy diễn `BETTER_AUTH_URL = https://${process.env.VERCEL_URL}` khi `VERCEL_ENV=preview` và chưa cấu hình `BETTER_AUTH_URL`.
2. **Bảo vệ tài khoản demo**:
   - Trong `src/lib/auth/change-password.ts`: Chặn đổi mật khẩu đối với 5 tài khoản demo khi `DEMO_MODE=true` với thông báo `"Tài khoản demo dùng chung không được đổi mật khẩu"`.
   - Trong `src/lib/users/service.ts`: Chặn các thao tác khóa tài khoản (`lockUser`), đặt lại mật khẩu (`resetPassword`), đổi vai trò (`changeRole`) đối với 5 tài khoản demo khi `DEMO_MODE=true`.
3. **Banner cảnh báo demo (`<DemoBanner />`)**:
   - Hiển thị thanh banner nổi bật ở đầu trang: `"Bản thử nghiệm — Dữ liệu được làm mới vào 0:00 mỗi ngày"`.
   - Hiển thị trên cả desktop và mobile layout khi `DEMO_MODE=true`.
4. **Metadata & Robots**:
   - Bổ sung `robots: { index: false, follow: false }` khi `DEMO_MODE=true` trong metadata gốc.
5. **Lệnh Seed Demo (`scripts/seed-demo.mts`)**:
   - Cho phép chạy khi `NODE_ENV=production` nếu `DEMO_MODE=true`.
   - Dời ngày của các giao dịch mẫu (đơn thu mua, phiếu nhập, sổ kho, sửa chữa, kiểm kê) theo ngày chạy hiện tại (theo múi giờ Asia/Ho_Chi_Minh).

## Impact & Migration

- **Không ảnh hưởng môi trường thường / production thật**: Khi `DEMO_MODE` không bật (mặc định), toàn bộ hành vi phân quyền, đổi mật khẩu, quản trị người dùng và metadata giữ nguyên 100%.
- **An toàn dữ liệu**: Đảm bảo môi trường thử nghiệm hoạt động thông suốt, không bị gián đoạn trải nghiệm do người dùng vô tình hay cố ý thay đổi thông tin xác thực của các tài khoản mẫu.
