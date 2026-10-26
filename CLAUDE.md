# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Ngôn ngữ trả lời

- Luôn trả lời bằng **tiếng Việt**: câu ngắn, dễ hiểu, dùng gạch đầu dòng.
- Thuật ngữ kỹ thuật thì giải thích ngắn ngay sau khi dùng.
- Code, tên file, tên biến, commit message: tiếng Anh.

## Dự án là gì

Phần mềm quản lý cho công ty **thu mua, sửa chữa, bán và cho thuê giàn giáo, vật tư xây dựng đã qua sử dụng** (có cả hàng mới).

Tài liệu gốc (đọc trước khi làm bất kỳ tính năng nào):

| File | Nội dung |
|---|---|
| `docs/requirements.md` | Nghiệp vụ, **quyết định đã chốt (Mục 0)**, phạm vi MVP / Bản 2 |
| `docs/ui.md` | Layout, component, danh sách màn hình (D1–D17, M1–M8) |
| `docs/roadmap.md` | Thứ tự các change OpenSpec |
| `docs/design-system/` | Bright Blue Base: `tokens.json` (màu, chữ, khoảng cách, bo góc) + `README.md` (cách dùng, giọng văn) |
| `openspec/specs/` | Spec "sống" — nguồn sự thật sau khi change được archive |

Khi `docs/` và `openspec/specs/` khác nhau: **`openspec/specs/` thắng**.

## Stack

- **Next.js 16** (App Router, Cache Components bật sẵn) + **TypeScript** (strict, `noUncheckedIndexedAccess`) — làm cả giao diện và API. Node 24, quản lý gói bằng `npm`.
- **PostgreSQL 17** chạy local bằng **Docker Compose**.
- ORM: **Drizzle** (`drizzle-orm` + driver `postgres`). Migration là file SQL trong `drizzle/`, chạy bằng `npm run db:migrate`; không dùng `drizzle-kit push`.
- Đăng nhập: **Better Auth** — cài ở change `auth-and-roles`. Trước đó dùng người dùng giả lập (chỉ ở dev).
- Test: **Vitest** (unit, component, integration) + **Playwright** (E2E trên Edge; ảnh mốc chỉ chạy trên CI).
- **Tailwind CSS 4** + **shadcn/ui**. Design system: **Bright Blue Base** (token sinh từ `docs/design-system/tokens.json`).
- Hai giao diện: `(desktop)` cho văn phòng, `(mobile)` PWA ở `/m` cho thủ kho/xưởng.
- Next.js 16 khác nhiều so với bản cũ: tra `node_modules/next/dist/docs/` trước khi dùng API lạ (xem `AGENTS.md`).

## Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy local ở http://localhost:3000 |
| `npm run build` / `npm start` | Build và chạy bản production (hiện từ chối người dùng giả lập) |
| `npm run lint` | ESLint + `scripts/check-colors.mts` (chặn màu Tailwind cứng, mã hex) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run format` / `format:check` | Prettier |
| `npm test` | Vitest: unit, component, integration (integration cần `TEST_DATABASE_URL`) |
| `npm run test:unit` / `test:int` / `test:coverage` | Từng nhóm test; coverage ≥ 80% cho `src/domain`, `src/lib` |
| `npm run test:e2e` | Playwright trên Edge (`next dev`); ở local bỏ qua `@visual` |
| `npm run tokens` | Sinh `src/styles/tokens.css` từ `docs/design-system/tokens.json` |
| `npm run db:up` / `db:down` | Bật / tắt PostgreSQL trong Docker |
| `npm run db:generate` / `db:migrate` / `db:studio` | Sinh migration SQL / chạy migration / xem dữ liệu |

Lưu ý:

- Sửa `tokens.json` thì chạy `npm run tokens`; test chống lệch sẽ đỏ nếu quên.
- Không chạy hai `next dev` cùng lúc trên repo (trang sẽ tự tải lại liên tục). Muốn Playwright dùng lại dev server đang chạy: `PW_PORT=<cổng> npm run test:e2e`.
- Ảnh mốc Playwright chỉ tạo trên CI: tab Actions → **Update Playwright snapshots** → chọn nhánh → Run workflow.
- Trong E2E, Next 16 giữ trang cũ ẩn trong DOM sau khi điều hướng: tìm theo chữ thì thêm `.filter({ visible: true })`.

## Quy trình làm việc: OpenSpec

Mọi tính năng mới đi qua OpenSpec. **Không code thẳng khi chưa có change đã được duyệt.**

1. `/opsx:explore` — đọc tài liệu, hỏi lại chỗ chưa rõ.
2. `/opsx:propose <tên-change>` — sinh `proposal.md`, specs, `design.md`, `tasks.md`. **Dừng lại chờ người dùng duyệt.**
3. `/opsx:apply` — code theo `tasks.md`, tick từng task.
4. `openspec validate --strict` — kiểm tra spec.
5. `/opsx:archive` — gộp spec vào `openspec/specs/`.

Sửa lỗi nhỏ, đổi chữ, chỉnh style: không cần change.

## Quy tắc nghiệp vụ không được phá

Chi tiết ở `docs/requirements.md` Mục 0. Tóm tắt:

- **Sổ kho (inventory ledger)** chỉ ghi thêm. Không UPDATE/DELETE dòng cũ. Sai thì ghi dòng điều chỉnh.
- Tồn kho, giá vốn, tiền thuê **luôn tính từ sổ kho**, không lưu số "cộng dồn" ở chỗ khác mà không đối chiếu.
- **Giá vốn bình quân** theo (mã hàng + tình trạng).
- 4 tình trạng: `NEW`, `GOOD`, `NEEDS_REPAIR`, `SCRAP`. Chỉ `NEW`, `GOOD` được xuất bán/cho thuê.
- **Tiền thuê:** tính ngày xuất, không tính ngày trả. Giá tháng = giá ngày × 30.
- Hợp đồng và phiếu đền bù chỉ có hiệu lực sau khi **Giám đốc duyệt**.

## Quy ước code

- **Tiền:** VND, số nguyên. Kiểu `bigint` trong DB. Không dùng `float`/`number` thập phân cho tiền.
- **Số lượng:** `numeric(14,3)` (chứa được kg).
- **Ngày giờ:** lưu UTC. "Ngày" nghiệp vụ tính theo `Asia/Ho_Chi_Minh`.
- Logic nghiệp vụ (giá vốn, tiền thuê, đền bù, phân bổ landed cost) đặt trong module riêng, **không** viết trong component hay route handler. Phải có unit test.
- Mọi thao tác ghi nhiều bảng (VD: lưu phiếu + ghi sổ kho) chạy trong **một transaction**.
- Phân quyền kiểm tra ở **server**, không chỉ ẩn nút trên giao diện.

## Từ điển (tiếng Việt ↔ tên trong code)

| Tiếng Việt | Code |
|---|---|
| Mã hàng / vật tư | `item` |
| Bộ | `kit` |
| Tình trạng | `condition` |
| Sổ kho | `inventory_ledger` |
| Kho / bãi / xưởng / công trình | `location` (loại: `YARD`, `WORKSHOP`, `SITE`) |
| Đơn thu mua | `purchase_order` |
| Chi phí mua hàng phân bổ | `landed_cost` |
| Phiếu nhập | `goods_receipt` |
| Hợp đồng | `contract` |
| Phiếu xuất | `delivery_note` |
| Phiếu thu hồi | `return_note` |
| Phiếu đền bù | `compensation_note` |
| Kỳ tính tiền thuê | `billing_period` |
| Phiếu sửa chữa | `repair_order` |
| Kiểm kê | `stocktake` |
| Nhà cung cấp / Nhà thầu | `supplier` / `customer` |
| Công nợ phải thu / phải trả | `receivable` / `payable` |

## Vai trò

`DIRECTOR` (Giám đốc), `ACCOUNTANT` (Kế toán), `SALES` (Kinh doanh), `WAREHOUSE` (Thủ kho), `WORKSHOP` (Xưởng).

## Giao diện

- Theo `docs/ui.md`. Dùng component shadcn/ui + token Bright Blue Base.
- **Nguồn token duy nhất:** `docs/design-system/tokens.json`; quy tắc dùng màu, chữ, giọng văn ở `docs/design-system/README.md`. Không tự đoán mã màu, không dùng màu Tailwind cứng (`blue-600`, `slate-50`...).
- **Thiết kế màn hình** đã vẽ: xem `docs/ui.md` mục 3.4 (link canvas Claude Design + artboard của từng màn).
- **Viết tiền:** `1.250.000 ₫` theo spec `domain-values`, kể cả khi README Bright Blue Base ghi kiểu `đ`.
- Không tự thêm thư viện UI khác khi chưa hỏi.
- Desktop: bảng dữ liệu. Mobile: thẻ (card), nút to, stepper +/-.
- Chữ trên giao diện: tiếng Việt.
