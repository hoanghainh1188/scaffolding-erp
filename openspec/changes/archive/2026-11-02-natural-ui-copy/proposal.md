# Change Proposal: natural-ui-copy

## Why

Hệ thống ERP giàn giáo đã hoàn thành việc gom nhóm các chuỗi giao diện vào kiến trúc từ điển tập trung (`src/locales/vi/`) ở PR trước, tuy nhiên nhiều câu chữ, nhãn menu và thông báo lỗi vẫn còn mang phong cách dịch máy hoặc diễn đạt cộc lốc, thô ráp (ví dụ: *"Thu mua"*, *"Bán & Thuê"*, *"Nhận 2.000 cái, đơn chỉ còn 200. Đúng không?"*, *"Chỉ kiểm kê bãi và xưởng"*).

Nhằm mang lại trải nghiệm người dùng chuyên nghiệp, thân thiện và phản ánh đúng thực tế vận hành tại các bãi kho, xưởng cơ khí và văn phòng điều hành giàn giáo tại Việt Nam, change này tiến hành:
1. Chuẩn hóa các thuật ngữ điều hướng cốt lõi: *"Mua hàng"* (thay cho *"Thu mua"*), *"Cho thuê & Bán"* (thay cho *"Bán & Thuê"*), *"Việc hôm nay"* (nhất quán trên Mobile).
2. Chuẩn hóa toàn diện hơn 60 chuỗi microcopy, đối thoại cảnh báo và thông báo lỗi nghiệp vụ theo tiếng Việt tự nhiên, có chủ ngữ/vị ngữ rõ ràng và hướng dẫn hành động cụ thể.
3. Cập nhật các tài liệu OpenSpec, unit tests, E2E tests và chụp lại ảnh mốc (visual regression snapshots) tương ứng.

## What Changes

- **Quyết định nghiệp vụ**: Đã ghi nhận quyết định #42, #43, #44, #45 vào `docs/requirements.md` mục 0.2.
- **Từ điển giao diện (`src/locales/vi/`)**:
  - `navigation.ts`: Cập nhật `purchasing: "Mua hàng"`, `sales: "Cho thuê & Bán"`.
  - `receiving.ts` & `receipt-anomalies.ts`: Cập nhật cảnh báo nhập dư, vượt chi phí dự kiến, trạng thái chuyến xe, hướng dẫn cân kg và phân loại tình trạng.
  - `purchasing.ts` & `landed-cost.ts`: Cập nhật thông báo trùng mã hàng, quy cách đơn vị, khóa đơn đã nhập, đơn giá sắt vụn và diễn giải phương pháp phân bổ.
  - `stocktake.ts`: Cập nhật phạm vi kiểm kê bãi/xưởng, thông báo đếm lại, cảnh báo hủy phiên và kiểm tra kết nối mạng.
  - `repairs.ts`: Cập nhật diễn giải cân bằng số lượng xuất sửa, thông điệp phân bổ chi phí và quy định hàng tính theo kg.
  - `inventory.ts`: Cập nhật thông báo điều chỉnh giá trị, tồn kho âm, chứng từ gốc và cảnh báo duyệt ghi sổ.
  - `catalog.ts`: Cập nhật nhãn thao tác chuẩn (*"Chỉnh sửa"*, *"Ngừng sử dụng"*, *"Kích hoạt lại"*), giải thích đơn vị và đơn giá đền bù.
  - `auth.ts` & `users.ts`: Cập nhật mô tả vai trò người dùng thực tế, hướng dẫn đăng nhập và cấp lại mật khẩu.
- **Trang ứng dụng và Components**:
  - Cập nhật tiêu đề metadata và breadcrumbs nếu có liên quan đến menu (như trang Sales).
- **Kiểm thử & Snapshots**:
  - Cập nhật các file test Unit/Component (`src/lib/navigation.test.ts`, v.v.).
  - Cập nhật E2E test Playwright (`tests/e2e/desktop-shell.spec.ts`, v.v.).
  - Chạy toàn bộ test suite và cập nhật ảnh snapshot nếu có thay đổi giao diện.

## Impact & Verification

- **Không thay đổi cơ sở dữ liệu (No Schema Migration)**: Chỉ thay đổi lớp hiển thị văn bản (presentation / copywriting).
- **Kiểm thử**: Toàn bộ unit tests, component tests và E2E tests phải PASS 100%.
- **Chất lượng**: Typecheck và Linting không có lỗi (`npm run typecheck`, `npm run lint`).
