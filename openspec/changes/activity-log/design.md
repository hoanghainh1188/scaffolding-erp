# Design: activity-log

## Context

- Mọi lệnh ghi đã nằm trong service ở `src/lib/**`, mỗi lệnh **một transaction** (`db.transaction`), route chỉ đọc input rồi gọi service. Route bọc `withAuth`, trang gọi `requirePermission` (test `route-guards.test.ts` bắt chỗ quên).
- Service nhận `actor: { id }` (`src/lib/catalog/common.ts`). Các hàm xóa (`deleteItem`, `deleteSupplier`, `deleteOrder`, `deleteRepairDraft`, `deleteAdjustment`…) và vài hàm sửa nháp (`updateRepairDraft`, `updateAdjustment`) **chưa nhận actor**.
- Đã có: `detectDevice` (Máy tính / Điện thoại từ User-Agent, `src/domain/device.ts`), `maskIdNumber` / `maskBankAccount` (`•••• •••• 2345`, `•••• 5678`), `formatDateTime`, `toBusinessDate` theo `Asia/Ho_Chi_Minh`, `formatMoney`.
- Sổ kho chặn sửa/xóa bằng trigger `inventory_ledger_append_only`; TRUNCATE chỉ qua được trên DB tên `*_test` khi phiên đặt `inventory.allow_truncate = 'on'` (helper dọn DB test).
- Lịch sử riêng đã có: `purchase_order_event` (D3b). Change này **không thay** nó.
- Phiếu nhập có xác nhận bất thường (0.2 #30, `confirmedOverrides`), phiếu sửa có câu hỏi chi phí cao (0.2 #23), kiểm kê có cờ dòng (`stocktakeFlags`).
- Thiết kế D18 đã duyệt ở PR #57. App **chưa chạy thật**: DB chỉ có dữ liệu dev / seed / E2E.

## Goals / Non-Goals

**Goals**

- Không thao tác ghi nào lọt khỏi nhật ký, và không có dòng nhật ký nào cho thao tác không xảy ra.
- Giám đốc thấy nhanh chỗ đáng ngờ: ngoài giờ, dữ liệu nhạy cảm, xác nhận bất thường, và trước → sau của từng lần sửa.
- Không lộ dữ liệu cá nhân hay mật khẩu qua nhật ký.

**Non-Goals**

- Đăng nhập sai, xem trang, IP, cảnh báo tức thời, hoàn tác, hết hạn lưu (xem proposal "Ngoài phạm vi").

## Decisions

### D1. Màn hình và vị trí

Code theo `D18-ActivityLog.dc.html`, đặt ở **`/settings/activity`**, lối vào là một thẻ trên trang `/settings` (cùng kiểu thẻ "Người dùng", "Giá sắt vụn"). Lý do: Cài đặt đã chỉ cho Giám đốc (`settings.view`), không cần thêm mục menu.

Khác bản vẽ (spec thắng):

- Số đã che theo hàm có sẵn `•••• 5678` (có dấu cách), bản vẽ ghi `••••1234`. Lý do: một kiểu che cho cả D16 và D18.
- Bản vẽ có dòng "Trạng thái đơn" trong phần chi tiết: bỏ. Phần chi tiết chỉ hiện những gì lưu lúc ghi (trường đổi, thời điểm, người làm, thiết bị); đọc trạng thái **hiện tại** của chứng từ sẽ làm nhật ký "đổi" theo thời gian.
- Số trên bản vẽ (196, 84, 112…) là số mẫu.

### D2. Bảng `activity_log` chỉ ghi thêm (điểm cần chốt 1)

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | `bigint` identity | PK |
| `created_at` | `timestamptz` | not null; giờ server do `logActivity` truyền vào (cùng giá trị dùng để tính cờ Ngoài giờ) |
| `user_id` | `text` | not null, FK `user(id)` `ON DELETE RESTRICT` |
| `role` | `text` | not null, CHECK trong 5 vai trò: vai trò **lúc làm** |
| `device` | `text` | not null, CHECK `DESKTOP`, `MOBILE` |
| `browser` | `text` | not null, CHECK `EDGE`, `CHROME`, `COCCOC`, `SAFARI`, `FIREFOX`, `OTHER` |
| `action` | `text` | not null, CHECK theo D3 |
| `document_type` | `text` | CHECK theo D3; null **chỉ khi** `action = 'SIGN_IN'` |
| `document_id` | `text` | id của bản ghi (uuid / id người dùng), **không FK** |
| `document_code` | `text` | mã hiện ra (`PO-2026-055`, `GG-K17`, `NCC-0004`, `BAI-01`, `thuha`); null với đăng nhập, giá sắt vụn |
| `summary` | `text` | not null, 1..300 ký tự |
| `changes` | `jsonb` | not null, mặc định `[]`, CHECK là mảng; phần tử `{field, label, before, after}`, `before`/`after` là chuỗi hiển thị hoặc null |
| `flags` | `text[]` | not null, mặc định `{}`, CHECK `flags <@ ARRAY['OFF_HOURS','SENSITIVE','ANOMALY']` |

Trigger viết tay trong migration, cùng khuôn với sổ kho: `activity_log_append_only()` chặn `UPDATE`/`DELETE` (mỗi dòng) và `TRUNCATE` ("Nhật ký thao tác chỉ ghi thêm", `P0001`); TRUNCATE chỉ qua khi `inventory_truncate_allowed(current_database(), current_setting('inventory.allow_truncate', true))`. Dùng lại cờ phiên của sổ kho để helper dọn DB test không phải đổi.

Vì sao `document_id` không có FK: nháp bị xóa (đơn nháp, phiếu sửa nháp) vẫn phải giữ dòng "Xóa nháp"; FK `CASCADE` sẽ xóa nhật ký (trigger chặn → không xóa được nháp), FK `RESTRICT` sẽ cấm xóa nháp. Mã chứng từ lưu sẵn nên không cần join để hiện.

Vì sao chỉ lưu `device` + `browser`, không lưu cả chuỗi User-Agent: D18 chỉ cần hai thứ này; chuỗi đầy đủ dài (~200 byte/dòng), gần như là dấu vân tay thiết bị, ít giá trị cho Giám đốc. Bảng `session` của Better Auth đã giữ User-Agent nếu cần tra sâu.

**Người dùng có nhật ký không xóa được nữa** (review PR #62). `user_id` là FK `RESTRICT` và trigger chặn xóa nhật ký, nên một tài khoản đã từng đăng nhập hay làm gì đó không bao giờ xóa được (ứng dụng vốn không có lệnh xóa người dùng, chỉ khóa). Chỗ duy nhất đang xóa người dùng là E2E global setup (tài khoản tạm `e2etmp*` của `auth.spec.ts`, các tài khoản này đăng nhập và đổi mật khẩu nên có dòng `SIGN_IN`, `UPDATE`). Cách xử lý ở D13. **Không** đổi FK sang `CASCADE`/`SET NULL`: mất dấu người làm, và trigger chặn xóa nhật ký thì `CASCADE` đằng nào cũng lỗi.

**Phương án đã cân nhắc:**

| Phương án | Vì sao không chọn |
|---|---|
| Trigger DB tự ghi nhật ký trên mọi bảng | Trigger không biết vai trò, thiết bị, không viết được tóm tắt tiếng Việt, không biết "xác nhận bất thường"; ghi cả cột kỹ thuật (`updated_at`) thành "sửa" giả |
| Gộp vào `purchase_order_event` và tạo bảng event cho từng loại | Không có chỗ xem chung, lọc theo người phải UNION nhiều bảng |
| Ghi ra file log / dịch vụ ngoài | Không cùng transaction, sửa xóa được ở máy chủ, khó lọc trên D18 |

### D3. Thao tác, nhóm thao tác, loại chứng từ

**Thao tác** (`action`): `CREATE`, `UPDATE`, `SUBMIT`, `APPROVE`, `POST`, `RETURN`, `CANCEL`, `CLOSE`, `DELETE_DRAFT`, `DELETE`, `SIGN_IN`.

Thêm hai cái so với issue:

- `CLOSE` "Đóng đơn": đóng đơn thu mua sớm (hàng không về nữa) khác "Hủy" về nghĩa và đã có lịch sử riêng `CLOSED`. Gộp vào `CANCEL` sẽ làm Giám đốc hiểu nhầm.
- `DELETE` "Xóa": xóa hẳn bản ghi danh mục chưa ai dùng (vật tư, đối tác…). Không phải nháp nên không gọi `DELETE_DRAFT`.

**Nhãn và nhóm** (hằng số ở `src/domain/activity.ts`, D18 lọc theo nhóm, ô tóm tắt đếm theo nhóm):

| Nhóm (lọc) | Thao tác (nhãn) | Ô tóm tắt |
|---|---|---|
| Tạo | `CREATE` Tạo | – |
| Sửa | `UPDATE` Sửa | Sửa, xóa, trả lại |
| Duyệt, ghi sổ | `SUBMIT` Gửi duyệt / Đặt đơn, `APPROVE` Duyệt, `POST` Ghi sổ | Duyệt, ghi sổ = `APPROVE` + `POST` |
| Trả lại, hủy, xóa | `RETURN` Trả lại, `CANCEL` Hủy, `CLOSE` Đóng đơn, `DELETE_DRAFT` Xóa nháp, `DELETE` Xóa | Sửa, xóa, trả lại |
| Đăng nhập | `SIGN_IN` Đăng nhập | – |

`SUBMIT` nằm nhóm "Duyệt, ghi sổ" để lọc ra cả luồng duyệt, nhưng **không** tính vào ô "Duyệt, ghi sổ" (ô đó là "đã đổi sổ kho" theo bản vẽ). Nhãn `SUBMIT` là "Đặt đơn" với đơn thu mua, "Gửi duyệt" với chứng từ khác.

**Loại chứng từ** (`document_type`): `PURCHASE_ORDER` Đơn thu mua, `GOODS_RECEIPT` Phiếu nhập, `REPAIR_ORDER` Phiếu sửa chữa, `STOCKTAKE` Kiểm kê, `STOCK_ADJUSTMENT` Phiếu điều chỉnh, `OPENING_BALANCE` Tồn đầu kỳ, `ITEM` Vật tư, `ITEM_GROUP` Nhóm hàng, `KIT` Bộ, `SUPPLIER` Nhà cung cấp, `CUSTOMER` Nhà thầu, `SITE` Công trình, `LOCATION` Kho/bãi/xưởng, `USER` Người dùng, `SCRAP_PRICE` Giá sắt vụn.

**Bảng nối service → thao tác** (đầy đủ, dùng cho task và test D5):

| Service | Hàm → thao tác |
|---|---|
| `purchasing/orders` | `createOrder` → `CREATE` (+ `SUBMIT` nếu `place`), `updateOrder` → `UPDATE`, `placeOrder` → `SUBMIT`, `cancelOrder` → `CANCEL`, `closeOrder` → `CLOSE`, `deleteOrder` → `DELETE_DRAFT` |
| `receiving/post` | `postReceipt` → `POST` (doc = phiếu nhập; tóm tắt có mã đơn) |
| `receiving/scrap-price` | `setScrapPrice` → `UPDATE` |
| `repairs/orders` | `createRepairDraft` → `CREATE`, `updateRepairDraft` → `UPDATE`, `deleteRepairDraft` → `DELETE_DRAFT`, `postRepairOrder` → `POST` |
| `stocktakes/sessions` | `startStocktake` → `CREATE`, `submitStocktake` → `SUBMIT`, `approveStocktake` → `APPROVE`, `requestRecount` → `RETURN` ("Yêu cầu đếm lại 2 dòng"), `returnStocktake` → `RETURN`, `cancelStocktake` → `CANCEL` |
| `inventory/adjustments` | `createAdjustment` → `CREATE`, `updateAdjustment` → `UPDATE`, `deleteAdjustment` → `DELETE_DRAFT`, `submitAdjustment` → `SUBMIT`, `approveAdjustment` → `APPROVE`, `returnAdjustment` → `RETURN` (loại `STOCK_ADJUSTMENT` hoặc `OPENING_BALANCE` theo `kind`) |
| `catalog/{items,item-groups,kits,partners,places}` | `create*` → `CREATE`, `update*` → `UPDATE` (cả đổi trạng thái), `delete*` → `DELETE` |
| `users/service` | `createUser` → `CREATE`; `changeRole`, `lockUser`, `unlockUser`, `resetPassword` → `UPDATE` + `SENSITIVE` |
| `auth/change-password` | `changePassword` → `UPDATE` "Đổi mật khẩu" (doc = chính người đó) |
| `auth/sign-in` | `signIn` thành công → `SIGN_IN` |

Gửi lại cùng `client_draft_id` / `submissionId` (trả kết quả cũ, không ghi gì mới) thì **không** ghi thêm dòng: chỉ ghi ở nhánh thật sự ghi dữ liệu.

### D4. Hàm chung `logActivity(tx, …)` và người làm (điểm cần chốt 2)

```ts
// src/lib/activity/log.ts
logActivity(tx: Tx, actor: ActivityActor, entry: {
  action: ActivityAction;
  document?: { type: DocumentType; id: string; code: string | null };
  summary: string;
  changes?: readonly FieldChange[];
  anomaly?: boolean;      // D8
  sensitive?: boolean;    // D8 (ngoài các trường nhạy cảm tự nhận)
}, options?: { now?: Date; workingHours?: WorkingHours }): Promise<void>
```

- Luôn nhận `tx` (không nhận `db`) nên **không thể** gọi ngoài transaction của thao tác. Kiểu `Tx` có sẵn trong service.
- Một câu `INSERT`. Lỗi thì ném ra, transaction của thao tác rollback.
- Tính cờ `OFF_HOURS` từ `now` (D8), `SENSITIVE` từ `sensitive`, `ANOMALY` từ `anomaly`. Service đặt `sensitive: touchesSensitive(spec, changes)` khi sửa CCCD / STK (D7).
- Cắt tóm tắt quá 300 ký tự thành 299 + "…"; quá 50 trường đổi thì gộp (D6).
- Sửa có `changes` rỗng (D6) thì **không ghi** và trả về luôn; service không cần tự kiểm.

**Người làm** `ActivityActor = { id, role, device, browser }`:

- `withAuth` thêm `actor` vào `GuardedContext`, dựng từ `user` (vai trò đọc từ DB mỗi yêu cầu) và `request.headers.get("user-agent")` qua `detectDevice` + `detectBrowser` (hàm thuần mới, `src/domain/activity.ts`). Route truyền `actor` cho service thay cho `user`.
- `Actor` trong `src/lib/catalog/common.ts` đổi thành `ActivityActor`; mọi hàm ghi (kể cả `delete*`, `updateRepairDraft`, `updateAdjustment`, `requestRecount` đang bỏ qua `_actor`) nhận `actor`. TypeScript bắt mọi chỗ gọi thiếu.
- Seed và test dựng actor bằng helper `systemActor(user, { device: "DESKTOP", browser: "OTHER" })`.

**Đăng nhập và đổi mật khẩu** (Better Auth tự ghi mật khẩu / phiên ở kết nối riêng):

- `signIn`: sau khi mật khẩu đúng và tài khoản Đang dùng, gộp `recordLastLogin` + `logActivity(SIGN_IN)` vào **một** transaction. Nếu transaction này lỗi thì xóa phiên vừa tạo và trả lỗi, để không có phiên đăng nhập mà không có nhật ký. Nhánh này có integration test riêng (giả lập `logActivity` lỗi → không còn phiên của lần đăng nhập đó, trả 500).
- `changePassword`, `createUser`, `resetPassword`: đã có transaction riêng của app; `logActivity` vào đúng transaction đó.

**Phương án đã cân nhắc:**

| Phương án | Vì sao không chọn |
|---|---|
| Ghi nhật ký ở route handler sau khi service xong | Không cùng transaction: service lưu xong, ghi nhật ký lỗi thì mất dấu; lại phải đọc trước/sau lần nữa |
| Middleware Drizzle bắt mọi câu INSERT/UPDATE | Không biết nghĩa nghiệp vụ, như trigger DB (D2) |
| `AsyncLocalStorage` mang người làm thay vì truyền `actor` | Ẩn phụ thuộc, test khó; truyền tham số thì TypeScript bắt chỗ thiếu |

### D5. Test bắt service quên ghi nhật ký (điểm cần chốt 2)

Hai lớp, như `route-guards.test.ts`:

1. **Test tĩnh** `src/lib/activity/coverage.test.ts` (unit, không cần DB): đọc mọi file `src/lib/**/*.ts` (bỏ `*.test.ts`, `sample.ts`, `seed.ts`, `e2e-accounts.ts`, `first-director.ts`, `src/lib/activity/**`), dùng `typescript` (đã có trong devDependencies) dựng AST, lấy mọi hàm / hằng hàm **được export** có tên khớp `/^(create|update|delete|place|cancel|close|post|set|submit|approve|return|request|start|reset|unlock|lock|change|sign)/`. Với mỗi hàm, đi theo các lời gọi tới hàm khác **trong cùng file** (bắc cầu, như `endOrder`, `placeLocked`) và yêu cầu gặp lời gọi `logActivity(`. Có một danh sách ngoại lệ ghi rõ lý do (VD hàm thuần không ghi DB); danh sách ngoại lệ có test riêng để mỗi tên trong đó vẫn tồn tại. Test cũng kiểm số hàm tìm được ≥ 50 để biết nó không quét rỗng.
2. **Integration test theo bảng D3**: mỗi file `*.int.test.ts` của service thêm kiểm "một dòng nhật ký đúng thao tác, đúng mã" cho từng hàm ghi (dùng helper `lastActivity(db, code)`). Bảng D3 là checklist trong tasks.

Lý do: lớp 1 bắt chỗ quên ngay cả khi người viết quên test; lớp 2 bắt gọi sai thao tác, sai mã, gọi ngoài nhánh ghi.

**Phương án đã cân nhắc:** chỉ regex trên file (như route guard) — không nhận ra hàm export gọi qua hàm phụ (`cancelOrder` → `endOrder`), sai nhiều; chỉ integration test — người thêm hàm ghi mới quên test là lọt.

### D6. Trường đổi và tóm tắt (điểm cần chốt 5)

Hàm thuần `diffFields(spec, before, after)` ở `src/domain/activity-changes.ts` (cùng `diffLines`, `withTotal`, `capChanges`, `touchesSensitive`):

- `spec` là danh sách trường của một loại chứng từ: `{ field, label, format(value) → string | null, sensitive?: "ID_NUMBER" | "BANK_ACCOUNT" }`. Mỗi loại chứng từ khai một `spec` (VD `SUPPLIER_FIELDS`, `PURCHASE_ORDER_FIELDS`) ở `src/lib/activity/fields.ts`, dùng lại `formatMoney`, `formatPhone`, `formatBusinessDate`, nhãn tình trạng.
- So **sau khi format**: hai giá trị hiện ra giống nhau là không đổi (VD `0903123456` và `0903 123 456`). Kết quả chỉ chứa trường khác nhau.
- **Dòng hàng** (đơn thu mua, phiếu sửa, phiếu điều chỉnh, thành phần bộ): khóa theo mã hàng (+ tình trạng nếu có). Dòng thêm: `label = "Dòng PK-KU"`, `before = null` (hiện "–"); dòng bỏ: `after = null`; dòng đổi: từng cột ("Đơn giá GG-K17", "Số lượng GG-K17"). Tổng tiền của chứng từ (nếu có) là một trường suy ra ("Tổng tiền hàng của đơn"), chỉ thêm khi có trường khác đổi.
- Quá 50 trường: giữ 49 đầu, thêm `{ field: "_more", label: "Và 12 thay đổi khác" }`.
- `updated_at`, `updated_by`, id kỹ thuật không bao giờ vào `spec`.

Service sửa đọc bản ghi `FOR UPDATE` trước khi ghi (đã có), dựng `before`, ghi, dựng `after` từ dữ liệu đã kiểm, gọi `logActivity` với `diffFields(...)`. Rỗng thì `logActivity` không ghi (D4).

**Tóm tắt** (cột Nội dung): mỗi service viết một câu ngắn bằng các hàm chung ở `src/domain/activity-summary.ts` (`changeSummary`, `joinParts`, `reasonSummary`, `clampSummary`; có unit test); câu riêng của từng chứng từ nằm cạnh service (`src/lib/{purchasing,repairs,inventory}/activity.ts`) và được kiểm bằng integration test, VD:

- Sửa: tối đa 2 trường đầu "Đơn giá GG-K17: 190.000 ₫ → 185.000 ₫", còn nữa thì "… và 3 thay đổi khác".
- Tạo đơn: "Hòa Phát mẫu · 5 mã hàng · 52.942.500 ₫". Ghi sổ phiếu nhập: "Nhận 80 khung 1,7m, 50 kích U · đã xác nhận nhận dư". Duyệt kiểm kê: "Ghi sổ 5 dòng điều chỉnh · −2.788.056 ₫". Trả lại: `Lý do: "Ghi rõ số phiếu thu hồi"`.

**Phương án đã cân nhắc:** lưu cả bản ghi trước và sau (snapshot jsonb) — to gấp nhiều lần, chứa cả CCCD/STK chưa che, D18 vẫn phải tự so; lưu giá trị thô (số, id) thay vì chuỗi hiển thị — nhật ký đổi nghĩa khi tên vật tư, nhãn, cách viết tiền đổi về sau; nhật ký phải giữ đúng cái người dùng thấy lúc đó.

### D7. Dữ liệu nhạy cảm (điểm cần chốt 3)

- Trường có `sensitive` trong `spec` được `diffFields` che **trước** khi so và trước khi trả về: CCCD qua `maskIdNumber`, số tài khoản qua `maskBankAccount`. Giá trị gốc không bao giờ ra khỏi hàm. Nếu hai số khác nhau nhưng trùng 4 số cuối thì vẫn ghi một trường đổi "Số tài khoản: •••• 5678 → •••• 5678 (đã đổi)" để không mất dấu.
- Mật khẩu, mật khẩu tạm, token phiên **không có trong `spec` nào**; `resetPassword`, `unlockUser`, `createUser`, `changePassword` chỉ ghi tóm tắt cố định ("Đặt lại mật khẩu cho thuha"). Test: chuỗi mật khẩu tạm không xuất hiện trong `JSON.stringify` của dòng nhật ký.
- Tóm tắt chỉ dùng giá trị đã qua `diffFields` hoặc hằng chữ, không ghép thẳng input.

### D8. Cờ (điểm cần chốt 4)

- **`OFF_HOURS`**: `src/domain/activity.ts` có `WORKING_HOURS = { start: "06:00", end: "21:00" }` (một chỗ, theo quy ước SaaS #33 (5)) và hàm thuần `isOffHours(at: Date, hours: WorkingHours): boolean`: đổi `at` sang giờ `Asia/Ho_Chi_Minh` (Intl, như `business-date.ts`), so theo phút + giây; **giờ làm việc là [06:00:00, 21:00:00)**: 05:59:59 và 21:00:00 là ngoài giờ, 06:00:00 và 20:59:59 là trong giờ. `logActivity` nhận `workingHours` làm tham số, mặc định `WORKING_HOURS`. Lý do chọn 21:00:00 là ngoài giờ: "sau 21:00" theo cách nói thường bao gồm 21:00 đúng; đặt biên nửa mở để không có khe hở hay trùng.
- **`SENSITIVE`**: bật khi service truyền `sensitive: true`: sửa CCCD / STK (`touchesSensitive`), đổi vai trò, khóa, mở khóa, đặt lại mật khẩu. Thêm "đặt lại mật khẩu" so với issue vì đó là cách chiếm tài khoản người khác dễ nhất.
- **`ANOMALY`**: service truyền `anomaly: true` khi:
  - `postReceipt` có `confirmedOverrides` không rỗng (0.2 #30),
  - `postRepairOrder` có câu hỏi chi phí cao đã xác nhận (0.2 #23),
  - `approveStocktake` khi phiên có ít nhất một dòng có cờ (`MOVED`, `OVER_PCT`, `CONDITION_SWAP`).
- Cờ tính **lúc ghi** và lưu trong `flags`; đổi `WORKING_HOURS` về sau không đổi các dòng cũ (nhật ký giữ đúng đánh giá lúc đó).

**Phương án đã cân nhắc:** tính `OFF_HOURS` lúc đọc thay vì lưu — đổi giờ làm việc thì nhật ký cũ đổi theo, và lọc "Chỉ cần xem kỹ" phải tính trên mọi dòng, không dùng index được.

### D9. Đọc, lọc, phân trang, index (điểm cần chốt 6)

**API** (đều `withAuth({ permission: "activity.view" })`, chỉ `GET`):

| Route | Input (query) | Output |
|---|---|---|
| `GET /api/activity` | `from`, `to` (`YYYY-MM-DD`, mặc định 7 ngày gần nhất tính cả hôm nay), `user` (id), `type`, `code`, `group` (`CREATE`, `UPDATE`, `APPROVAL`, `REVERSAL`, `SIGN_IN`), `review=1`, `cursor` | `{ rows: ActivityRow[], days: {date, count}[], summary: {total, people, mobile, approvals, edits, review}, total, nextCursor \| null }` |
| `GET /api/activity/export` | như trên (không `cursor`) | tệp `.xlsx` hoặc 422 khi quá 10.000 dòng |

- Kiểm input bằng zod; khoảng ngày tối đa 366 ngày; `from > to` → 400 "Từ ngày phải trước hoặc bằng đến ngày". `code` so khớp đúng mã (không phân biệt hoa thường), không `LIKE`.
- Khoảng ngày theo giờ VN: `created_at >= from 00:00 VN` và `< (to + 1) 00:00 VN`, đổi sang UTC ở server.
- **Con trỏ keyset**: sắp `created_at DESC, id DESC`, 50 dòng/trang. `cursor` = base64url của `{ at, id, maxId }`. Trang đầu chốt `maxId` = id lớn nhất khớp bộ lọc; mọi trang sau và các số đếm lọc thêm `id <= maxId`, nên dòng mới ghi trong lúc xem không chen vào và "N / M" không nhảy. Tải lại trang mới thấy dòng mới.
- `summary`, `days` (đếm theo ngày VN) chỉ tính ở trang đầu, một câu `SELECT count(*) FILTER (...)` và một câu `GROUP BY` ngày.
- Trang `/settings/activity` là server component: `requirePermission("activity.view")`, `await connection()` (dùng giờ hiện tại cho mặc định), đọc `searchParams`, gọi thẳng `src/lib/activity/queries.ts`; bộ lọc ghi vào URL. "Xem thêm" là client component gọi `GET /api/activity?cursor=…`. Ô ngày dùng `DateInput`.

**Index** (đủ cho bộ lọc D18 ở quy mô D11):

- `activity_log_created_idx (created_at DESC, id DESC)`: mặc định 7 ngày, phân trang.
- `activity_log_user_idx (user_id, created_at DESC, id DESC)`: lọc người làm.
- `activity_log_document_idx (document_code)`: lọc mã chứng từ.
- `activity_log_review_idx (created_at DESC, id DESC) WHERE flags <> '{}'`: "Chỉ cần xem kỹ".

Không index riêng `document_type`, `action`: lọc trên kết quả của khoảng ngày (vài nghìn dòng) đủ nhanh.

### D10. Xuất Excel không thêm thư viện (điểm cần chốt 7)

**Chọn:** làm trong MVP. `src/lib/export/xlsx.ts`: hàm thuần `buildXlsx({ sheetName, columns, rows }) → Uint8Array`, tự ghép các phần tối thiểu của tệp `.xlsx` (`[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/styles.xml` cho dòng tiêu đề đậm và ô xuống dòng, `xl/worksheets/sheet1.xml` với ô `inlineStr`) và đóng gói ZIP bằng `node:zlib` (`deflateRawSync`, `crc32`, có từ Node 22.2; dự án dùng Node 24). Khoảng 150 dòng, có unit test, dùng lại được cho Công nợ (D14) sau này.

- Mọi ô là chuỗi `inlineStr`: Excel không chạy công thức nên ô bắt đầu bằng `=`, `+`, `-`, `@` không thành công thức (chống chèn công thức). Ký tự XML không hợp lệ bị bỏ, `& < > "` được escape.
- Giới hạn **10.000 dòng**: đếm trước; quá thì 422 với "Có 12.345 thao tác, quá 10.000 dòng. Thu hẹp khoảng ngày hoặc bộ lọc". Không xuất một phần (dễ hiểu nhầm là đủ). 10.000 dòng ~4 MB XML, nén còn < 1 MB, tạo trong bộ nhớ dưới 1 giây.
- Trả `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="nhat-ky-2026-10-27-2026-10-28.xlsx"`, `Cache-Control: no-store`.

**Phương án đã cân nhắc:**

| Phương án | Vì sao không chọn |
|---|---|
| CSV UTF-8 có BOM | Rẻ nhất, nhưng Excel trên một số máy đọc sai dấu phân cách (máy cài kiểu số Việt Nam dùng `;`), cột Thay đổi nhiều dòng dễ vỡ; người dùng yêu cầu "Excel" |
| Thêm `exceljs` / SheetJS | Phải hỏi trước khi thêm thư viện; nặng (~1 MB) cho một bảng chữ; SheetJS bản npm cũ có lỗ hổng đã biết |
| Để Bản 2 | Issue đã chốt làm trong MVP (PR #57) |

Nếu khi review muốn thư viện thì chỉ thay phần trong `buildXlsx`, API không đổi.

### D11. Quyền, thời gian lưu, dung lượng (điểm cần chốt 8)

- Quyền mới `activity.view: ["DIRECTOR"]` trong `src/domain/permissions.ts`. Không có quyền ghi / xóa nhật ký: chỉ service ghi qua `logActivity`, không có route nào `POST`/`PATCH`/`DELETE` (Next.js trả 405).
- **Giữ mãi ở MVP**, không xóa tự động. Ghi `docs/requirements.md` 0.2 #34.
- **Ước lượng**: 5–10 người, bản vẽ ~100 thao tác/ngày; tính dư **300 thao tác/ngày × 365 ≈ 110.000 dòng/năm**. Mỗi dòng ~600 byte (tóm tắt + `changes` vài trường) + ~400 byte 4 index ≈ **1 KB/dòng → ~110 MB/năm, ~1,1 GB sau 10 năm**. PostgreSQL xử lý tốt; truy vấn 7 ngày chỉ chạm ~2.000 dòng qua index. Khi nào bảng quá 5 triệu dòng mới cần chia bảng theo năm (change riêng).
- Dữ liệu nhật ký nằm trong DB của công ty (0.2 #33), không cache ở biến cấp module.

### D12. Không backfill (điểm cần chốt 9)

**Chọn: không backfill.** Lý do: app chưa chạy thật, DB hiện chỉ có dữ liệu dev / seed / E2E; dữ liệu thật vào bằng `data-migration` (#48) **sau** change này, nên mọi thao tác thật đều có nhật ký từ đầu.

Đã cân nhắc backfill rẻ từ `purchase_order_event` + `created_by`/`created_at` của các bảng: không có vai trò lúc làm, thiết bị, trước → sau; các dòng như vậy làm nhật ký có hai loại dữ liệu khác chất lượng. Không đáng.

### D13. Dữ liệu mẫu, E2E và ảnh mốc

- `src/lib/activity/sample.ts`: nhật ký mẫu như D18 (11 dòng, ngày 27–28/10/2026, 5 tài khoản mẫu), ghi qua `logActivity` với `now` cố định. Chỉ chạy trong `npm run db:seed:dev` và E2E global setup, **một lần** (bỏ qua nếu đã có dòng của tài khoản mẫu trong ngày 28/10/2026). Mã chứng từ trỏ tới chứng từ mẫu có thật nếu seed có; tóm tắt ghi đúng như bản vẽ.
- Ảnh mốc D18 mở `/settings/activity?from=2026-10-27&to=2026-10-28` lọc các tài khoản mẫu, nên số không đổi theo ngày chạy CI; dòng do E2E tạo (ngày chạy) nằm ngoài khoảng đó.
- E2E chức năng kiểm theo **chênh lệch** (nhật ký không xóa được, như sổ kho): đếm dòng trước, làm thao tác, đếm sau.
- **Tài khoản tạm E2E** (`e2etmp*`, review PR #62). Global setup đổi từ "xóa hết" sang: **xóa** tài khoản tạm **chưa có** dòng nhật ký nào (phiên, `account` đi theo `CASCADE` như hiện nay); **khóa** phần còn lại (`status = 'LOCKED'`, xóa phiên của chúng) bằng SQL trực tiếp. Lý do chọn cách này thay vì khóa tất cả: tài khoản tạm chưa đăng nhập (VD test lỗi giữa chừng) vẫn được dọn, DB dev ít rác hơn; tên tạm đã duy nhất theo thời gian (`tempUsername`) nên tài khoản cũ đã khóa không đụng tài khoản mới. Tài khoản tạm đã khóa ở lại DB dev (D17 hiện chúng ở nhóm Đã khóa; không có ảnh mốc D17 đếm người dùng). Trên CI DB mới mỗi lần nên không tích lại.
- **Các chỗ dọn khác của global setup** (`removeTestOrders`, `removeTestRepairDrafts`, `removeTestCatalogRows`) xóa thẳng bằng SQL: không đi qua service nên **không ghi nhật ký**, và `document_id` không có FK nên dòng nhật ký cũ của các bản ghi đó (VD "Tạo `PO-2026-0xx`" do E2E làm) **không chặn** việc xóa; dòng nhật ký ở lại DB dev, trỏ tới mã đã mất, đúng như "Xóa nháp". Các bước global setup gọi service (`cancelTestStocktakes`, `setScrapPrice`, `ensure*Stock`, seed) ghi nhật ký bình thường với `systemActor` của `e2e.giamdoc` (thiết bị Máy tính · Khác).
- `seedAccounts` với `reset: true` chỉ **sửa** tài khoản `e2e.*` (mật khẩu, trạng thái), không xóa, nên không vướng FK.

## Risks / Trade-offs

- **Sửa nhiều service một lúc** (khoảng 50 hàm) → dễ sót, dễ sai thao tác. Giảm: test tĩnh D5 + checklist bảng D3 trong tasks; mỗi nhóm service một task có integration test.
- **Đổi chữ ký hàm xóa** (thêm `actor`) → mọi route / test gọi phải sửa. TypeScript bắt hết; đổi cơ học.
- **Ghi nhật ký lỗi làm thao tác lỗi** → đúng ý (không có thao tác ngoài nhật ký), nhưng một lỗi CHECK trong nhật ký sẽ chặn nghiệp vụ. Giảm: `logActivity` chuẩn hóa (cắt tóm tắt, gộp trường) trước khi INSERT; unit test các biên.
- **Đăng nhập không cùng transaction với Better Auth** → hiếm khi có phiên mà ghi nhật ký lỗi; xử lý bằng xóa phiên (D4).
- **Bộ ghi `.xlsx` tự viết** có thể không mở được trên bản Excel cũ. Giảm: theo đúng phần tối thiểu của OOXML, unit test giải nén lại; kiểm tay mở bằng Excel và LibreOffice (theo dõi ở #33 nếu chưa làm).
- **Tóm tắt tiếng Việt viết tay ở nhiều service** → câu chữ không đều. Giảm: hàm thuần chung `activity-summary.ts`, unit test theo câu bản vẽ.

## Migration Plan

1. Migration kế tiếp (dự kiến `0008_activity_log.sql`): bảng, CHECK, index, trigger. Không đụng bảng cũ, không backfill.
2. Code nối service, quyền, trang, API cùng PR. Không có cờ bật/tắt: nhật ký luôn bật.
3. Quay lui: gỡ code; bảng nhật ký để lại (không xóa được bằng ứng dụng, đúng tính chất).

## Open Questions

- Không có. Các điểm "cần chốt" của issue #47 đã có đề xuất ở D2–D12; chờ duyệt ở PR.
