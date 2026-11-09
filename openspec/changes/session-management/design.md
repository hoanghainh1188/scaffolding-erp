# Design: session-management

## Context

Lý do làm: xem `proposal.md`. Hiện trạng trong code:

- Bảng `session` đã có `user_agent`, `ip_address`, `created_at`, `updated_at`, `expires_at`, `persistent`. Better Auth tự điền `user_agent` khi tạo phiên, kể cả ở bước nhập mã 2 lớp (truyền `headers` của yêu cầu).
- `cookieCache` đang tắt (`src/lib/auth/auth.ts`), nên xóa dòng `session` là phiên chết ở yêu cầu kế tiếp. Khóa tài khoản đã dựa vào điều này.
- `updateAge` = 1 ngày: Better Auth chỉ cập nhật `updated_at` khoảng một lần mỗi ngày.
- `changePassword` đã xóa mọi phiên khác; `lockUser` và `resetPassword` đã xóa mọi phiên của người đó.
- `deviceText(device, browser)`, `detectDevice`, `detectBrowser`, `formatLastLogin` đã có trong `src/domain/`.
- `coverage.test.ts` chỉ soi hàm có tên bắt đầu bằng các động từ ghi trong `WRITE_NAME` (`sign`, `lock`, ...). Không có `revoke`.

## Goals / Non-Goals

**Goals:**

- Dùng lại bảng và helper sẵn có, không migration, không thư viện mới.
- Mọi đăng xuất từ xa chạy trong một transaction với dòng nhật ký.
- Không để token ra khỏi server.

**Non-Goals:**

- Ghi "dùng lần cuối" chính xác từng phút.
- Theo dõi thiết bị qua nhiều lần đăng nhập. Ở đây "thiết bị" là một phiên; đăng nhập 2 lần trên cùng máy mà không đăng xuất thì có 2 dòng.

## Decisions

### D1. Đi qua code riêng, không mở route revoke của Better Auth (điểm cần chốt 1)

- **Chọn:** service riêng trong `src/lib/auth/sessions.ts`, xóa thẳng bảng `session`. `DISABLED_PATHS` giữ nguyên.
- **Lý do:** route `/revoke-session` nhận **token**, nên muốn dùng phải gửi token của mọi máy xuống trình duyệt. Nó cũng không đi qua `withAuth`, không ghi được `logActivity` trong cùng transaction, và không làm được phiên của người khác.
- **Đã cân nhắc:**
  - Mở `/revoke-session`, `/revoke-other-sessions`: lộ token, thiếu nhật ký.
  - Gọi `auth.api.revokeSession` phía server: vẫn phải đọc token, và không chung transaction với nhật ký.
  - Plugin `admin` của Better Auth: thêm nhiều route và quyền trùng với `src/domain/permissions.ts`.
- Dòng quyết định phụ: id gửi lên là `session.id`, không phải token. Mọi `SELECT` chọn cột tường minh, không có `token`.

### D2. Tên thiết bị suy từ `session.user_agent` (điểm cần chốt 2)

- **Chọn:** `deviceText(detectDevice(ua), detectBrowser(ua))`, ví dụ "Điện thoại · Chrome", đúng cách nhật ký D18 và cột "Dùng trên" của D17 đang hiện.
- **Lý do:** một cách đọc User-Agent duy nhất, không thêm thư viện, không lưu thêm dữ liệu.
- **Đã cân nhắc:**
  - Thêm hệ điều hành ("Chrome trên Windows"): tách được hai máy cùng trình duyệt, nhưng phải viết thêm bộ đọc UA, và UA của Chrome đã bị rút gọn. Dòng đã có giờ đăng nhập để phân biệt.
  - Để người dùng tự đặt tên máy: phải thêm cột và màn hình, không đáng ở quy mô này.
  - Hiện IP: dữ liệu cá nhân, người dùng không đọc được ý nghĩa, IP mạng di động đổi liên tục.

### D3. Đổi mật khẩu giữ nguyên hành vi (điểm cần chốt 3)

- **Chọn:** không đổi gì. Tự đổi mật khẩu vẫn đăng xuất mọi máy khác và giữ máy đang dùng (spec `auth`). Giám đốc đặt lại mật khẩu vẫn đăng xuất mọi máy.
- **Lý do:** đổi mật khẩu thường là vì nghi lộ; hành vi này đã có test.

