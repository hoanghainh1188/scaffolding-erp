# Proposal: auth-and-roles

## Why

Hiện ứng dụng dùng **người dùng giả lập** (biến `DEV_ROLE`) và bản production từ chối chạy. Mọi change nghiệp vụ sau (danh mục, sổ kho, hợp đồng, duyệt đền bù...) cần biết **ai đang thao tác** và **vai trò gì** để ghi lịch sử và chặn quyền ở server. Phải có đăng nhập thật trước khi làm nghiệp vụ.

Giai đoạn: **[MVP]** — change số 2 trong `docs/roadmap.md`. Màn hình: **Đăng nhập** (`Login.dc.html`), **D17 Người dùng & Vai trò**, tab **Cá nhân** của Mobile (`/m/profile`).

## What Changes

- Cài **Better Auth** (plugin `username`) với bảng lưu trong PostgreSQL qua Drizzle. Đăng nhập bằng **tên đăng nhập + mật khẩu** (requirements 0.5 #1).
- Trang **Đăng nhập** `/login` theo thiết kế: tên đăng nhập, mật khẩu, ô "Giữ đăng nhập trên máy này", dòng "Quên mật khẩu? Nhờ Giám đốc đặt lại...".
- **Thời gian giữ đăng nhập**: có tick → 30 ngày, tự gia hạn khi còn dùng; không tick → hết khi đóng trình duyệt, tối đa 12 giờ.
- **Mật khẩu tạm** do hệ thống tạo (dạng `giao-7342`), **chỉ hiện 1 lần**; lần đầu đăng nhập **bắt buộc đổi** mật khẩu (tối thiểu 8 ký tự).
- **Chống dò mật khẩu**: sai 5 lần liên tiếp thì tạm khóa tên đăng nhập đó 15 phút; thêm giới hạn số lần gọi theo địa chỉ IP.
- Mọi trang và API (trừ `/login`, `/api/health`, manifest, file tĩnh) **bắt buộc đăng nhập**. Chưa đăng nhập: trang → chuyển `/login`; API → 401.
- **Bảng quyền theo vai trò** đặt trong một module (`src/domain/permissions.ts`), dùng chung cho menu và kiểm tra server. Gọi API sai vai trò → **403**.
- **D17 Người dùng** (chỉ Giám đốc): danh sách có lọc theo vai trò, cột "Dùng trên" và "Đăng nhập gần nhất"; thêm người dùng; đổi vai trò; đặt lại mật khẩu; khóa / mở khóa.
- Khóa tài khoản hoặc đặt lại mật khẩu → **mọi phiên đang mở của người đó bị đăng xuất ngay**.
- **Không cho** Giám đốc tự khóa mình, tự hạ vai trò, hoặc khóa / hạ vai trò **Giám đốc cuối cùng** còn hoạt động.
- Lệnh `npm run auth:create-director` tạo **tài khoản Giám đốc đầu tiên** (in mật khẩu tạm 1 lần). Chạy được cả trên production.
- Header Desktop có menu người dùng với **Đăng xuất**; tab **Cá nhân** trên Mobile hiện họ tên, vai trò, nút đổi mật khẩu và đăng xuất.
- **BREAKING**: bỏ hẳn người dùng giả lập và biến `DEV_ROLE` (cả dev). Dev và E2E đăng nhập bằng tài khoản thật do script seed tạo.

## Capabilities

### New Capabilities

- `auth`: Đăng nhập, phiên đăng nhập, mật khẩu (tạm, bắt buộc đổi, quy tắc), chống dò mật khẩu, bắt buộc đăng nhập cho trang/API, bảng quyền theo vai trò và kiểm tra quyền phía server, tạo Giám đốc đầu tiên.
- `user-management`: Quản lý tài khoản ở D17 — danh sách, thêm, đổi vai trò, đặt lại mật khẩu, khóa/mở khóa, bảo vệ Giám đốc cuối cùng, thông tin đăng nhập gần nhất và thiết bị.

### Modified Capabilities

- `app-shell`: bỏ requirement "Người dùng giả lập trước khi có đăng nhập"; header Desktop có menu người dùng với Đăng xuất; tab Cá nhân trên Mobile không còn là trang giữ chỗ.

## Impact

- **Gói mới**: `better-auth` (ghim bản chính xác). Không thêm thư viện UI.
- **DB**: migration mới tạo bảng `user`, `session`, `account`, `verification` (của Better Auth, có thêm cột riêng) và `login_throttle`, `rate_limit`. Chưa có bảng nghiệp vụ nên **không ảnh hưởng Sổ kho, giá vốn hay số liệu đã có**.
- **Code**: thay thân `src/lib/current-user.ts`; thêm `src/proxy.ts` (Next 16 thay middleware), `src/lib/auth/*`, `src/domain/permissions.ts`, `src/domain/password.ts`; route `/api/auth/[...all]`, `/api/users/*`, `/api/me/password`; trang `/login`, `/change-password`, `/settings/users`; `src/lib/navigation.ts` đọc quyền từ module mới.
- **Env**: thêm `BETTER_AUTH_SECRET` (bắt buộc, ≥ 32 ký tự), `BETTER_AUTH_URL`; bỏ `DEV_ROLE`.
- **Test**: E2E hiện tại cần đăng nhập trước (global setup tạo tài khoản theo vai trò và lưu `storageState`). Ảnh mốc Playwright có thể đổi ở header (menu người dùng).
- **Tài liệu**: `CLAUDE.md` (lệnh mới, bỏ `DEV_ROLE`), `README.md` (cách tạo Giám đốc đầu tiên), `.env.example`.

## Ngoài phạm vi

- Tự khôi phục mật khẩu qua email/SMS (requirements 0.5 #4: Giám đốc đặt lại).
- Một người nhiều vai trò; quyền chi tiết theo từng người (0.5 #6: mỗi người một vai trò).
- Xóa tài khoản (0.5 #7: chỉ khóa, giữ lịch sử).
- Đăng nhập 2 lớp (2FA), đăng nhập bằng Google/Zalo.
- Nhật ký đăng nhập đầy đủ (lịch sử từng lần); chỉ lưu lần gần nhất cho D17.
- Màn xem và đăng xuất từng thiết bị riêng lẻ.
- **CSP theo nonce**: `next.config.ts` hẹn làm cùng change này, nhưng nonce buộc mọi trang render động, đụng Cache Components. Đề xuất tách change riêng `security-headers` (xem design, Câu hỏi mở).
- Quyền cụ thể cho từng thao tác nghiệp vụ (duyệt hợp đồng, duyệt đền bù...): mỗi change sau tự thêm quyền vào bảng quyền.
