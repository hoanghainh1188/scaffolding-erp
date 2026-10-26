# Proposal: setup-project

## Why

Repo hiện chỉ có tài liệu, chưa có code. Mọi change sau (đăng nhập, danh mục, sổ kho...) cần chung một khung: Next.js, PostgreSQL, ORM, bộ test, hai layout Desktop/Mobile và bộ component nền. Làm khung một lần, đúng quy ước (tiền, số lượng, ngày), để các change sau chỉ tập trung vào nghiệp vụ.

Giai đoạn: **[MVP]** — change số 1 trong `docs/roadmap.md`.

## What Changes

- Khởi tạo dự án **Next.js (App Router) + TypeScript strict**, quản lý bằng `npm`.
- Chốt các lựa chọn kỹ thuật còn bỏ ngỏ trong `CLAUDE.md`:
  - ORM: **Drizzle** (migration dạng file SQL).
  - Đăng nhập: **Better Auth** — chỉ chốt lựa chọn, **chưa cài** (làm ở change `auth-and-roles`).
  - Test: **Vitest** (unit + integration) và **Playwright** (E2E, chụp màn hình).
  - PostgreSQL local: **Docker Compose** (1 DB dev + 1 DB test).
- Cài **Tailwind CSS + shadcn/ui**. Token **Bright Blue Base** lấy từ `docs/design-system/tokens.json` (nguồn duy nhất), sinh ra CSS variables; hai font **Bricolage Grotesque** (tiêu đề, số lớn) và **Be Vietnam Pro** (nội dung).
- **Layout Desktop** (sidebar nền sáng thu gọn được, mục đang chọn nền `accent`, menu lọc theo vai trò, header) — dùng cho D1..D17.
- **Layout Mobile PWA** (thanh điều hướng 4 tab dưới đáy, app bar, thanh báo mất kết nối, manifest để cài lên màn hình chính) — dùng cho M1..M8.
- Trang giữ chỗ ("Đang xây dựng") cho mỗi mục menu, để điều hướng không bị lỗi 404.
- **Component nền**: `ConditionBadge`, `DocumentStatusBadge`, `LocationBadge`, `Stepper`, `DataTable`, `ConditionSplit`.
- **Module giá trị nghiệp vụ** dùng chung: tiền VND (số nguyên), số lượng theo đơn vị (cái: số nguyên; kg: tối đa 3 chữ số thập phân), "ngày" theo giờ Việt Nam, danh sách tình trạng hàng, vai trò, trạng thái chứng từ (Quá hạn là trạng thái tính ra, không lưu DB).
- API kiểm tra hệ thống `GET /api/health` (ứng dụng + kết nối DB) và kiểm tra biến môi trường khi khởi động.
- Lệnh chuẩn (`dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:*`), GitHub Actions chạy lint + typecheck + test.
- Cập nhật mục **Stack** và **Lệnh thường dùng** trong `CLAUDE.md`.

## Capabilities

### New Capabilities

- `app-shell`: Khung giao diện Desktop và Mobile — điều hướng, menu theo vai trò, thanh báo mất kết nối, PWA manifest, trang giữ chỗ.
- `ui-components`: Bộ component nền dùng chung — badge tình trạng/chứng từ/vị trí, stepper, bảng dữ liệu, chia tình trạng.
- `domain-values`: Quy tắc biểu diễn, định dạng và đọc giá trị nghiệp vụ — tiền VND, số lượng, ngày nghiệp vụ, tình trạng hàng, vai trò.
- `system-health`: Kiểm tra sức khỏe hệ thống và cấu hình môi trường.

### Modified Capabilities

(Không có — chưa có spec nào trong `openspec/specs/`.)

## Màn hình liên quan

- Layout Desktop (khung chung cho D1..D17). D1 chỉ là trang giữ chỗ.
- Layout Mobile (khung chung cho M1..M8). M1, M2, M7 chỉ là trang giữ chỗ (các tab dưới đáy).

## Ảnh hưởng tới Sổ kho / giá vốn

Không có. Change này **chưa tạo bảng nghiệp vụ nào** (không có sổ kho, không có giá vốn). Chưa có số liệu cũ để ảnh hưởng.

## Ngoài phạm vi

- Đăng nhập, quản lý người dùng, kiểm tra quyền phía server → change `auth-and-roles`. Ở change này vai trò hiện tại lấy từ **người dùng giả lập** (chỉ chạy ở môi trường dev).
- Bất kỳ bảng nghiệp vụ nào (vật tư, sổ kho, hợp đồng...).
- Nội dung thật của các màn hình D1..D17, M1..M8.
- Tìm kiếm toàn cục, thông báo, nút tạo nhanh trên header: chỉ có chỗ hiển thị, chưa hoạt động.
- Nút nổi (FAB) trên mobile, quét QR, chụp ảnh, Unit Switch (cái ↔ kg): làm cùng màn hình cần dùng.
- Lưu nháp trên máy khi mất sóng: làm cùng các form mobile (M3, M4, M5). Change này chỉ hiện thanh báo mất kết nối.
- Service worker, chạy offline.
- Giao diện tối (dark mode). `tokens.json` đã có giá trị chế độ Tối nhưng change này chưa bật.
- Tạo và so sánh ảnh mốc giao diện (visual regression) trên máy dev — chỉ chạy trên CI.
- Triển khai lên server thật (production deploy).

## Impact

- **Code mới:** toàn bộ khung `src/` (app, components, lib, db), cấu hình Next.js, Tailwind, shadcn/ui, Drizzle, Vitest, Playwright, ESLint/Prettier.
- **Thư viện mới:** `next`, `react`, `drizzle-orm`, `drizzle-kit`, `postgres`, `zod`, `tailwindcss`, các package của shadcn/ui (Radix, `lucide-react`, `class-variance-authority`, `tailwind-merge`), `@tanstack/react-table` (lõi bảng mà shadcn/ui dùng cho DataTable), `vitest`, `@testing-library/react`, `@playwright/test`.
- **Hạ tầng:** `docker-compose.yml` (PostgreSQL), `.env.example`, `.github/workflows/ci.yml` (kiểm tra) và job chạy tay để tạo ảnh mốc Playwright.
- **Design system:** đọc `docs/design-system/tokens.json` (không sửa file này).
- **Tài liệu:** `CLAUDE.md` (Stack, Lệnh thường dùng), `README.md` (cách chạy local).