### D4. Quyền (điểm cần chốt 4)

- **Chọn:**
  - Máy của chính mình: mọi người đã đăng nhập, không cần mục mới trong bảng quyền. Mọi câu lệnh `DELETE` đều lọc theo `user_id` của người gọi.
  - Máy của người khác: `users.manage` (chỉ `DIRECTOR`), qua `withAuth({ permission: "users.manage" })`.
  - Cờ Admin hệ thống chỉ dùng cho gỡ 2 lớp (0.2 #138), không mở rộng sang đây.
  - Phiên không phải của mình trả 404, giống phiên không tồn tại, để không lộ id nào có thật.
- **Đã cân nhắc:**
  - Thêm quyền `sessions.manage`: một mục quyền cho thứ ai cũng có, không giúp gì.
  - Bắt nhập lại mật khẩu trước khi đăng xuất từ xa: tác hại của thao tác thấp (chỉ phải đăng nhập lại) nên không đáng thêm một bước khi đang vội vì mất máy.
  - Giám đốc xem và chọn từng máy của nhân viên: lộ thói quen dùng máy của nhân viên, trong khi việc cần làm luôn là đăng xuất hết. Vì vậy D17 chỉ có một mục "Đăng xuất mọi máy".
- Trên D17, mục này ẩn ở dòng của chính Giám đốc và dòng Đã khóa (đã không còn phiên). API trên chính mình trả 409, người dùng vào `/sessions` để giữ lại máy đang dùng.

### D5. Nhật ký (điểm cần chốt 5)

- **Chọn:** `action: "UPDATE"`, `document` loại `USER` gắn với **chủ phiên**, `sensitive: true`, gọi `logActivity` trong transaction của thao tác.

| Thao tác | `summary` |
|---|---|
| Một máy khác | `Đăng xuất máy khác: <tên thiết bị>` |
| Mọi máy khác | `Đăng xuất <n> máy khác` |
| Giám đốc | `Đăng xuất mọi máy của <username> (<n> máy)` |

- `n = 0` thì không ghi, theo quy tắc "không đổi gì thì không ghi".
- Đặt tên hàm `signOutDevice`, `signOutOtherDevices`, `signOutAllDevices` để khớp `WRITE_NAME`; nhờ vậy `coverage.test.ts` bắt được nếu quên ghi nhật ký. Không đặt tên `revoke...`.
- **Đã cân nhắc:** thêm action mới `SIGN_OUT` cùng nhóm lọc trên D18: phải sửa `activity.ts`, nhãn và bộ lọc, trong khi đây là thao tác hiếm. `UPDATE` + `USER` giống "Khóa tài khoản", "Quên mọi thiết bị đã tin".

### D6. Dữ liệu và hàm thuần

Không đổi bảng. Không có migration.

`src/domain/device-session.ts` (hàm thuần, có unit test):

- `DEVICE_SESSION_LIST_LIMIT = 50`.
- `isLiveDeviceSession(row, now)`: `expiresAt > now`, và nếu `persistent = false` thì chưa quá `SHORT_SESSION_MS`. Hằng số này chuyển từ `src/lib/auth/sign-in.ts` sang đây để `domain` không phụ thuộc `lib`, `sign-in.ts` và `session.ts` import lại.
- `toDeviceSessionRows(rows, currentId, now)`: lọc, đặt máy đang dùng lên đầu, còn lại theo `updatedAt` giảm dần, cắt 50 dòng, gắn `deviceName`, `isCurrent`. Không bao giờ nhận hay trả token.

### D7. "Hoạt động gần nhất"

- **Chọn:** hiện `session.updated_at` bằng `formatLastLogin`, kèm một dòng ghi chú trên trang: "Hoạt động gần nhất cập nhật khoảng một lần mỗi ngày".
- **Lý do:** giá trị thật chỉ đổi mỗi ngày một lần.
- **Đã cân nhắc:**
  - Ghi `updated_at` mỗi yêu cầu: thêm một lần ghi DB cho mọi yêu cầu, không đáng.
  - Hạ `updateAge`: đổi cả chu kỳ gia hạn phiên, ngoài phạm vi.

### D8. API

Mọi route bọc `withAuth`, nên có kiểm Origin, 401, chặn đổi mật khẩu tạm và chặn chưa bật 2 lớp. Dùng `POST` theo kiểu `POST /api/users/[id]/lock` đang có. Không có `GET`: trang đọc thẳng ở server.

| Route | Quyền | Input | Output |
|---|---|---|---|
| `POST /api/me/sessions/[id]/sign-out` | đã đăng nhập | id trên URL | `{ ok }`; 400 phiên đang dùng; 404; 409 demo |
| `POST /api/me/sessions/sign-out-others` | đã đăng nhập | không | `{ count }`; 409 demo |
| `POST /api/users/[id]/sign-out-all` | `users.manage` | id trên URL | `{ count }`; 404; 409 chính mình; 409 demo |

Thực thi:

- Của chính mình: một transaction, `DELETE ... WHERE id = ? AND user_id = ? RETURNING user_agent`, rồi `logActivity`. Một câu lệnh nên không cần khóa thêm.
- Giám đốc: đặt trong `src/lib/users/service.ts` cạnh `lockUser`, dùng `lockRow` (`FOR UPDATE` dòng người dùng) rồi xóa theo `user_id`, cùng thứ tự khóa với `lockUser`.
- Demo: `isDemoMode() && isDemoAccount(username)`, như các thao tác D17.

### D9. Giao diện

- **Trang `/sessions` nằm ngoài nhóm `(desktop)` và `(mobile)`**, cạnh `/change-password` và `/two-factor`, gọi `requireUser()`. Lý do: phải mở được từ cả hai giao diện và cho mọi vai trò, trong khi `route-guards.test.ts` bắt trang `(desktop)` phải có `requirePermission`. Thêm một ca kiểm vào test đó.
- Một trang responsive dạng danh sách thẻ, nút cao 48px trên điện thoại, xác nhận bằng `AlertDialog`. Có đường về trang trước: `homePathFor(role)`, và `/m/profile` khi vào từ Mobile.
- Sau khi thành công gọi `router.refresh()`. Chữ để ở `src/locales/vi/auth.ts`.
- Chưa có thiết kế: vẽ `docs/design/screens/Sessions.dc.html` trước khi code giao diện, như `TwoFactor.dc.html` của K13 (xem câu hỏi trong PR).

### D10. Thiết bị đã tin của xác thực 2 lớp

- **Chọn:** đăng xuất từ xa **không** tự xóa danh sách máy đã tin. Sau khi đăng xuất, người có 2 lớp thấy lời nhắc kèm liên kết tới `/two-factor` ("Quên mọi thiết bị đã tin").
- **Lý do:** Better Auth lưu máy đã tin ở bảng `verification`, không nối với `session`, nên không xóa riêng được một máy. Xóa hết thì đổi danh sách đã chốt ở 0.2 #135, và mọi máy khác phải nhập mã lại. Máy bị mất vẫn phải qua mật khẩu.
- **Đã cân nhắc:** tự quên mọi máy đã tin mỗi lần đăng xuất từ xa: an toàn hơn cho trường hợp lộ cả mật khẩu. Đưa vào câu hỏi trong PR để bạn chốt.

## Risks / Trade-offs

- [Đăng nhập chen ngay sau lúc xóa phiên thì phiên mới vẫn sống] → Chấp nhận. Muốn chặn hẳn thì đã có Khóa tài khoản.
- [Hai máy cùng trình duyệt hiện cùng tên] → Có giờ đăng nhập để phân biệt.
- [Cùng máy đăng nhập nhiều lần tạo nhiều dòng] → Phiên cũ hết hạn theo 30 ngày; đăng xuất mọi máy khác dọn được một lần.
- [E2E "Đăng xuất mọi máy khác" làm chết phiên `e2e.*` mà worker khác đang dùng chung] → E2E dùng tài khoản tạm `e2etmp*` riêng cho file này.
- [Máy bị đăng xuất mà đang mở form nhập dở] → Giống khóa tài khoản: yêu cầu kế tiếp về `/login`. Nháp trên điện thoại vẫn ở IndexedDB.

## Migration Plan

Không có migration và không có biến môi trường mới. Deploy như bình thường. Quay lui bằng cách deploy lại bản trước; dữ liệu không đổi.
