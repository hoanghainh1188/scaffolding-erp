# Design: auth-and-roles

## Context

- `getCurrentUser()` (`src/lib/current-user.ts`) đang trả người dùng giả lập theo `DEV_ROLE`; production ném `ConfigError`. Layout Desktop gọi hàm này để lọc menu và chuyển vai trò Mobile sang `/m`. Khu `/m` chưa đọc người dùng.
- `src/lib/navigation.ts` khai báo `roles` ngay trên từng mục menu. Chưa có kiểm tra quyền ở server.
- DB chưa có bảng nào (`drizzle/0000_init.sql` chỉ `SELECT 1`). Next 16 bật Cache Components: đọc `cookies()` làm phần đó render theo request và phải nằm trong `<Suspense>`. Next 16 dùng `src/proxy.ts` thay `middleware.ts`.
- Đã chốt ở requirements 0.5: đăng nhập bằng tên + mật khẩu, chỉ Giám đốc tạo tài khoản, mật khẩu tạm bắt đổi, Giám đốc đặt lại, ô "Giữ đăng nhập", mỗi người một vai trò, khóa chứ không xóa.
- Thiết kế đã duyệt: `docs/design/screens/Login.dc.html`, `docs/design/screens/D17-Users.dc.html` (vào `main` qua PR #2).

## Goals / Non-Goals

**Goals:**
- Đăng nhập thật, an toàn mức hợp lý cho công ty ~10 người, chạy trên 1 server.
- Một bảng quyền duy nhất, server luôn kiểm tra.
- Mọi quy tắc (khóa, đặt lại, Giám đốc cuối cùng, chống dò) có integration test chạy trên PostgreSQL thật.

**Non-Goals:**
- Như mục "Ngoài phạm vi" của proposal: khôi phục qua email/SMS, 2FA, nhiều vai trò, xóa tài khoản, nhật ký đăng nhập đầy đủ, CSP nonce.

## Decisions

### D1. Thời gian giữ đăng nhập (câu hỏi 1)

| Ô "Giữ đăng nhập trên máy này" | Cookie | Phiên ở server |
|---|---|---|
| **Có tick** | Có `Max-Age` 30 ngày | Hết hạn **30 ngày kể từ lần dùng gần nhất**; gia hạn tối đa 1 lần/ngày (`updateAge` 1 ngày) |
| **Không tick** | Cookie phiên (mất khi đóng trình duyệt) | Hết hạn **12 giờ kể từ lúc đăng nhập**, không gia hạn |

Lý do:
- Có tick dành cho **điện thoại thủ kho ngoài bãi** (0.5 #5): gõ mật khẩu trên điện thoại ngoài nắng, tay bẩn là phiền. 30 ngày trượt nghĩa là ai dùng hằng ngày gần như không phải đăng nhập lại; điện thoại bỏ không dùng 1 tháng thì tự hết. Mất điện thoại → Giám đốc khóa hoặc đặt lại mật khẩu là đăng xuất ngay (D5).
- Không tick dành cho **máy dùng chung ở văn phòng**: đóng trình duyệt là xong. Mốc 12 giờ (một ngày làm việc kể cả tăng ca) chặn trường hợp trình duyệt không bao giờ đóng hoặc trình duyệt khôi phục phiên cũ khi mở lại.
- Đã cân nhắc: 7 ngày cho có tick (mặc định Better Auth) — quá ngắn cho thủ kho, tuần nào cũng phải gõ lại; 90 ngày — quá dài nếu mất máy mà không ai báo.

Cách làm: bảng `session` thêm cột `persistent boolean`. Khi không tick, server tự đặt `expires_at = created_at + 12h`, và `getCurrentUser()` từ chối phiên `persistent = false` có `created_at + 12h < now` (không phụ thuộc cách thư viện gia hạn). Phiên tick dùng `session.expiresIn = 30 ngày`, `updateAge = 1 ngày` của Better Auth.

### D2. Quy tắc mật khẩu và mật khẩu tạm (câu hỏi 2)

**Mật khẩu người dùng tự đặt** (`src/domain/password.ts`, hàm thuần + unit test):
- Dài **8–128** ký tự (đếm theo ký tự Unicode). Cho phép khoảng trắng, chữ có dấu.
- **Không** bắt buộc chữ hoa / số / ký tự đặc biệt. Lý do: theo khuyến nghị NIST SP 800-63B, quy tắc phức tạp làm người dùng viết mật khẩu ra giấy dán máy; độ dài mới quan trọng. Thủ kho dễ nhớ một cụm như `bai sau kho`.
- Chặn: trùng tên đăng nhập, trùng mật khẩu hiện tại, nằm trong danh sách ~100 mật khẩu phổ biến (có cả kiểu Việt: `matkhau`, `matkhau123`, `12345678`, `123456789`, `abc12345`, `password`, `qwerty123`, `11111111`...). Danh sách nằm trong code, so sánh không phân biệt hoa thường.
- Đổi mật khẩu phải nhập mật khẩu hiện tại (kể cả khi đang dùng mật khẩu tạm).

**Mật khẩu tạm** (`src/domain/temp-password.ts`):
- Dạng `<từ>-<4 chữ số>`, ví dụ `giao-7342` như thiết kế D17. Từ lấy từ danh sách **256 từ tiếng Việt không dấu, 3–6 chữ, dễ đọc qua điện thoại** (`giao`, `kho`, `bai`, `khung`, `san`, `cot`...); bỏ từ dễ nhầm hoặc nhạy cảm. Chọn bằng `crypto.randomInt` (không dùng `Math.random`).
- Độ mạnh: 256 × 10.000 ≈ 2,56 triệu khả năng (~21 bit). Đủ vì: mật khẩu chỉ sống tới lần đăng nhập đầu, bị tạm khóa sau 5 lần sai (D3) và giới hạn theo IP. Đổi lại Giám đốc đọc được cho nhân viên qua điện thoại.
- **Chỉ hiện 1 lần**: server tạo khi tạo tài khoản / đặt lại / mở khóa, lưu **mã băm** (scrypt của Better Auth), trả chuỗi gốc đúng một lần trong response (`Cache-Control: no-store`). Không ghi log, không lưu ở đâu khác. Giao diện hiện trong hộp thoại kèm nút "Sao chép"; đóng là mất.
- Khác thiết kế: D17 vẽ mật khẩu tạm **trong form trước khi bấm "Tạo tài khoản"**. Ta hiện **sau khi tạo xong** (hộp thoại kết quả), vì nếu tạo sẵn ở trình duyệt thì mật khẩu đi qua mạng hai chiều và có thể bị tạo lại khi người dùng sửa form. Bố cục và chữ giữ như thiết kế.
- Cột `user.must_change_password = true` sau khi tạo/đặt lại/mở khóa; về `false` khi đổi thành công.

### D3. Chống dò mật khẩu (câu hỏi 3)

Hai lớp:

1. **Theo tên đăng nhập**: sai **5 lần liên tiếp trong 15 phút** → tạm khóa tên đó **15 phút** kể từ lần sai thứ 5. Trong lúc tạm khóa, mật khẩu đúng cũng bị từ chối. Đăng nhập đúng hoặc Giám đốc đặt lại mật khẩu → xóa bộ đếm. Đếm cả tên **không tồn tại** để không lộ tên nào có thật.
   - Bảng `login_throttle(username_key text PK, failed_count int, first_failed_at timestamptz, locked_until timestamptz null)`. `username_key` là tên đã chuẩn hóa (chữ thường, cắt khoảng trắng).
   - Logic quyết định là hàm thuần `evaluateLoginThrottle(state, now)` / `recordFailure(state, now)` trong `src/domain/login-throttle.ts` (unit test đủ mốc 4/5/6 lần, hết 15 phút, cửa sổ trượt). Ghi DB bằng một câu `INSERT ... ON CONFLICT DO UPDATE` để hai lần sai cùng lúc không mất đếm.
   - Lần sai đến khi tên đang bị khóa (nhiều yêu cầu gửi cùng lúc, lần thứ 5 đã khóa) **không đổi gì**: không gỡ, không kéo dài khóa. Tên sai định dạng D17 (không thể tồn tại) không được ghi vào bảng, để bảng không bị nhồi khóa rác. (Bổ sung sau security review.)
   - Lý do chọn 5 lần / 15 phút: người thật gõ nhầm 2–3 lần là thôi; 15 phút đủ làm việc dò chậm vô nghĩa (tối đa ~480 lần/ngày cho một tên, so với 2,56 triệu khả năng của mật khẩu tạm) mà thủ kho quên mật khẩu chỉ chờ một chút hoặc gọi Giám đốc. Không khóa vĩnh viễn để kẻ xấu không thể cố tình khóa tài khoản người khác lâu dài.
2. **Theo địa chỉ IP**: tối đa **20 yêu cầu đăng nhập / phút / IP** → 429. Chặn dò rải nhiều tên từ một máy. Bảng `auth_rate_limit(key text PK, window_start timestamptz, count int)`, cửa sổ cố định 60 giây, cập nhật nguyên tử. IP lấy từ phần tử **cuối** của `x-forwarded-for`: reverse proxy (nginx `$proxy_add_x_forwarded_for`) gắn địa chỉ thật vào cuối; chạy thẳng `next start` thì Next tự gắn địa chỉ socket khi header chưa có. Next không cho đọc địa chỉ socket ở route handler/server action, nên khi không có reverse proxy, người gửi có thể giả header này; production **phải** chạy sau reverse proxy (ghi trong README). Lớp chặn theo tên đăng nhập vẫn đứng vững dù IP bị giả. (Bản đầu của design có biến `TRUST_PROXY`; bỏ vì không thêm được gì.) 20 đủ rộng cho cả văn phòng chung một IP công cộng.

Đã cân nhắc: dùng `rateLimit` có sẵn của Better Auth — chỉ áp cho route HTTP của thư viện, không đếm theo tên đăng nhập và không có tạm khóa; ta vẫn bật nó (`storage: "database"`) cho các route còn lại của `/api/auth/*`.

### D4. Tài khoản Giám đốc đầu tiên (câu hỏi 4)

- Lệnh `npm run auth:create-director -- --username minhanh --name "Minh Anh"` (`scripts/create-director.mts`).
- Trong một transaction: khóa advisory `pg_advisory_xact_lock`, kiểm tra **chưa có Giám đốc ACTIVE nào**, tạo user + account, `must_change_password = true`. In mật khẩu tạm ra terminal **đúng 1 lần**. Đã có Giám đốc → báo và thoát mã 1, không tạo gì.
- Chạy được trên production (chỉ cần `DATABASE_URL`, `BETTER_AUTH_SECRET`). Đây cũng là đường **cứu hộ** khi mọi Giám đốc bị khóa do lỗi dữ liệu: người quản trị server sửa trạng thái trong DB rồi đặt lại — ghi trong README, không làm lệnh riêng.
- Đã cân nhắc: seed sẵn `admin/admin` trong migration — nguy hiểm nếu quên đổi; trang "cài đặt lần đầu" trên web — ai vào trước thì thành Giám đốc. Lệnh dòng lệnh đòi quyền vào server nên an toàn nhất.

### D5. Khóa / đặt lại mật khẩu đăng xuất ngay (câu hỏi 5)

- Khóa, đặt lại mật khẩu: **cùng transaction** đổi `user` + `account` (nếu đổi mật khẩu) + `DELETE FROM session WHERE user_id = $1` + xóa `login_throttle` (đặt lại).
- Người dùng tự đổi mật khẩu: xóa mọi phiên **trừ phiên hiện tại**.
- Để "ngay" là ngay thật: **tắt `session.cookieCache`** của Better Auth. Mỗi yêu cầu đọc phiên từ DB (một truy vấn theo khóa chính, ~1 ms với 10 người). Có cache cookie thì phiên đã xóa vẫn sống thêm tới 5 phút.
- `getCurrentUser()` kiểm tra thêm `user.status = 'ACTIVE'` (phòng hờ nếu có phiên sót).
- Phiên cũ gọi API → 401; mở trang → chuyển `/login`.

### D6. Bảo vệ Giám đốc (câu hỏi 6)

Hàm `src/lib/users/service.ts` cho khóa và đổi vai trò, mỗi lệnh một transaction (tạo tài khoản, đặt lại mật khẩu, mở khóa cũng làm bước 1–2, để Giám đốc vừa bị khóa hoặc hạ vai trò ở tab khác không thao tác tiếp được; bổ sung sau review PR #22):
1. `SELECT ... FROM "user" WHERE role = 'DIRECTOR' AND status = 'ACTIVE' ORDER BY id FOR UPDATE` — khóa mọi dòng Giám đốc đang dùng (cũng khóa dòng người yêu cầu).
2. Người yêu cầu phải nằm trong danh sách đó (còn là Giám đốc đang dùng). Không → 403.
3. Đích = người yêu cầu → 409 "Không thể tự khóa tài khoản của mình" / "Không thể tự đổi vai trò của mình".
4. Đích là Giám đốc và số Giám đốc đang dùng sau thay đổi = 0 → 409 "Phải còn ít nhất một Giám đốc đang dùng".
5. Ghi thay đổi.

Vì bước 1 khóa cùng một tập dòng theo cùng thứ tự, hai yêu cầu đồng thời chạy lần lượt; yêu cầu sau thấy trạng thái mới (người yêu cầu đã bị khóa → 403, hoặc chạm Giám đốc cuối → 409). Integration test chạy hai yêu cầu bằng `Promise.all` trên hai kết nối.

Đã cân nhắc: chỉ kiểm tra ở giao diện (ẩn nút) — không chặn được hai tab cùng lúc; ràng buộc trigger trong DB — khó báo lỗi tiếng Việt và khó test.

### D7. Bảng quyền dùng chung (câu hỏi 7)

`src/domain/permissions.ts` (thuần, không phụ thuộc Next):

```ts
const OFFICE = ["DIRECTOR", "ACCOUNTANT", "SALES"] as const;
export const PERMISSIONS = {
  "dashboard.view": OFFICE,
  "purchasing.view": OFFICE,
  "inventory.view": OFFICE,
  "repairs.view": OFFICE,
  "sales.view": OFFICE,
  "receivables.view": ["DIRECTOR", "ACCOUNTANT"],
  "reports.view": ["DIRECTOR"],
  "catalog.view": OFFICE,
  "settings.view": ["DIRECTOR"],
  "users.manage": ["DIRECTOR"],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;
export function can(role: Role, permission: Permission): boolean;
```

- `NavItem` đổi `roles` → `permission`; `navItemsForRole` lọc bằng `can()`. Kết quả menu giữ nguyên như spec `app-shell` hiện tại (test cũ vẫn đúng).
- Khu `/m` không có quyền riêng ở change này (mọi vai trò mở được, spec `app-shell`). Change sau thêm quyền như `goods-receipt.create`.
- Phía server (`src/lib/auth/guard.ts`):
  - `requireUser()` cho trang: chưa đăng nhập → `redirect("/login?next=...")`; đang dùng mật khẩu tạm → `redirect("/change-password")`.
  - `requirePermission(p)` cho trang: gọi `requireUser()`, sai quyền → `forbidden()` (bật `experimental.authInterrupts`, trang `src/app/forbidden.tsx`).
  - `withAuth(handler, { permission?, allowPendingPasswordChange? })` cho route handler: 401 / 403 bằng envelope `fail()`; kiểm tra header `Origin` khớp `BETTER_AUTH_URL` cho mọi phương thức ghi (chống CSRF).
- **Mỗi trang** gọi `requirePermission(...)`, không chỉ layout: App Router không chạy lại layout khi chuyển giữa các trang con, nên kiểm tra ở layout không đủ (theo tài liệu Next 16). Layout chỉ đọc người dùng để hiện header/menu.
- **Chờ kiểm tra phiên rồi mới trả trang** (thêm khi làm): layout `(desktop)`, `(mobile)/m` và trang `/login` đặt `export const instant = false`, không bọc `<Suspense>` quanh phần đọc phiên. Nhờ vậy chuyển `/login` là 307 thật và trang sai quyền là 403 thật; nếu phần đọc phiên nằm trong Suspense thì Next đã gửi mã 200 trước khi biết kết quả. `next.config.ts` đặt `experimental.instantInsights.validationLevel = "manual-warning"`: mọi màn đều cần đăng nhập nên không màn nào "chuyển trang tức thì" được. `getCurrentUser()` đọc `headers()` trước, không có cookie phiên thì trả `null` ngay (lúc build Next render thử trang với header rỗng), rồi `await connection()` trước khi so giờ.
- `src/proxy.ts`: chỉ kiểm tra **có cookie phiên hay không** (nhanh, không truy vấn DB) để chuyển sớm tới `/login` hoặc trả 401 cho `/api/*`. Với trang (không phải API), proxy gọi thêm `getSession` để **gia hạn cookie** phiên "Giữ đăng nhập" (tối đa 1 lần/ngày): Server Component không ghi được cookie nên việc gia hạn 30 ngày phải làm ở đây. Proxy cũng gắn header `x-erp-path` để trang biết đường quay lại sau khi đăng nhập. Đường công khai: `/login`, `/api/auth/*`, `/api/health`, `/manifest.webmanifest`, `/icons/*`, `/_next/*`, `/favicon.ico`. Kiểm tra thật vẫn ở server (bước trên).
- Một test quét: mọi `page.tsx` dưới `(desktop)` và `/settings/users` có gọi `requirePermission`; mọi `route.ts` dưới `src/app/api` (trừ `health`, `auth`) bọc `withAuth`. Quên là test đỏ.

### D8. Người dùng giả lập: bỏ hẳn (câu hỏi 8)

- Xóa `DEV_ROLE` khỏi `env.ts`, `.env.example`, CI. `getCurrentUser()` chỉ đọc phiên Better Auth, **không còn nhánh dev**.
- Lý do: giữ một "cửa sau" cho test là giữ một đường code có thể bật nhầm ở production (một biến env sai). Đăng nhập thật đủ rẻ để dùng ở mọi nơi.
- Thay thế:
  - **Dev**: `npm run db:seed:dev` tạo 5 tài khoản (`giamdoc`, `ketoan`, `kinhdoanh`, `thukho`, `xuong`) với mật khẩu từ biến `DEV_SEED_PASSWORD` (ghi trong `.env.example`), không bắt đổi mật khẩu. Lệnh từ chối chạy khi `NODE_ENV=production`.
  - **Integration test**: helper `src/test/auth.ts` — `createTestUser({ role, status?, mustChangePassword? })`, `signInAs(user)` trả header `Cookie` tạo bằng đúng hàm đăng nhập thật; `resetAuthTables()` xóa bảng giữa các test.
  - **E2E**: `tests/e2e/global-setup.ts` gọi hàm seed với mật khẩu `E2E_PASSWORD`, đăng nhập qua `/login` cho từng vai trò cần dùng và lưu `tests/e2e/.auth/<role>.json` (`storageState`, có trong `.gitignore`). Test cũ dùng trạng thái Giám đốc; test đổi vai trò chọn file khác thay cho `DEV_ROLE`.
- Đã cân nhắc: giữ người dùng giả lập khi `NODE_ENV=test` — E2E chạy `next dev` (`development`) nên vẫn phải mở cửa ở dev; và đường đăng nhập thật sẽ không được E2E đi qua.

### D9. "Đăng nhập gần nhất" và "Dùng trên" (câu hỏi 9)

- Thêm vào bảng `user`: `last_login_at timestamptz null`, `last_login_device text null CHECK (IN ('DESKTOP','MOBILE'))`. Ghi **chỉ khi đăng nhập thành công**, ngay sau khi tạo phiên.
- Loại thiết bị suy từ `User-Agent` bằng hàm thuần `detectDevice(ua)` (`src/domain/device.ts`): có `Mobi`, `Android`, `iPhone`, `iPod` → `MOBILE`; còn lại `DESKTOP`. iPad đời mới báo như máy Mac → hiện "Máy tính"; chấp nhận.
- Bảng `session` của Better Auth đã lưu `user_agent`, `ip_address` từng phiên — dùng để điều tra khi cần, không hiện ở D17.
- Hiển thị: "Hôm nay, HH:mm" / "Hôm qua, HH:mm" / "dd/MM/yyyy, HH:mm" theo ngày nghiệp vụ `Asia/Ho_Chi_Minh` (dùng `toBusinessDate`, `formatDateTime` có sẵn); null → "Chưa đăng nhập", cột thiết bị "—".
- Lý do lưu trên bảng `user` thay vì bảng nhật ký: D17 chỉ cần lần gần nhất; bảng nhật ký là "Ngoài phạm vi" (thêm sau không phá dữ liệu cũ).
- Ghi `last_login_*` là một câu UPDATE riêng sau khi Better Auth tạo phiên (thư viện tự quản transaction của nó). Đây là thông tin hiển thị, không phải dữ liệu nghiệp vụ; nếu UPDATE lỗi thì **ghi log lỗi phía server** và vẫn cho đăng nhập.

### D10. Better Auth: cấu hình và bảng dữ liệu

- `src/lib/auth/auth.ts`: `betterAuth({ database: drizzleAdapter(db, { provider: "pg", schema }), emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8, maxPasswordLength: 128 }, plugins: [username({ minUsernameLength: 3, maxUsernameLength: 32, usernameValidator }), nextCookies()], session: { expiresIn: 30 ngày, updateAge: 1 ngày, cookieCache: { enabled: false } }, user: { additionalFields: {...} }, rateLimit: { enabled: true, storage: "database" }, disabledPaths: [...] })`.
- **Email**: Better Auth bắt buộc cột `email` duy nhất. Ta đặt `email = "<username>@users.invalid"` (tên miền `.invalid` theo RFC 2606, không bao giờ gửi được thư), không hiện ở đâu.
- **Tắt đường HTTP không dùng** bằng `disabledPaths`: `/sign-up/email`, `/sign-in/email`, `/sign-in/username`, `/change-password`, `/forget-password`, `/reset-password`, `/update-user`, `/delete-user`, `/change-email`. Đăng nhập và đổi mật khẩu đi qua code của ta (D11) để luôn có chống dò và quy tắc mật khẩu. Task 2.1 kiểm chứng `auth.api.signInUsername` gọi từ server vẫn chạy khi đường HTTP bị tắt; nếu không, dùng `hooks.before` chặn theo `ctx.path`.
- Mật khẩu: dùng hàm băm của Better Auth (`(await auth.$context).password.hash/verify`, scrypt) cho cả tạo tài khoản, đặt lại, script — một kiểu băm duy nhất.

**Bảng (migration `drizzle/0001_auth.sql`, sinh bằng `db:generate` rồi xem lại tay):**

| Bảng | Cột chính | Ràng buộc |
|---|---|---|
| `user` | `id text PK`, `name text`, `username text`, `display_username text`, `email text`, `email_verified bool`, `role text`, `status text`, `must_change_password bool`, `last_login_at timestamptz`, `last_login_device text`, `created_at`, `updated_at` | `username` UNIQUE (chữ thường); `email` UNIQUE; `role` CHECK 5 vai trò; `status` CHECK (`ACTIVE`,`LOCKED`); index `(role, status)` |
| `session` | `id`, `token` UNIQUE, `user_id` FK → `user` ON DELETE CASCADE, `expires_at`, `ip_address`, `user_agent`, `persistent bool`, `created_at`, `updated_at` | index `user_id` |
| `account` | `id`, `user_id` FK, `provider_id` (`credential`), `account_id`, `password` (mã băm), ... | UNIQUE (`provider_id`, `account_id`) |
| `verification` | của Better Auth (chưa dùng, thư viện cần) | |
| `login_throttle` | xem D3 | PK `username_key` |
| `auth_rate_limit` | xem D3 | PK `key` |
| `rate_limit` | của Better Auth cho `/api/auth/*` | |

Không xóa dòng `user` bao giờ (0.5 #7); khóa chỉ đổi `status`.

### D11. API và trang

Mọi API dùng envelope `ok()` / `fail()`. Mã lỗi: 400 dữ liệu sai, 401 chưa đăng nhập, 403 sai quyền / chưa đổi mật khẩu tạm, 404 không thấy, 409 xung đột (trùng tên, tự khóa, Giám đốc cuối), 429 quá nhanh.

| Đường | Quyền | Input | Output |
|---|---|---|---|
| Server action `signIn` (form `/login`) | công khai | `{ username, password, remember: boolean, next? }` | thành công: đặt cookie, `redirect`; lỗi: `{ error }` tiếng Việt (D3 + spec `auth`) |
| `POST /api/auth/sign-out` (Better Auth) | đã đăng nhập | — | xóa phiên + cookie |
| `POST /api/me/password` | đã đăng nhập, cho phép khi đang dùng mật khẩu tạm | `{ currentPassword, newPassword, confirmPassword }` | `200 { data: null }` |
| `GET /api/users?role=` | `users.manage` | `role` tùy chọn | `{ users: UserRow[], counts: { ACTIVE, LOCKED, byRole } }` |
| `POST /api/users` | `users.manage` | `{ name, username, role }` | `201 { user, tempPassword }` |
| `PATCH /api/users/:id` | `users.manage` | `{ role }` | `{ user }` |
| `POST /api/users/:id/lock` | `users.manage` | — | `{ user }` |
| `POST /api/users/:id/unlock` | `users.manage` | — | `{ user, tempPassword }` |
| `POST /api/users/:id/reset-password` | `users.manage` | — | `{ user, tempPassword }` |

`UserRow = { id, name, username, role, status, lastLoginAt, lastLoginDevice }` — không bao giờ có mật khẩu. Input kiểm tra bằng `zod`. Response có `tempPassword` đặt `Cache-Control: no-store`.

Logic nằm ở `src/lib/auth/sign-in.ts`, `src/lib/auth/change-password.ts`, `src/lib/users/service.ts` (nhận `db`, `now`), route handler chỉ đọc input → gọi service → trả envelope. Integration test gọi cả service lẫn route handler (truyền `Request` có cookie).

**Trang:**
- `/login` (`src/app/login/page.tsx`, ngoài hai nhóm layout): bố cục 2 cột theo thiết kế ở ≥ 1024px, 1 cột ở điện thoại. Lỗi hiện trong vùng `role="alert"`. Tên đăng nhập có `autocomplete="username"`, `autocapitalize="none"`; mật khẩu `autocomplete="current-password"`.
- `/change-password`: thẻ giữa trang, 3 ô (hiện tại, mới, nhập lại), gợi ý "Ít nhất 8 ký tự. Một cụm từ dễ nhớ là tốt nhất".
- `/settings/users` (D17): bảng `DataTable`, nút lọc vai trò (URL `?role=`), khung "Thêm người dùng" bên phải như thiết kế (màn hẹp tự xuống dưới bảng, đúng như `D17-Users.dc.html`), menu thao tác mỗi dòng (Đổi vai trò, Đặt lại mật khẩu, Khóa / Mở khóa) — khóa và đặt lại có hộp thoại xác nhận. Dòng của chính mình không có Khóa / Đổi vai trò.
- `/settings`: vẫn là trang giữ chỗ, thêm liên kết "Người dùng".
- Header Desktop: `DropdownMenu` trên khu người dùng (Đổi mật khẩu, Đăng xuất). `/m/profile`: thông tin + 2 nút.
- Ô "Giữ đăng nhập trên máy này" mặc định **không tick** (an toàn cho máy chung); thủ kho tick một lần trên điện thoại của mình.

### D12. Env

- Thêm `BETTER_AUTH_SECRET` (bắt buộc, ≥ 32 ký tự; lỗi chỉ in tên biến), `BETTER_AUTH_URL` (URL, mặc định `http://localhost:3000` ngoài production; bắt buộc ở production), `DEV_SEED_PASSWORD` và `E2E_PASSWORD` (chỉ dev/test, ghi giá trị mẫu trong `.env.example`).
- Bỏ `DEV_ROLE`.

## Risks / Trade-offs

- **Better Auth đổi API giữa các bản** → ghim bản chính xác (`1.7.x` hiện tại), task 2.1 làm thử nhỏ trước khi viết tiếp; mọi chỗ gọi thư viện gom trong `src/lib/auth/`.
- **Đọc phiên từ DB mỗi yêu cầu** (tắt cookie cache) → thêm ~1 truy vấn/yêu cầu; với ~10 người là không đáng kể. Đổi lại khóa có hiệu lực tức thì.
- **Cache Components**: trang gọi `requirePermission` thành render theo request; phải bọc `<Suspense>` đúng chỗ, nếu không build báo lỗi "uncached data outside Suspense". Có sẵn mẫu trong layout Desktop.
- **`forbidden()` còn là tính năng thử nghiệm** của Next 16 → nếu có vấn đề, thay bằng component 403 tự render + `notFound`-style status; giữ trong `guard.ts` nên chỉ sửa một chỗ.
- **Mật khẩu tạm ~21 bit** → chấp nhận nhờ tạm khóa + giới hạn IP + bắt đổi ngay (D2, D3).
- **Khóa theo tên có thể bị dùng để quấy rối**: ai biết tên đăng nhập có thể cố tình sai 5 lần mỗi 15 phút để chặn người đó, kể cả Giám đốc duy nhất (Giám đốc không tự đặt lại được). Chấp nhận ở MVP vì app chạy nội bộ sau reverse proxy; nếu xảy ra, xem cách cứu hộ trong README. Hướng sửa sau: khóa theo (tên + IP) hoặc chờ tăng dần thay vì khóa cứng.
- **Mật khẩu tạm không hết hạn**: tài khoản tạo xong mà chưa đăng nhập giữ mật khẩu tạm mãi. Hướng sửa sau: mật khẩu tạm hết hạn sau 48 giờ.
- **Văn phòng chung một IP** → giới hạn 20/phút/IP có thể chặn nhầm khi cả văn phòng đăng nhập cùng phút đầu giờ; 10 người thì còn xa ngưỡng.
- **E2E và ảnh mốc**: header thêm menu người dùng (không đổi hình khi đóng) — ảnh mốc có thể phải cập nhật qua workflow CI.

## Migration Plan

1. Merge migration `0001_auth.sql` (chỉ thêm bảng, không đụng dữ liệu nghiệp vụ vì chưa có).
2. Trên mỗi môi trường: đặt `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` → `npm run db:migrate` → `npm run auth:create-director -- ...` → đưa mật khẩu tạm cho Giám đốc.
3. Dev: `npm run db:migrate && npm run db:seed:dev`, xóa `DEV_ROLE` khỏi `.env`.
4. Quay lui: revert code + `DROP` các bảng auth (chưa có bảng nghiệp vụ nào tham chiếu `user`).

## Open Questions

Đã chốt (27/10/2026, người dùng duyệt):

- **CSP theo nonce**: tách sang change riêng `security-headers`. Change này giữ 4 header bảo mật hiện có.
- **E2E trên bản production**: tách sang change riêng. Change này vẫn chạy E2E trên `next dev`.
