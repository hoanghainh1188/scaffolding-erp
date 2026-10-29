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
- Đăng nhập: **Better Auth** (tên đăng nhập + mật khẩu), mọi chỗ gọi thư viện nằm trong `src/lib/auth/`. Không có người dùng giả lập: dev và test đăng nhập bằng tài khoản thật. Bảng quyền duy nhất: `src/domain/permissions.ts`; trang gọi `requirePermission`, API bọc `withAuth` (test `src/app/route-guards.test.ts` bắt chỗ quên).
- Test: **Vitest** (unit, component, integration) + **Playwright** (E2E trên Edge; ảnh mốc chỉ chạy trên CI).
- **Tailwind CSS 4** + **shadcn/ui**. Design system: **Bright Blue Base** (token sinh từ `docs/design-system/tokens.json`).
- Hai giao diện: `(desktop)` cho văn phòng, `(mobile)` PWA ở `/m` cho thủ kho/xưởng.
- Next.js 16 khác nhiều so với bản cũ: tra `node_modules/next/dist/docs/` trước khi dùng API lạ (xem `AGENTS.md`).

## Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy local ở http://localhost:3000 |
| `npm run build` / `npm start` | Build và chạy bản production (cần `BETTER_AUTH_URL`) |
| `npm run lint` | ESLint + `scripts/check-colors.mts` (chặn màu Tailwind cứng, mã hex) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run format` / `format:check` | Prettier |
| `npm test` | Vitest: unit, component, integration (integration cần `TEST_DATABASE_URL`) |
| `npm run test:unit` / `test:int` / `test:coverage` | Từng nhóm test; coverage ≥ 80% cho `src/domain`, `src/lib` |
| `npm run test:e2e` | Playwright trên Edge (`next dev`); ở local bỏ qua `@visual` |
| `npm run tokens` | Sinh `src/styles/tokens.css` từ `docs/design-system/tokens.json` |
| `npm run db:up` / `db:down` | Bật / tắt PostgreSQL trong Docker |
| `npm run db:generate` / `db:migrate` / `db:studio` | Sinh migration SQL / chạy migration / xem dữ liệu |
| `npm run db:seed:dev` | Tạo 5 tài khoản mẫu cho dev (`giamdoc`, `ketoan`, `kinhdoanh`, `thukho`, `xuong`), mật khẩu `DEV_SEED_PASSWORD`, danh mục mẫu như thiết kế D9/D16 sổ kho mẫu (ví dụ tính tay design D11 của `inventory-ledger`), 5 đơn thu mua mẫu (đơn D3 của `purchase-orders`), giá sắt vụn 7.500 ₫/kg, một đơn đang nhận 2 chuyến như D3b (`goods-receipt`) và một phiếu sửa chữa nháp như D12 (`simple-repair`) |
| `npm run inventory:check` | Đối chiếu giá vốn lưu riêng với sổ kho; lệch thì thoát mã 1 |
| `npm run auth:create-director -- --username <tên> --name "<Họ tên>"` | Tạo tài khoản Giám đốc đầu tiên, in mật khẩu tạm một lần |

Lưu ý:

- Sửa `tokens.json` thì chạy `npm run tokens`; test chống lệch sẽ đỏ nếu quên.
- Không chạy hai `next dev` cùng lúc trên repo (trang sẽ tự tải lại liên tục). Muốn Playwright dùng lại dev server đang chạy: `PW_PORT=<cổng> npm run test:e2e` — server đó phải chạy với `AUTH_SIGN_IN_LIMIT_PER_MINUTE=1000`, không thì E2E bị giới hạn 20 lần đăng nhập/phút.
- Sổ kho ở DB dev không xóa được: E2E ghi vào mã cố định `E2E-KHO-01/02` và kiểm theo chênh lệch.
- Đơn thu mua do E2E tạo có ghi chú `E2E thử` (nhà cung cấp Hòa Phát mẫu); global setup xóa các đơn đó **khi chưa có phiếu nhập** (đơn đã có phiếu nhập ở lại vì sổ kho không xóa được). E2E nhập hàng ghi vào `E2E-KHO-01/02`, tình trạng Chờ sửa / Phế liệu, và kiểm theo chênh lệch. Không thêm nhà cung cấp riêng cho E2E: ảnh mốc D16 đếm số nhà cung cấp.
- E2E dùng **`XUONG-01`**: global setup tự thêm hàng Chờ sửa `E2E-KHO-01` ở đó cho `repairs.spec.ts` (`ensureRepairStock`, dòng sổ ở lại DB dev) và hủy phiên kiểm kê mở ở đó do `e2e.*` bắt đầu (phiên mở của người khác thì dừng, không hủy). E2E kiểm kê bắt đầu phiên ở `XUONG-01`, chỉ đếm `E2E-KHO-02` (vì `repairs.spec.ts` đo `E2E-KHO-01` ở xưởng) và chỉ tạo chênh lệch thừa; global setup tạo một lần phiên mẫu Chờ duyệt ở `BAI-01` cho ảnh mốc D13, E2E không đụng phiên đó (một vị trí chỉ có một phiên mở).
- E2E đăng nhập bằng tài khoản `e2e.*` (global setup tạo lại mỗi lần chạy) và chạy với vai trò Giám đốc mặc định; test cần vai trò khác dùng `test.use({ storageState: statePath("ACCOUNTANT") })`.
- Ảnh mốc Playwright chỉ tạo trên CI: gắn nhãn **`update-snapshots`** vào PR (workflow tự gỡ nhãn khi xong), hoặc tab Actions → **Update Playwright snapshots** → chọn nhánh → Run workflow.
- CI chạy song song (integration và E2E Edge chia 2, ảnh mốc là job riêng); job `Lint, types, tests, build` và `E2E (Edge)` chỉ gom kết quả, giữ đúng tên check bắt buộc. PR chỉ sửa `docs/` (trừ `docs/design-system/`), `openspec/`, `CLAUDE.md`, `AGENTS.md` thì bỏ qua test và E2E.
- Trong E2E, Next 16 giữ trang cũ ẩn trong DOM sau khi điều hướng: tìm theo chữ thì thêm `.filter({ visible: true })`.

## Quy trình làm việc: OpenSpec

Mọi tính năng mới đi qua OpenSpec. **Không code thẳng khi chưa có change đã được duyệt.**

1. `/opsx:explore` — đọc tài liệu, hỏi lại chỗ chưa rõ.
2. `/opsx:propose <tên-change>` — sinh `proposal.md`, specs, `design.md`, `tasks.md`. **Dừng lại chờ người dùng duyệt.**
3. `/opsx:apply` — code theo `tasks.md`, tick từng task.
4. `openspec validate --strict` — kiểm tra spec.
5. `/opsx:archive` — gộp spec vào `openspec/specs/`.

Sửa lỗi nhỏ, đổi chữ, chỉnh style: không cần change.

### Quy tắc khi làm change

- Mỗi change có một GitHub issue (danh sách ở issue #21). Câu lệnh propose và checklist nằm trong issue.
- **Propose chỉ tạo tài liệu.** Chỉ sửa `openspec/changes/<change>/` (và `docs/` nếu chốt quyết định mới). Không sửa `src/`, `drizzle/`, `package.json`, test. Không tự chạy apply. Mở PR rồi dừng, chờ người dùng ghi "Duyệt".
- Mỗi change một nhánh trùng tên change, một PR. PR propose/apply ghi `Refs #<issue>`; PR archive ghi `Closes #<issue>`.
- `design.md` trả lời từng điểm "cần chốt" trong issue, mỗi điểm có lý do và phương án đã cân nhắc.
- Quyết định nghiệp vụ mới (người dùng chốt khi review) ghi vào `docs/requirements.md` mục 0.2, kèm ngày, trong cùng PR.
- **Review nằm trong comment PR.** Khi được bảo "đọc review", đọc comment mới nhất, sửa hết mục "Cần sửa", kèm test cho từng điểm.
- Trước khi báo apply xong: `npm run lint && npm run typecheck && npm test && npm run test:e2e` và `npx openspec validate <change> --strict` đều xanh. Giao diện đổi thì gắn nhãn `update-snapshots` vào PR.
- Archive: không tự tick task chưa làm. Task kiểm tra tay chưa làm thì ghi "làm sau, theo dõi ở #33" trong `tasks.md`, thêm một mục cho change đó vào issue **#33** (tổng hợp kiểm tra tay mọi change; ghi các bước và số cần so), rồi báo người dùng. Không để kiểm tra tay rải ở issue của từng change.

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
- **Danh mục** (`src/lib/catalog/`): mã vật tư, bộ, bãi gõ tay theo `src/domain/item-code.ts` và **không đổi được**; mã đối tác, công trình tự sinh (`NT-0001`, `NCC-0001`, `CT-0001`). Bảng nào tham chiếu danh mục thì khóa ngoại `ON DELETE RESTRICT` (bản ghi đã dùng chỉ ngừng dùng, không xóa). Quyền: đọc `catalog.read`, ghi `items.manage` / `partners.manage` / `locations.manage`.
- **CCCD và số tài khoản** của nhà cung cấp là dữ liệu cá nhân: chỉ trả số đã che, trừ dữ liệu form sửa (`partners.manage`).
- Lệnh sửa trong service đọc lại bản ghi **trong** transaction bằng `FOR UPDATE` trước khi kiểm tra và ghi; bản ghi được tham chiếu (vật tư trong bộ, nhà thầu của công trình) giữ `FOR SHARE`.
- **Sổ kho** (`src/lib/inventory/`): mọi biến động ghi qua `postMovements` trong transaction của chứng từ; không INSERT thẳng vào `inventory_ledger` (DB chặn UPDATE/DELETE/TRUNCATE). Giá BQ theo (mã + tình trạng) gộp **mọi vị trí** kể cả công trình (0.2 #24); chỉ `OPENING`, `PURCHASE_IN`, `REPAIR_IN` đổi giá. Không ghi lùi ngày nghiệp vụ; ngày tính thuê lấy ngày giao/trả thực tế trên phiếu, không lấy ngày ghi sổ. Đối chiếu bằng `npm run inventory:check`.
- **Đơn thu mua** (`src/lib/purchasing/`): đơn chỉ lưu số và chi phí **dự kiến**, **không ghi sổ kho** (`PURCHASE_IN` thuộc phiếu nhập). Chia chi phí mua hàng và chia giá lô hàng cũ theo tình trạng dùng hàm thuần `src/domain/landed-cost.ts` (phần dư lớn nhất, tổng khớp từng đồng; phế liệu theo giá sắt vụn, 0.2 #27). Chuyển trạng thái đơn qua `transition()` ở `src/domain/purchase-order.ts`; "đơn đã có phiếu nhập chưa" đọc qua `src/lib/purchasing/receipts.ts`. Sửa đơn gửi kèm `updatedAt`, lệch thì 409.
- Trang dùng giờ hiện tại (`new Date()`) phải `await connection()` trước (Cache Components).
- **Giữ đường lui cho SaaS** (0.2 #33, mỗi công ty một DB): (1) mã tự sinh mới dùng bảng đếm kiểu `document_counter`, không tạo thêm `CREATE SEQUENCE`; (2) mọi truy cập DB đi qua `src/db/client.ts`, không tự mở kết nối khác; (3) không cache dữ liệu nghiệp vụ ở biến cấp module; khóa của `"use cache"` phải gồm được công ty sau này; (4) không viết cứng thông tin công ty (tên, MST, địa chỉ, logo trên phiếu in): để trong bảng cài đặt; (5) hằng số nghiệp vụ (×30 ngày, ngưỡng 10 %...) đặt một chỗ trong `src/domain` và truyền làm tham số, không rải số cố định.
- **Phiếu nhập** (`src/lib/receiving/`): ghi qua `postReceipt` (khóa đơn `FOR UPDATE`, một transaction: phiếu + `PURCHASE_IN` + trạng thái đơn + lịch sử). Mã nháp `client_draft_id` chống tạo trùng. Không lưu tiền trên phiếu: tiền hàng = số × đơn giá dòng đơn, chi phí phân bổ đọc từ sổ kho. Nháp điện thoại ở `src/lib/drafts/` (IndexedDB), file `.wasm` quét QR chép vào `public/vendor/` khi `npm install`.
- **Phiếu sửa chữa** (`src/lib/repairs/`): ghi sổ qua `postRepairOrder` (khóa phiếu, rồi `lockForPosting` vật tư → vị trí → giá, cùng thứ tự với `postMovements`). Giá phế liệu, phần hỏng, giá vào Tốt tính bằng hàm thuần `src/domain/repair-order.ts` (0.2 #23). Ngày sổ = ngày ghi sổ; ngày sửa xong chỉ là thông tin. Phiếu đã ghi sổ bị trigger khóa.

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
- **Thiết kế màn hình** đã vẽ: file ở `docs/design/screens/` (đọc `README.md` trong đó trước), bảng màn ↔ change ở `docs/ui.md` mục 3.4. Khi làm change có giao diện, mở đúng file thiết kế của change đó. Hex trong file thiết kế phải đổi sang token.
- **Viết tiền:** `1.250.000 ₫` theo spec `domain-values`, kể cả khi README Bright Blue Base ghi kiểu `đ`.
- Không tự thêm thư viện UI khác khi chưa hỏi.
- Desktop: bảng dữ liệu. Mobile: thẻ (card), nút to, stepper +/-.
- Chữ trên giao diện: tiếng Việt.
