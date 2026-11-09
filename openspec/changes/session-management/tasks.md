# Tasks: session-management

Không có migration: dùng bảng `session` sẵn có.

## 1. Hàm thuần

- [x] 1.1 Viết test trước cho `src/domain/device-session.ts`: lọc phiên hết hạn, phiên ngắn đúng mốc 12 giờ và quá 12 giờ, máy đang dùng đứng đầu, sắp theo hoạt động gần nhất, cắt 50 dòng, kết quả không có token; `signOutOutcome` với `n = 0, k = 0` (không ghi), `n = 0, k = 1`, `n = 3, k = 0`, `n = 3, k = 2` (đúng đuôi). Kiểm bằng `npm run test:unit` đỏ rồi xanh.
- [x] 1.2 Chuyển `SHORT_SESSION_MS` sang `src/domain/device-session.ts`, sửa import ở `sign-in.ts` và `session.ts`. Kiểm bằng `npm run typecheck` và test `src/lib/auth` xanh.

## 2. Service

- [x] 2.1 Viết `listDeviceSessions` trong `src/lib/auth/sessions.ts`, chọn cột tường minh không có `token`. Integration test: chỉ thấy phiên của mình, không có token, tài khoản demo khi `DEMO_MODE` không đọc danh sách.
- [x] 2.2 Viết `signOutDevice`: integration test phiên bị xóa hết hiệu lực ngay (`resolveCurrentUser` trả null), phiên đang dùng trả 400, phiên người khác và phiên không có trả 404 mà không đổi gì, tài khoản demo trả 409, dòng nhật ký đúng `summary` và cờ nhạy cảm.
- [x] 2.3 Viết `signOutOtherDevices`: integration test giữ phiên đang dùng, không đụng phiên của người khác, trả đúng số máy, ghi đúng một dòng khi `n = 3`. Quên máy đã tin: hàng `verification` `trust-device-*` của người đó bị xóa, của người khác còn nguyên, đăng nhập lại phải nhập mã. `n = 0`: không quên dù còn máy đã tin, không ghi nhật ký.
- [x] 2.4 Viết `signOutAllDevices` trong `src/lib/users/service.ts` (khóa bằng `lockRow`): integration test mọi phiên của nhân viên hết hiệu lực, tài khoản vẫn `ACTIVE` và đăng nhập lại được, chính mình trả 409, người không tồn tại 404, tài khoản demo 409, tài khoản tạo thử trên demo vẫn làm được. Quên máy đã tin: của người đó bị xóa, của người khác còn nguyên, hàng đã hết hạn bị xóa nhưng không tính vào `k`. Ca 0 phiên + 1 máy đã tin: quên 1, ghi 1 dòng. Ca 0 phiên + 0 máy đã tin: không ghi nhật ký.
- [x] 2.5 Kiểm nhật ký rollback cùng thao tác: integration test cho `logActivity` lỗi thì phiên không bị xóa. Kiểm `src/lib/activity/coverage.test.ts` xanh mà không thêm tên mới vào `NOT_LOGGED`.

## 3. API

- [x] 3.1 Thêm `POST /api/me/sessions/[id]/sign-out` và `POST /api/me/sessions/sign-out-others`, bọc `withAuth`. Integration test 401 khi chưa đăng nhập, 403 khi sai Origin, 400 và 404 đúng ca.
- [x] 3.2 Thêm `POST /api/users/[id]/sign-out-all` với `permission: "users.manage"`. Integration test: Kế toán và tài khoản chỉ có cờ Admin hệ thống nhận 403, phiên không đổi. Kiểm `route-guards.test.ts` xanh.

## 4. Giao diện

- [x] 4.1 Đọc `docs/design/screens/Sessions.dc.html` (đã merge, PR #167) và lập bảng hex sang token Bright Blue Base cho 4.2–4.5, không vẽ lại. Kiểm bằng `npm run lint` không báo màu cứng khi làm xong 4.5.
- [x] 4.2 Thêm chữ vào `src/locales/vi/auth.ts` và trang `src/app/sessions/page.tsx` gọi `await requireUser()`, có nhánh bản demo. Thêm ca kiểm vào `route-guards.test.ts`. Kiểm bằng test đó xanh.
- [x] 4.3 Làm component trong `src/components/sessions/`: danh sách thẻ, nhãn "Máy này", nút theo dòng, nút mọi máy khác bị tắt khi không có máy khác, `AlertDialog` xác nhận, `router.refresh()`, thông báo "đã đăng xuất từ trước", lời nhắc kèm liên kết `/two-factor` sau khi đăng xuất một máy. Hộp thoại "Đăng xuất mọi máy khác" của người có 2 lớp ghi "Các máy đã tin cũng bị quên, lần sau phải nhập mã". Component test cho từng trạng thái nút và câu trong hộp thoại.
- [x] 4.4 Thêm mục "Thiết bị đăng nhập" vào `user-menu.tsx` và nút vào trang Cá nhân Mobile (cao 48px). Sửa `user-menu.test.tsx`, kiểm hiện cho mọi vai trò.
- [x] 4.5 Thêm "Đăng xuất mọi máy" vào `user-row-actions.tsx`: chỉ khi `canManageUsers`, không ở dòng của chính mình, không ở dòng Đã khóa. Hộp thoại có câu "Nếu mật khẩu có thể đã lộ (lưu sẵn trên máy bị mất), dùng Đặt lại mật khẩu." Sửa `users-screen.test.tsx` cho từng ca, kiểm câu nhắc trong hộp thoại và 4 thông báo kết quả (có phiên, chỉ máy đã tin, cả hai, không có gì).
- [x] 4.6 Thêm `tests/e2e/sessions.spec.ts` bằng tài khoản tạm `e2etmp*` (không dùng `e2e.*`, vì đăng xuất mọi máy khác sẽ giết phiên worker khác đang dùng): hai `browserContext` cùng tài khoản, xem danh sách, đăng xuất máy kia, máy kia về `/login`; Giám đốc đăng xuất mọi máy từ D17. Kiểm bằng `npm run test:e2e`.
- [x] 4.7 Thêm `/sessions` vào `a11y.spec.ts` và `responsive.spec.ts` (không có tràn ngang ở 320 và 375). Kiểm hai file đó xanh.

## 5. Tài liệu và kiểm tra tổng

- [x] 5.1 Thêm một gạch đầu dòng về phiên đăng nhập vào `CLAUDE.md` (đi qua `src/lib/auth/sessions.ts`, không mở route revoke, không để token ra client, E2E dùng tài khoản tạm). Kiểm `npm run format:check`.
- [ ] 5.2 Chạy `npm run lint && npm run typecheck && npm test && npm run test:e2e` và `npx openspec validate session-management --strict`, tất cả xanh. Gắn nhãn `update-snapshots` nếu ảnh mốc đổi.

## Workflow follow-up

- Kiểm tra tay (làm sau, theo dõi ở #33): đăng nhập cùng tài khoản trên máy tính và điện thoại thật; từ máy tính đăng xuất điện thoại, điện thoại về màn đăng nhập ở thao tác kế tiếp; nhật ký D18 ghi đúng người làm.
- Sau khi merge: `/opsx:archive session-management`, PR archive ghi `Closes #98`, đánh dấu ✅ dòng K14 ở `docs/roadmap.md`.
