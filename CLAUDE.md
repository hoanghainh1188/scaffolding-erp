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
- **Hai role DB** (0.2 #36): app chạy bằng role quyền tối thiểu `erp_app` (`DATABASE_URL`); migration chạy bằng owner (`DATABASE_URL_MIGRATE`, không bao giờ đặt trên server app: production từ chối khởi động). `db:migrate` tự cấp lại quyền (`src/db/grants.ts`); không viết `GRANT` trong `drizzle/`.
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
| `npm test` | Vitest: unit, component, integration (integration cần `TEST_DATABASE_URL` = `erp_app` và `TEST_DATABASE_URL_MIGRATE` = owner) |
| `npm run test:unit` / `test:int` / `test:coverage` | Từng nhóm test; coverage ≥ 80% cho `src/domain`, `src/lib` |
| `npm run test:e2e` | Playwright trên Edge (`next dev` mặc định; trên CI hoặc khi có `PW_PRODUCTION=1` dùng bản production build); ở local bỏ qua `@visual` |
| `npm run test:e2e:prod` | Build production với `E2E=1` rồi chạy Playwright kiểm thử trên bản build |
| `npm run tokens` | Sinh `src/styles/tokens.css` từ `docs/design-system/tokens.json` |
| `npm run db:up` / `db:down` | Bật / tắt PostgreSQL trong Docker |
| `npm run db:generate` / `db:migrate` / `db:studio` | Sinh migration SQL / chạy migration bằng owner (`DATABASE_URL_MIGRATE`) rồi cấp quyền cho `erp_app` / xem dữ liệu |
| `npm run db:roles` | Tạo role `erp_app` trên Postgres local/CI (volume Docker cũ); Neon tạo bằng SQL theo `docs/ops/demo.md` |
| `npm run db:seed:dev` | Tạo 5 tài khoản mẫu cho dev (`giamdoc`, `ketoan`, `kinhdoanh`, `thukho`, `xuong`), mật khẩu `DEV_SEED_PASSWORD`, danh mục mẫu như thiết kế D9/D16 sổ kho mẫu (ví dụ tính tay design D11 của `inventory-ledger`), 5 đơn thu mua mẫu (đơn D3 của `purchase-orders`), giá sắt vụn 7.500 ₫/kg, một đơn đang nhận 2 chuyến như D3b (`goods-receipt`) và một phiếu sửa chữa nháp như D12 (`simple-repair`), một phiên kiểm kê chờ duyệt như D13 (`stocktake`), một phiếu sửa chi phí chuyến `ĐCG` chờ duyệt (`stock-value-adjustment`) 11 dòng nhật ký mẫu ngày 27–28/10/2026 như D18 (`activity-log`), và 3 hợp đồng mẫu (`contracts`): hợp đồng thuê D5 chờ duyệt `112026/ANPHAT-MINHPHAT`, một hợp đồng thuê đã duyệt có phụ lục `/01` nháp như D5b, một hợp đồng bán theo kg (đặt tên viết tắt công ty "An Phát" nếu Cài đặt chưa có), và 2 phiếu xuất mẫu (`deliveries`) của hợp đồng thuê An Phú – Block B: Đợt 1 đã xuất 40 `PK-KU` (hợp đồng sang Đang thực hiện), Đợt 2 Chờ nhặt 50 bộ, và 1 phiếu thu hồi mẫu (`returns-and-compensation`) của hợp đồng đó: 30 Tốt, 5 Chờ sửa, 3 Mất `PK-KU`, 2 ảnh mẫu, phiếu đền bù Chờ duyệt, và mẫu `site-operations`: một hợp đồng thuê Đã duyệt mới của Minh Phát ở Dương Nội (hợp đồng nhận), từ An Phú – Block B một phiếu chuyển `CCT` Chờ xác nhận như M9, một phiếu mua lại `MLA` Chờ duyệt như D6c và một đổi hàng Chờ thu hồi như D6d (Đợt 3, 10 `GG-CH`), và 5 dòng ngày nghỉ không tính thuê năm 2027 (`rental-billing`: Tết Dương lịch, Tết Nguyên đán 05–13/02 như D7, Giỗ Tổ, 30/4–1/5, 2/9), và 2 phiếu thu mẫu của Minh Phát (`receivables`): nộp đủ cọc tiền của hợp đồng An Phú – Block B và 2.000.000 ₫ trả nợ (dư thành tiền trả trước); mã yêu cầu cố định nên chạy lại không thêm |
| `npm run inventory:check` | Đối chiếu giá vốn lưu riêng với sổ kho; lệch thì thoát mã 1 |
| `npm run billing:check` | Tính lại từng kỳ tiền thuê đã chốt từ sổ kho, so với số đã chụp; lệch thì thoát mã 1 |
| `npm run auth:create-director -- --username <tên> --name "<Họ tên>"` | Tạo tài khoản Giám đốc đầu tiên, in mật khẩu tạm một lần |
| `npm run auth:unlock -- --username <tên>` | Gỡ tạm khóa cho tài khoản (do nhập sai mật khẩu nhiều lần) hoặc `--all` cho toàn bộ hệ thống |

Lưu ý:

- Sửa `tokens.json` thì chạy `npm run tokens`; test chống lệch sẽ đỏ nếu quên.
- Không chạy hai server Next.js cùng lúc trên repo (trang sẽ tự tải lại liên tục). Muốn Playwright dùng lại dev server đang chạy: `PW_PORT=<cổng> npm run test:e2e` — server đó phải chạy với `AUTH_SIGN_IN_LIMIT_PER_MINUTE=1000`, không thì E2E bị giới hạn 20 lần đăng nhập/phút. Chạy E2E trên bản production build cục bộ: `npm run test:e2e:prod`.
- Sổ kho ở DB dev không xóa được: E2E ghi vào mã cố định `E2E-KHO-01/02` và kiểm theo chênh lệch.
- Đơn thu mua do E2E tạo có ghi chú `E2E thử` (nhà cung cấp Hòa Phát mẫu); global setup xóa các đơn đó **khi chưa có phiếu nhập** (đơn đã có phiếu nhập ở lại vì sổ kho không xóa được). E2E nhập hàng ghi vào `E2E-KHO-01/02`, tình trạng Chờ sửa / Phế liệu, và kiểm theo chênh lệch. Không thêm nhà cung cấp riêng cho E2E: ảnh mốc D16 đếm số nhà cung cấp.
- E2E dùng **`XUONG-01`**: global setup tự thêm hàng Chờ sửa `E2E-KHO-01` ở đó cho `repairs.spec.ts` (`ensureRepairStock`, dòng sổ ở lại DB dev) và hủy phiên kiểm kê mở ở đó do `e2e.*` bắt đầu (phiên mở của người khác thì dừng, không hủy). E2E kiểm kê bắt đầu phiên ở `XUONG-01`, chỉ đếm `E2E-KHO-02` (vì `repairs.spec.ts` đo `E2E-KHO-01` ở xưởng) và chỉ tạo chênh lệch thừa; global setup tạo một lần phiên mẫu Chờ duyệt ở `BAI-01` cho ảnh mốc D13, E2E không đụng phiên đó (một vị trí chỉ có một phiên mở).
- Tài khoản tạm `e2etmp*` của `auth.spec.ts` đã có nhật ký thì global setup **khóa** (và đăng xuất), không xóa: nhật ký giữ khóa ngoại tới người làm. Chúng ở lại DB dev; tài khoản tạm chưa có nhật ký vẫn bị xóa.
- E2E điều chỉnh giá (`inventory.spec.ts`, nhóm `flows` chạy nối tiếp) dùng **`E2E-KHO-02` Mới**: tăng rồi giảm đúng `tồn × 1.000 ₫` nên giá BQ và tổng giá trị D10 về như cũ (ảnh mốc không đổi); cần test điều chỉnh trước đó đã tạo tồn Mới.
- E2E xuất kho (`deliveries.spec.ts`) dùng **một hợp đồng thuê E2E** (ghi chú `E2E thử`, nhà thầu mẫu sẵn có) do global setup tạo và duyệt **một lần** rồi dùng lại, xuất `E2E-KHO-01/02` từ `BAI-01` và kiểm theo chênh lệch; global setup hủy phiếu xuất Chờ nhặt / Đang nhặt do `e2e.*` lập lần trước. Không đụng hợp đồng mẫu của ảnh mốc D4/D5.
- E2E đăng nhập bằng tài khoản `e2e.*` (global setup tạo lại mỗi lần chạy) và chạy với vai trò Giám đốc mặc định; test cần vai trò khác dùng `test.use({ storageState: statePath("ACCOUNTANT") })`.
- Ảnh mốc Playwright chỉ tạo trên CI: gắn nhãn **`update-snapshots`** vào PR (workflow tự gỡ nhãn khi xong), hoặc tab Actions → **Update Playwright snapshots** → chọn nhánh → Run workflow. Workflow đẩy commit ảnh mới lên nhánh; CI chạy lại trên commit đó bằng sự kiện `pull_request` (check bắt buộc chỉ nhận run `pull_request`, không nhận `workflow_dispatch`).
  - Có GitHub App "snapshots" (secret `SNAPSHOTS_APP_ID`, `SNAPSHOTS_APP_PRIVATE_KEY`): CI chạy ngay, không cần làm gì.
  - Chưa có app: commit được đẩy bằng `GITHUB_TOKEN`, run CI **chờ duyệt**. Workflow comment vào PR; mở ô checks của PR → **Approve workflows to run**. Không cần đẩy commit rỗng.
  - Tạo app (một lần, chủ repo làm): Settings của tài khoản → Developer settings → GitHub Apps → New GitHub App; tắt Webhook; Repository permissions → **Contents: Read and write**; "Only on this account" → Create. Ghi lại App ID, bấm **Generate a private key** (tải file `.pem`). Trang app → Install App → chỉ chọn repo này. Repo → Settings → Secrets and variables → Actions → New repository secret: `SNAPSHOTS_APP_ID` = App ID, `SNAPSHOTS_APP_PRIVATE_KEY` = toàn bộ nội dung file `.pem`.
- CI chạy song song (integration và E2E Edge chia 2, ảnh mốc là job riêng); job `Lint, types, tests, build` và `E2E (Edge)` chỉ gom kết quả, giữ đúng tên check bắt buộc. PR chỉ sửa `docs/` (trừ `docs/design-system/`), `openspec/`, `CLAUDE.md`, `AGENTS.md` thì bỏ qua test và E2E.
- E2E chuyển công trình, mua lại, đổi hàng (`site-operations.spec.ts`) dùng hợp đồng thuê E2E của `deliveries.spec.ts` (hợp đồng đi, `E2EXUAT`) và **một hợp đồng thuê E2E thứ hai** (`E2ECHUYEN`, cùng nhà thầu, ở An Phú) do global setup tạo và duyệt một lần; chỉ dùng **`E2E-KHO-02`** (vì `deliveries.spec.ts`, `returns.spec.ts` đo `E2E-KHO-01` của cùng hợp đồng song song), global setup giữ ≥ 20 cái ở công trình, kiểm theo chênh lệch. Global setup hủy phiếu chuyển Nháp / Chờ xác nhận và từ chối phiếu mua lại Chờ duyệt của hai hợp đồng E2E (chứng từ mẫu ở An Phú giữ nguyên). E2E đọc cột D6 **theo tên cột** (cột Chuyển đến / Chuyển đi / Mua lại chỉ hiện khi khác 0).
- Trong E2E, Next 16 giữ trang cũ ẩn trong DOM sau khi điều hướng: tìm theo chữ thì thêm `.filter({ visible: true })`.
- E2E tiền thuê (`billing.spec.ts`) **không chốt kỳ** trên DB dev (kỳ phải đã hết, kỳ đã chốt không xóa được): chốt, khóa, 409, dòng điều chỉnh kiểm bằng integration test. Ngày nghỉ: E2E chỉ thêm / sửa / xóa năm **2098** (global setup dọn năm đó); global setup giữ một dòng cố định "Tết mẫu E2E" 05/02 – 13/02/**2099** cho ảnh mốc. Ảnh mốc D7 chụp **kỳ 02/2099** (không có hợp đồng), trang ngày nghỉ chụp năm 2099: bảng kê đổi theo ngày chạy và theo số lần chạy nên không chụp, số tiền kiểm bằng test; ô phụ thuộc ngày trên D7 gắn `data-mask`.
- E2E công nợ (`receivables.spec.ts`): Kế toán ghi phiếu thu **1.000 ₫** cho Minh Phát (nhà thầu của hợp đồng E2E) rồi **hủy** có lý do (phiếu và dòng hủy ở lại DB dev, chỉ ghi thêm); **không thanh lý** trên DB dev (không mở lại được), thanh lý kiểm bằng integration test. Ảnh mốc D14 chụp với ô tìm không khớp ai (`q=khong-ai-ca-e2e`), số và đếm gắn `data-mask`; D14b không chụp (nợ đổi mỗi lần chạy).

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
- 4 tình trạng: `NEW`, `GOOD`, `NEEDS_REPAIR`, `SCRAP`. Cho thuê chỉ xuất `NEW`, `GOOD`; hợp đồng bán bán được `NEW`, `GOOD` và Phế liệu (`SCRAP`, chỉ theo kg).
- **Tiền thuê:** đếm từ ngày sau ngày xuất (N+1) đến hết ngày trả: số ngày = ngày trả − ngày xuất. Tiền thuê = giá ngày × số ngày thực tế (tháng 28–31 ngày), thuê tối thiểu 45 ngày (0.2 #4, #39). Giá tháng chỉ để hiện: màn hợp đồng hiện theo số ngày thực của tháng (giá ngày × 30 và × 31); riêng cột giá tháng ở D9 (danh mục) vẫn giá ngày × 30 để quy đổi.
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
- **Sổ kho** (`src/lib/inventory/`): mọi biến động ghi qua `postMovements` trong transaction của chứng từ; không INSERT thẳng vào `inventory_ledger` (DB chặn UPDATE/DELETE/TRUNCATE). Giá BQ theo (mã + tình trạng) gộp **mọi vị trí** kể cả công trình (0.2 #24); chỉ `OPENING`, `PURCHASE_IN`, `REPAIR_IN`, `REVALUE` đổi giá. Dòng `REVALUE` có số lượng 0 và **`location_id` trống** (0.2 #35): truy vấn theo vị trí phải `inner join location` hoặc lọc `location_id is not null`; thẻ kho lọc vị trí thì thêm `or location_id is null`. Không ghi lùi ngày nghiệp vụ; ngày tính thuê lấy ngày giao/trả thực tế trên phiếu, không lấy ngày ghi sổ. Đối chiếu bằng `npm run inventory:check`.
- **Quyền DB** (`src/db/grants.ts`): role app chỉ có `SELECT, INSERT` trên bảng chỉ ghi thêm (`APPEND_ONLY_TABLES`: `inventory_ledger`, `activity_log`, `scrap_price`, `billing_period`, `billing_period_line`, `billing_period_freight`, `receipt`, `receipt_allocation`, `receipt_cancellation`, `contract_settlement`), CRUD trên bảng khác, không TRUNCATE/DDL. Bảng chỉ ghi thêm mới (trigger `*_append_only`) phải thêm vào `APPEND_ONLY_TABLES` (test chống lệch). Integration test chạy code bằng `erp_app`; dọn bảng và kiểm trigger bằng owner qua `getAdminDatabase()` (`src/test/admin.ts`); `truncateWithLedger(statement)` đã dùng owner.
- **Đơn thu mua** (`src/lib/purchasing/`): đơn chỉ lưu số và chi phí **dự kiến**, **không ghi sổ kho** (`PURCHASE_IN` thuộc phiếu nhập). Chia chi phí mua hàng và chia giá lô hàng cũ theo tình trạng dùng hàm thuần `src/domain/landed-cost.ts` (phần dư lớn nhất, tổng khớp từng đồng; phế liệu theo giá sắt vụn, 0.2 #27). Chuyển trạng thái đơn qua `transition()` ở `src/domain/purchase-order.ts`; "đơn đã có phiếu nhập chưa" đọc qua `src/lib/purchasing/receipts.ts`. Sửa đơn gửi kèm `updatedAt`, lệch thì 409.
- Trang dùng giờ hiện tại (`new Date()`) phải `await connection()` trước (Cache Components).
- **Giữ đường lui cho SaaS** (0.2 #33, mỗi công ty một DB): (1) mã tự sinh mới dùng bảng đếm kiểu `document_counter`, không tạo thêm `CREATE SEQUENCE`; (2) mọi truy cập DB đi qua `src/db/client.ts`, không tự mở kết nối khác; (3) không cache dữ liệu nghiệp vụ ở biến cấp module; khóa của `"use cache"` phải gồm được công ty sau này; (4) không viết cứng thông tin công ty (tên, MST, địa chỉ, logo trên phiếu in): để trong bảng cài đặt; (5) hằng số nghiệp vụ (×30 ngày, ngưỡng 10 %...) đặt một chỗ trong `src/domain` và truyền làm tham số, không rải số cố định.
- **Phiếu nhập** (`src/lib/receiving/`): ghi qua `postReceipt` (khóa đơn `FOR UPDATE`, một transaction: phiếu + `PURCHASE_IN` + trạng thái đơn + lịch sử). Mã nháp `client_draft_id` chống tạo trùng. Không lưu tiền trên phiếu: tiền hàng = số × đơn giá dòng đơn, chi phí phân bổ đọc từ sổ kho. Nháp điện thoại ở `src/lib/drafts/` (IndexedDB), file `.wasm` quét QR chép vào `public/vendor/` khi `npm install`.
- **Phiếu sửa chữa** (`src/lib/repairs/`): ghi sổ qua `postRepairOrder` (khóa phiếu, rồi `lockForPosting` vật tư → vị trí → giá, cùng thứ tự với `postMovements`). Giá phế liệu, phần hỏng, giá vào Tốt tính bằng hàm thuần `src/domain/repair-order.ts` (0.2 #23). Ngày sổ = ngày ghi sổ; ngày sửa xong chỉ là thông tin. Phiếu đã ghi sổ bị trigger khóa.
- **Phiếu điều chỉnh giá trị** (`ĐCG`, loại `REVALUE` của `stock_adjustment`): mỗi dòng (mã + tình trạng) + chênh lệch, không đổi số lượng; giá BQ mới tính bằng hàm thuần `src/domain/stock-revaluation.ts` theo tồn lúc duyệt. Chứng từ gốc bắt buộc và phải có dòng sổ của từng (mã + tình trạng). Sửa chi phí chuyến phiếu nhập qua `buildTripRevaluation` (`src/lib/inventory/revaluations.ts`): chia lại như phiếu gốc, dựng lại không khớp số đã ghi thì buộc nhập tay.
- **Hợp đồng** (`src/lib/contracts/`): bảng `contract` giữ số, loại, nhà thầu (khóa từ lần lưu đầu); mọi thứ đổi được nằm trong `contract_revision`: bản gốc số 0, phụ lục `/01`, `/02`..., **mỗi bản là bộ đầy đủ** (dòng hàng, bộ, giá đền bù, cọc, kế hoạch giao). Bản đã duyệt bị trigger khóa (cả dòng con). Giá tại một ngày đọc qua `contractTermsAt` (bản đã duyệt có ngày hiệu lực lớn nhất ≤ ngày đó, trùng ngày thì số lớn hơn thắng). Quyền hợp đồng qua `canContract` (`src/domain/permissions.ts`: quyền vai trò + `user.contract_scope` của tài khoản Kinh doanh, 0.2 #51), không gọi `can` thẳng cho hợp đồng. Số ngày thuê tối thiểu chỉ đặt ở `DEFAULT_MIN_RENTAL_DAYS` (`src/domain/rental.ts`). `overdueDebt` (`src/lib/contracts/overdue.ts`) đọc số nợ quá hạn thật từ công nợ (`receivables`); `lastClosedPeriodEnd` (`src/lib/contracts/billing-lock.ts`) đọc kỳ đã chốt thật (`rental-billing`).
- **Phiếu xuất** (`src/lib/deliveries/`): một phiếu = một đợt / chuyến xe của một hợp đồng, lấy từ **một bãi**; `PLANNED` → `PICKING` → `POSTED` (+ `CANCELLED`), chuyển qua `transition()` ở `src/domain/delivery-note.ts`. Ghi sổ qua `postDelivery`: tìm mã nháp trước, khóa **hợp đồng → phiếu** `FOR UPDATE` rồi `postMovements` (thuê `DELIVERY_OUT` bãi + `DELIVERY_IN` công trình; bán `SALE_OUT` + `weighed_kg`); phiếu đầu tiên chuyển hợp đồng `ACTIVE`. Ngày giao = ngày ghi sổ (0.2 #55). "Còn phải giao" tính ra, không lưu (thuê theo số đang ở công trình của hợp đồng, bán theo tổng đã giao, 0.2 #56); dung sai cân 10 % chỉ ở `src/domain/tolerance.ts`. API/trang M5 (`/api/m/deliveries`) **không trả giá, cước**. Dòng con và phiếu đã xuất/hủy bị trigger khóa: chèn pick và giá bán **trước** khi đổi phiếu sang `POSTED`.
- **Phiếu thu hồi và đền bù** (`src/lib/returns/`, `src/lib/compensations/`): phiếu thu hồi chỉ có trên server khi đã ghi sổ (không sửa, không hủy). Ghi sổ qua `postReturn`: tìm mã nháp trước, khóa **hợp đồng** `FOR UPDATE` (cùng thứ tự `postDelivery`), đọc "đang ở công trình" theo (mã + tình trạng) rồi `postMovements`: `RETURN_OUT` công trình + `RETURN_IN` bãi theo giá BQ hiện tại, rút **Mới trước rồi Tốt**; hàng mất `LOSS_OUT` ở công trình (0.2 #62, #63). Phế liệu chưa từng có giá lấy min(kg × giá sắt vụn, giá dòng ra). Phiếu đền bù tự sinh cùng transaction khi có Chờ sửa / Phế liệu / Mất (`src/domain/compensation.ts`, giá bản hợp đồng tại ngày trả); chỉ Giám đốc sửa giá dòng trống, giảm trừ, duyệt, từ chối; duyệt lưu `amount_due`, `due_date` cho `receivables`. Dòng con chỉ chèn trong transaction tạo phiếu (trigger so `created_xact`, không so giờ). Ảnh (`return_photo`, `bytea`, 0.2 #65): danh sách **không bao giờ** chọn cột `content`; xem qua `/api/returns/photos/[id]`; hằng số ở `src/domain/return-photo.ts`. "Đang ở công trình" (`onSiteByItem`) gộp dòng sổ của phiếu xuất và phiếu thu hồi của hợp đồng. M4 và `/api/m/returns` **không trả giá, tiền**.
- **Chuyển công trình, mua lại, đổi hàng** (`src/lib/site-transfers/`, `src/lib/buy-backs/`, `src/lib/exchanges/`): phiếu chuyển (`CCT`) ghi `TRANSFER_OUT` ở công trình đi + `TRANSFER_IN` ở công trình nhận, rút Mới trước, giá BQ; dòng sổ thuộc hợp đồng theo **dấu dòng** (ra = hợp đồng đi, vào = hợp đồng nhận), không theo vị trí, nên hai hợp đồng cùng công trình vẫn tách đúng. Ghi sổ khóa **hai hợp đồng theo id tăng dần** (`lockContractsInOrder`) rồi phiếu, **đọc lại** cặp hợp đồng sau khi khóa phiếu (khác thì 409); sửa nháp khóa cả hợp đồng nhận cũ và mới. `moved_quantity` chỉ ghi được trong transaction ghi sổ (`posted_xact`). Phiếu mua lại (`MLA`) **duyệt mới ghi sổ** `SALE_OUT` ở vị trí công trình, thôi tính thuê từ ngày duyệt. Đổi hàng không có chứng từ riêng: `delivery_exchange` nối một phiếu xuất với phiếu thu hồi (M4 gửi `exchangeId`). M9 và `/api/m/site-transfers` **không trả giá**. "Đang ở công trình" (`siteMovements`) đọc cả phiếu chuyển và phiếu mua lại.
- **Tiền thuê theo kỳ** (`src/lib/billing/`, hàm thuần `src/domain/rental-billing.ts`, `rental-lots.ts`, `rental-holiday.ts`): kỳ = tháng dương lịch. Đọc dòng sổ có ngày qua `siteLedgerLines` (`src/lib/deliveries/site-ledger.ts`, cùng điều kiện nối với `siteMovements`); mỗi dòng giao của một mã là một **lượng hàng**, hàng trả / mất / mua lại / chuyển đi rút **lượng giao sớm nhất trước** (0.2 #77). Từ = max(đầu kỳ, hôm sau ngày giao), Đến = min(cuối kỳ, ngày trả); trừ ngày nghỉ chung (`rental_holiday`); tách dòng tại ngày hiệu lực phụ lục đổi giá / VAT. Tối thiểu so với ngày tính đã trừ nghỉ, dòng bù ở kỳ có ngày trả, giá tại ngày trả; hàng mất và giao-trả cùng ngày không bù; chuyển cùng nhà thầu giữ ngày giao gốc (0.2 #70, #74–#76). VAT theo từng dòng, làm tròn trên tổng cùng thuế suất (0.2 #79). Kỳ mở tính lại mỗi lần xem; **chốt** (`closeBillingPeriod`) khóa hợp đồng `FOR UPDATE` rồi khóa advisory **chia sẻ** `rental-holidays`, tính lại, so `expectedTotal` (409), chép bảng kê vào `billing_period*` (chỉ ghi thêm, dòng con chỉ chèn trong transaction tạo kỳ), khóa dòng điều chỉnh. Sửa ngày nghỉ khóa advisory **độc quyền** và bị từ chối khi chạm kỳ đã chốt. Kỳ đã chốt đọc từ bảng chụp, không tính lại. Hạn trả = ngày cuối kỳ + số ngày được nợ (0.2 #78). Quyền `billing.view` (Kinh doanh thêm `canContract` thuê), `billing.manage`, `holidays.manage`.
- **Nhật ký thao tác** (`src/lib/activity/`): mọi hàm ghi gọi `logActivity(tx, actor, …)` trong transaction của thao tác (`actor` lấy từ `withAuth`, có vai trò + thiết bị); sửa không đổi trường nào thì không ghi; CCCD/STK chỉ lưu dạng che (`diffFields`); không bao giờ ghi mật khẩu. Bảng `activity_log` chỉ ghi thêm (trigger). Test tĩnh `src/lib/activity/coverage.test.ts` bắt hàm ghi quên gọi `logActivity`.
- **Công nợ phải thu** (`src/lib/receivables/`, hàm thuần `src/domain/receivables.ts`): khoản nợ **tính ra**, không lưu bản sao (`readDebts`: kỳ đã chốt, phiếu xuất **bán** đã ghi sổ với VAT / hạn theo bản hợp đồng lưu trên phiếu, đền bù / mua lại đã duyệt; kỳ có tổng âm là khoản giảm nợ). Phiếu thu, phân bổ, dòng hủy, thanh lý **chỉ ghi thêm**; còn lại = phát sinh − phân bổ còn hiệu lực (phiếu chưa hủy); tiền trả trước tính ra, không lưu số dư. Thứ tự khóa: hợp đồng → chứng từ → sổ kho → **nhà thầu `FOR UPDATE` cuối** (`lockCustomer`); không `FOR UPDATE` trên bảng chỉ ghi thêm (role app không có `UPDATE`). Đường tạo khoản nợ (chốt kỳ, duyệt đền bù / mua lại, ghi sổ xuất bán) và hủy phiếu thu gọi `settleCredits` trong transaction của mình (test tĩnh `settle-coverage.test.ts`). Quá hạn tính theo ngày Việt Nam qua `overdueDebt` (`src/lib/contracts/overdue.ts`). Phụ lục hợp đồng bán: ngày hiệu lực sau ngày giao gần nhất (0.2 #89). Thanh lý (`settleContract`) cấn cọc chỉ vào nợ của chính hợp đồng, ghi `contract_settlement`, chuyển `CLOSED`. Quyền `receivables.view`, `receipts.manage`, `contracts.close` (Giám đốc, Kế toán).

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
| Phụ lục hợp đồng | `contract_revision` (kind `AMENDMENT`) |
| Phiếu xuất | `delivery_note` |
| Đợt xuất | `delivery_note.batch_no` |
| Phiếu thu hồi | `return_note` |
| Hàng mất ở công trình | `LOSS_OUT` (dòng sổ) |
| Phiếu đền bù | `compensation_note` |
| Phiếu chuyển công trình | `site_transfer` |
| Phiếu mua lại | `buy_back_note` |
| Đổi hàng (đợt xuất + phiếu thu hồi nối nhau) | `delivery_exchange` |
| Kỳ tính tiền thuê (đã chốt) | `billing_period` |
| Phiếu thu | `receipt` (`PAYMENT` trả nợ, `DEPOSIT` nộp cọc tiền) |
| Phân bổ phiếu thu (trừ vào khoản nợ) | `receipt_allocation` |
| Hủy phiếu thu | `receipt_cancellation` |
| Tiền trả trước | phần phiếu thu chưa phân bổ (tính ra) |
| Thanh lý hợp đồng | `contract_settlement` |
| Dòng điều chỉnh kỳ trước | `billing_adjustment` |
| Ngày nghỉ không tính thuê | `rental_holiday` |
| Lượng hàng (một lần giao của một mã) | `Piece` (`src/domain/rental-lots.ts`) |
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
- **Ô ngày:** dùng `DateInput` (`src/components/domain/date-input.tsx`), luôn hiện `dd/mm/yyyy` và gửi `YYYY-MM-DD`; không dùng `<input type="date">`.
- Desktop: bảng dữ liệu. Mobile: thẻ (card), nút to, stepper +/-.
- Chữ trên giao diện: tiếng Việt.
