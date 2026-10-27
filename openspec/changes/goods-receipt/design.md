# Design: goods-receipt

## Context

- Đã có, change này dùng lại (xem proposal "Why"):
  - đơn thu mua `purchase_order` + dòng + chi phí dự kiến + `purchase_order_event`, luật trạng thái `transition()` với 3 lệnh `RECEIVE_FULL`, `RECEIVE_SHORT`, `RECEIVE_SHORT_WAIT` (`src/domain/purchase-order.ts`);
  - chỗ nối `src/lib/purchasing/receipts.ts` (`receiptSummaries`, `hasReceiptsSql`), hiện trả "chưa có phiếu nhập";
  - `allocate(total, lines, basis)` và `splitLotByCondition(...)` trong `src/domain/landed-cost.ts`, có test theo bảng tính tay của `purchase-orders` design D3, D5;
  - sổ kho: `postMovements(tx, actor, posting)` (`src/lib/inventory/post.ts`), khóa theo (mã + tình trạng), chặn ghi lùi ngày, chặn vật tư/vị trí ngừng dùng; `MovementDraft` có sẵn `weighedKgMilli`;
  - bộ đếm chứng từ `nextDocumentCode(tx, prefix, year)`;
  - Stepper, Condition Split (`src/domain/condition-split.ts`), layout Mobile có thanh "Mất kết nối", manifest PWA **không có service worker**.
- Sổ kho mẫu (seed) đã có dòng loại chứng từ `GOODS_RECEIPT` mã `PN-2026-087`… nhưng chưa có bảng phiếu nhập.
- Quyết định 0.2 áp dụng: #2, #3, #7, #12, #13, #14, #25, #26, #27, #28. `purchase-orders` design D4 (đơn vị) và D5 (chia lô) là ràng buộc đã chốt cho change này.
- Bản vẽ: M1, M2, M3, M7, D3b. Số trên bản vẽ là dữ liệu mẫu; số trong design này là số tính tay để làm bảng mong đợi của test.

## Goals / Non-Goals

**Goals:**
- Xác nhận một chuyến = một transaction: lưu phiếu, ghi sổ kho, đổi trạng thái đơn, ghi lịch sử. Lỗi ở đâu cũng không ghi gì.
- Một hàm thuần tính toàn bộ tiền của chuyến (tiền hàng, chia chi phí, chia tình trạng), có test bằng bảng tính tay.
- Nháp trên máy không mất khi mất sóng, và gửi lại bao nhiêu lần cũng chỉ ra **một** phiếu.
- Không lưu số tiền cộng dồn nào ngoài sổ kho: tiền hàng tính từ số lượng × đơn giá trên đơn; chi phí phân bổ đọc lại từ sổ kho.

**Non-Goals:**
- Service worker, mở trang khi không có mạng.
- Sửa/hủy phiếu đã ghi sổ.
- Ảnh hàng lúc nhận, in nhãn QR (#40).

## Decisions

### D1. Lưu nháp trên máy: IndexedDB, gửi lại tự động, mã nháp chống trùng (điểm cần chốt 1)

**Lưu ở đâu.** IndexedDB của trình duyệt, database `scaffolding-erp`, store `drafts`, khóa là `draftId`.
- Một bản ghi:

  ```ts
  interface DraftRecord {
    draftId: string;          // crypto.randomUUID(), sinh khi mở phiếu lần đầu
    kind: "GOODS_RECEIPT";    // phiếu xuất, thu hồi sau này thêm loại
    userId: string;           // chỉ người tạo thấy nháp
    documentRef: string;      // "PO-2026-052"
    title: string;            // "Nhập PO-2026-052 · anh Trần Văn Hùng"
    progress: string;         // "3/4 mã xong"
    payload: unknown;         // nội dung phiếu, cùng dạng với body API
    state: "EDITING" | "QUEUED" | "SENDING" | "REJECTED";
    error: string | null;     // thông báo của server khi REJECTED
    createdAt: string; updatedAt: string; attempts: number;
  }
  ```
- Tự lưu mỗi khi đổi một ô (gom 500 ms), không chờ mất sóng. Nút "Lưu nháp" chỉ là lưu ngay rồi quay về M1.
- Lần đầu tạo nháp gọi `navigator.storage.persist()` để trình duyệt không tự xóa.
- Bọc IndexedDB bằng một module nhỏ `src/lib/drafts/store.ts` (~80 dòng, API `put/get/list/remove`). **Không thêm thư viện** (`idb`, `idb-keyval`): chỉ cần 4 thao tác. Unit test thay store bằng bản trong bộ nhớ cùng interface (không thêm `fake-indexeddb`); E2E chạy với IndexedDB thật của Edge.
- Nháp gắn `userId`. Người khác đăng nhập trên cùng điện thoại không thấy. Đăng xuất **không xóa** nháp (mất số đếm tệ hơn).
- Nháp không tự hết hạn. Nháp quá 3 ngày hiện "Nháp cũ" để Thủ kho xem lại hoặc xóa (hỏi lại trước khi xóa).

**Gửi thế nào.**
1. Bấm "Xác nhận nhập kho" → nháp chuyển `SENDING`, khóa không sửa → `POST /api/receiving/receipts` với `draftId` trong body.
2. Kết quả:
   - 201/200: xóa nháp, mở phiếu chỉ xem, báo "Đã nhập kho PN-2026-094".
   - Lỗi mạng hoặc 5xx: nháp chuyển `QUEUED`, thanh đầu màn hình "Mất kết nối – đã lưu nháp, sẽ tự gửi khi có mạng".
   - 409/422: nháp chuyển `REJECTED` kèm thông báo, mở lại cho sửa. Server đã rollback nên gửi lại bằng **cùng** `draftId` vẫn an toàn.
   - 401: giữ `QUEUED`, chờ đăng nhập lại.
3. Bộ gửi lại (`src/lib/drafts/outbox.ts`, chạy trong layout Mobile) gửi các nháp `QUEUED` của người đang đăng nhập khi: mở app, sự kiện `online`, và mỗi 30 giây khi trang đang hiện (lùi dần 30 s → 1 → 2 → tối đa 5 phút). Một lúc chỉ gửi một nháp (khóa bằng `navigator.locks` nếu có, không thì biến trong bộ nhớ), nên hai tab không gửi cùng lúc.

**Chống trùng ở server.** Cột `goods_receipt.client_draft_id uuid unique`.
- Trong transaction, sau khi khóa đơn (D5): tìm phiếu theo `client_draft_id`. Có rồi → trả **200** kèm phiếu cũ (`replayed: true`), không ghi gì. Phiếu đó do người khác tạo (không thể xảy ra với UUID ngẫu nhiên, nhưng vẫn kiểm) → 409.
- Hai lần gửi cùng lúc: lần sau chờ khóa đơn, rồi thấy phiếu của lần trước. Nếu vẫn lọt (khóa khác đường), lệnh `INSERT` vấp `unique` (23505) → rollback, đọc lại phiếu theo `client_draft_id` và trả 200.
- Mạng đứt sau khi server đã ghi: máy không nhận được trả lời → `QUEUED` → gửi lại → 200 phiếu cũ. Không có phiếu thứ hai.

Lựa chọn đã cân nhắc:
- **localStorage.** Không chọn: giới hạn ~5 MB, đọc ghi đồng bộ chặn giao diện, và trình duyệt dọn nó dễ hơn khi máy đầy.
- **Lưu nháp lên server (bảng phiếu trạng thái Nháp).** Không chọn cho MVP: lúc mất sóng vẫn phải có bản trên máy, thành ra hai chỗ lưu phải đồng bộ. Đổi lại, nháp chỉ ở một máy (Rủi ro).
- **Chỉ gửi khi người dùng bấm lại.** Không chọn: Thủ kho dễ quên phiếu đã đếm, hàng nằm bãi mà sổ chưa có. Vẫn có nút "Gửi lại" trên M7 cho ai muốn gửi ngay.
- **Service worker + Background Sync.** Không chọn: #7 không làm offline ở MVP; Background Sync chưa có trên Safari.

### D2. Quét QR: nội dung là mã hàng; thư viện `barcode-detector` (điểm cần chốt 2; người dùng đã duyệt thư viện 27/10/2026)

**Nội dung mã QR** = mã hàng viết hoa, không thêm gì: `GG-K17`.
- Mã hàng không đổi được (`item-code.ts`), nên nhãn in một lần dùng mãi.
- Không gắn tên miền: đổi địa chỉ server không phải in lại nhãn. Mã ngắn → QR ít ô, in nhỏ vẫn quét được.
- Đọc mã (`src/domain/qr-payload.ts`, hàm thuần): bỏ khoảng trắng hai đầu, viết hoa, kiểm theo luật mã hàng; mã sai luật → "Mã QR này không phải mã hàng". Chấp nhận thêm dạng `…/m/scan?code=GG-K17` để sau này #40 có đổi sang in đường dẫn thì nhãn cũ lẫn mới đều đọc được.
- Camera điện thoại bình thường mở mã chỉ thấy chữ `GG-K17`: chấp nhận, quét trong app.

**Thư viện.** `barcode-detector` (đã duyệt) (v3.x, MIT, cập nhật 10/2026):
- Cùng API với `BarcodeDetector` có sẵn trong Chrome Android. Có sẵn thì dùng bản của trình duyệt; không có (Safari iPhone, Firefox) thì dùng bản WebAssembly (`zxing-wasm`) của gói.
- File `.wasm` (~1 MB) **tự phục vụ** từ `public/` (chép bằng script khi cài), không tải từ CDN mặc định của gói. Chỉ tải khi mở màn quét (`import()` động), không vào bundle chung.
- Chỉ đọc QR (`formats: ["qr_code"]`), quét 5 lần/giây trên `<video>` của camera sau.

Lựa chọn đã cân nhắc:
- **Chỉ dùng `BarcodeDetector` của trình duyệt, không thêm gói.** Không cần duyệt thư viện, nhưng **iPhone không quét được**, chỉ gõ mã. Chọn được nếu thủ kho chỉ dùng Android.
- `qr-scanner` (nimiq): nhẹ, nhưng bản cuối 11/2022.
- `html5-qrcode`: kèm giao diện riêng khó theo Bright Blue Base, không còn bảo trì.
- `@zxing/browser`: lớn hơn, đang ở chế độ chỉ bảo trì.

Luôn có ô "Không quét được? Nhập mã" (bản vẽ M2). Camera cần HTTPS (localhost được), bị từ chối quyền thì chỉ hiện ô nhập mã kèm "Chưa cho phép dùng camera".

Quét **trong M3**: nút "Quét mã" mở cùng khung quét dạng bảng trượt **ngay trong M3** (không chuyển trang, nên mất sóng vẫn dùng được). M3 tải trước module quét (và file `.wasm` khi cần) ngay lúc mở trang, để mất sóng sau đó vẫn quét được. Quét được mã có trong phiếu → cuộn tới dòng đó và đặt con trỏ vào ô đếm; mã không có → "GG-K15 không có trong đơn PO-2026-052". M2 mở riêng thì chỉ tra tồn; nút "Thêm vào phiếu" của bản vẽ không làm (phiếu nhập không thêm được mã ngoài đơn).

### D3. Nhập kg: kho giữ đơn vị của mã, kg cân chỉ để tính tiền và chia chi phí (điểm cần chốt 3)

Theo `purchase-orders` design D4 (đã chốt):

| Mã | Dòng đơn | Thủ kho nhập | Vào kho | Tiền hàng | Cơ sở "theo trọng lượng" |
|---|---|---|---|---|---|
| tính theo cái | cái | số cái đếm | số cái | cái × đơn giá | cái × trọng lượng chuẩn |
| tính theo cái | kg | số cái đếm **và** số kg cân | số cái | kg cân × đơn giá | kg cân |
| tính theo kg (`PL-SAT`) | kg | số kg cân | số kg | kg cân × đơn giá | kg cân |

- **Không tự quy kg ra cái.** Dòng mua theo cân vẫn phải đếm: tồn kho theo cái phải đúng số cái thật, trọng lượng chuẩn chỉ là số trung bình. M3 hiện gợi ý "≈ 147 cái theo trọng lượng chuẩn" cạnh ô đếm, không điền sẵn.
- Phế liệu của mã tính theo cái vẫn đếm theo cái (#3); kg quy đổi (cái × trọng lượng chuẩn) chỉ để định giá phế liệu (#27) và để hiện.
- "Nhận đủ" của dòng so cùng đơn vị với dòng đơn: dòng cái so số cái, dòng kg so **kg cân**.
- Số kg cân lưu ở dòng phiếu (`weighed_kg`). Không ghi vào cột `weighed_kg` của sổ kho: cột đó dành cho bán phế liệu, và một dòng phiếu có thể thành 3 dòng sổ (3 tình trạng) mà kg không tách được.

Lựa chọn đã cân nhắc: **Quy kg ra cái theo trọng lượng chuẩn rồi nhập kho theo số quy đổi.** Không chọn: lệch dần với số thật, kiểm kê sẽ luôn lệch.

### D4. Giá vốn một chuyến (điểm cần chốt 4: dẫn quyết định #25, #27, không đề xuất cách khác)

Hàm thuần `costTrip(input)` trong `src/domain/goods-receipt.ts`, các bước:
1. **Tiền hàng dòng** (#13) = `lineAmount(số theo đơn vị dòng, đơn giá)`; dòng "Chuyến này không có" bỏ qua.
2. **Chia chi phí chuyến** (#25, #28) = `allocate(tổng chi phí chuyến, các dòng đã đếm, order.allocation_method)`. Cơ sở trọng lượng theo bảng D3.
3. **T của dòng** = tiền hàng + chi phí phân bổ.
4. **Chia tình trạng**:
   - đơn hàng mới: cả T vào Mới;
   - đơn hàng cũ: `splitLotByCondition` (#27): Phế liệu = kg quy đổi × giá sắt vụn, Tốt và Chờ sửa chia phần còn lại theo số cái; mã tính theo kg cả T vào Phế liệu.
5. Mỗi (mã + tình trạng) có số lượng > 0 thành một `MovementDraft` `PURCHASE_IN`, `amount` = phần đã chia (có thể 0 ₫ khi phế liệu vượt T). Tổng `amount` của chuyến **bằng đúng** tiền hàng + chi phí chuyến.

Chi phí chuyến **không** cộng vào tiền trả người bán (#26).

**Ví dụ tính tay** (bảng mong đợi của unit test và integration test). Đơn `PO-2026-052` của bản vẽ D3 (hàng cũ, chia theo giá trị). Chuyến 1: Khung đếm 196 (thiếu 4, không chờ), Chéo 400, Mâm "Chuyến này không có" (chờ chuyến sau), Phế liệu sắt lẫn cân 1.250,5 kg. Chi phí chuyến 3.500.000 + 1.200.000 + 180.000 = **4.880.000 ₫**. Giá sắt vụn 7.500 ₫/kg.

| Dòng | Tiền hàng | Chia theo giá trị: chính xác → chia | T |
|---|---|---|---|
| Khung 1,7m: 196 × 185.000 | 36.260.000 | 3.027.936,09 → **3.027.936** | 39.287.936 |
| Chéo: 400 × 32.000 | 12.800.000 | 1.068.879,81 → **1.068.880** | 13.868.880 |
| Phế liệu sắt lẫn: 1.250,5 kg × 7.500 | 9.378.750 | 783.184,10 → **783.184** | 10.161.934 |
| **Cộng** | **58.438.750** | **4.880.000** | **63.318.750** |

- Tổng phần nguyên 4.879.999 ₫; 1 ₫ dư về Chéo (phần lẻ 0,81 lớn nhất).
- Tiền phải trả người bán sau chuyến 1: **58.438.750 ₫**.

Chia tình trạng và dòng sổ:

| Dòng sổ `PURCHASE_IN` | Số lượng | Cách tính | Giá trị | Giá một đơn vị (hiện) |
|---|---|---|---|---|
| GG-K17 Phế liệu | 12 cái | 12 × 13,5 kg × 7.500 | **1.215.000** | 101.250 |
| GG-K17 Tốt | 150 cái | 38.072.936 × 150/184 = 31.037.719,57 → nhận 1 ₫ dư | **31.037.720** | 206.918 |
| GG-K17 Chờ sửa | 34 cái | 38.072.936 × 34/184 = 7.035.216,43 | **7.035.216** | 206.918 |
| GG-CH Tốt | 380 cái | 13.868.880 × 380/400 | **13.175.436** | 34.672 |
| GG-CH Chờ sửa | 20 cái | 13.868.880 × 20/400 | **693.444** | 34.672 |
| PL-SAT Phế liệu | 1.250,5 kg | cả T | **10.161.934** | 8.126 /kg |
| **Cộng** | | | **63.318.750** | |

Chuyến 2: Mâm đếm 150, tách 146 Tốt / 4 Chờ sửa, chi phí 500.000 ₫. T = 21.750.000 + 500.000 = 22.250.000. Tốt 22.250.000 × 146/150 = 21.656.666,67 → **21.656.667**; Chờ sửa 593.333,33 → **593.333**. Sau chuyến 2: Khung chốt thiếu (không chờ), mọi dòng khác đủ → đơn **Đã đóng** (D6). Phải trả người bán **80.188.750 ₫**.

Theo trọng lượng (cùng chuyến 1): Khung 2.574.002, Chéo 1.089.524, Phế liệu sắt 1.216.474 (unit test thứ hai cho nhánh `WEIGHT`).

**Giá sắt vụn** dùng giá hiện hành lúc ghi sổ (D9), đọc **trong** transaction ghi phiếu và lưu lại trên phiếu. Lô có phế liệu cùng Tốt/Chờ sửa mà chưa có giá → không xác nhận được: "Chưa có giá sắt vụn tham khảo, nhờ Giám đốc nhập ở Cài đặt" (thông báo có sẵn của `landed-cost`). M3 hiện "Giá sắt vụn 7.500 ₫/kg, cập nhật 20/10/2026" khi có dòng phế liệu.

### D5. Ghi phiếu: một transaction, khóa đơn trước

`postReceipt(actor, input)` trong `src/lib/receiving/post.ts`, một transaction:
1. `SELECT … FOR UPDATE` đơn theo mã. Khóa này xếp hàng mọi lệnh với cùng đơn: hai chuyến cùng lúc, phiếu và lệnh đóng/sửa của văn phòng.
2. Tìm phiếu theo `client_draft_id` (D1). Có → trả phiếu cũ.
3. Đơn phải `IN_PROGRESS`; `DONE` → 409 "Đơn PO-2026-052 đã xong, không nhập thêm được".
4. Đọc dòng đơn và tóm tắt các phiếu trước (`receiptSummaries`) để biết **dòng còn mở** (D6). Phiếu phải có đúng một dòng cho mỗi dòng còn mở và không có dòng nào khác:
   - thiếu dòng còn mở → 422 "Còn N mã chưa đếm hoặc đánh dấu "Chuyến này không có"";
   - có dòng lạ (không thuộc đơn, hoặc đã chốt/đã đủ ở phiếu khác) → 409 "Đơn PO-2026-052 vừa thay đổi, mở lại đơn để đếm theo số mới". Gồm cả khi văn phòng sửa dòng đơn trước chuyến đầu: lệnh sửa thay dòng nên dòng mới có id mới.
5. Kiểm từng dòng bằng hàm thuần `checkReceiptLines` (luật ở spec `goods-receipts`), kiểm chi phí bằng `checkOrderCosts` có sẵn.
6. Vị trí nhập: bãi (`YARD`) đang dùng, `FOR SHARE`. Có một bãi thì lấy luôn; nhiều bãi thì M3 cho chọn.
7. Đọc giá sắt vụn hiện hành nếu cần (D9). `costTrip` (D4).
8. Cấp mã `PN` (`nextDocumentCode`), số chuyến = số phiếu trước + 1. Ghi `goods_receipt`, dòng, chi phí.
9. `postMovements` với `documentType: "GOODS_RECEIPT"`, `documentId` = id phiếu, ngày nghiệp vụ = hôm nay theo giờ Việt Nam, diễn giải "Nhập từ PO-2026-052 · anh Trần Văn Hùng · chuyến 1". Lỗi sổ kho (vật tư ngừng dùng…) làm rollback cả phiếu.
10. Tính lệnh trạng thái (D6), gọi `transition()`, cập nhật đơn (`updated_at`, và `ended_by/ended_at/end_reason` khi đóng), ghi sự kiện.

Mọi lỗi nghiệp vụ trả 409/422 qua `src/lib/catalog/respond.ts`, kèm `field` (VD `lines.2.split`) để M3 hiện dưới dòng.

Lựa chọn đã cân nhắc: **Chỉ dựa vào `unique` của `client_draft_id`, không khóa đơn.** Không chọn: hai chuyến khác nhau cùng lúc sẽ cùng tính "dòng còn mở" từ dữ liệu cũ và cùng lấy số chuyến 2.

### D6. "Chuyến này không có", "Chờ giao bù" và trạng thái đơn (điểm cần chốt 5; mặc định đã chốt thành 0.2 #29)

**Lưu ở dòng phiếu**, không lưu ở đơn:
- `status`: `COUNTED` (đã đếm, số > 0) hoặc `NOT_IN_TRIP` (chuyến này không có, số = 0).
- `awaits_rest boolean`: dòng này còn chờ phần thiếu không. Chỉ có nghĩa khi sau chuyến này dòng vẫn thiếu; dòng đã đủ lưu `false`.

**Mặc định trên M3:**
- Dòng đếm thiếu: không tích (#12, mặc định đóng theo số thực nhận). Chữ dưới ô: "Không tích: đơn tính theo 196 cái thực nhận".
- Dòng "Chuyến này không có": **tích sẵn** "Chờ chuyến sau". Bỏ tích khi người bán báo không giao mã này nữa.
- Người dùng chốt khi review PR #41 (27/10/2026), ghi thành 0.2 #29. Lý do: #14 tạo "Chuyến này không có" chính là cho trường hợp hàng về chuyến sau; nếu mặc định không chờ thì chuyến đầu thiếu một mã sẽ đóng cả đơn, ngược ý #14.

**Dòng còn mở** (hiện ở chuyến sau) = dòng đơn chưa nhận đủ **và** (chưa có phiếu nào nhắc tới, hoặc dòng phiếu gần nhất của nó có `awaits_rest = true`). Dòng đã chốt thiếu không hiện ở chuyến sau.

**Lệnh trạng thái sau phiếu** (hàm thuần `orderCommandAfterReceipt`):
- mọi dòng đơn đã nhận đủ → `RECEIVE_FULL` (`DONE` + `RECEIVED`);
- còn dòng mở → `RECEIVE_SHORT_WAIT` (giữ `IN_PROGRESS`, nhãn "Đang nhận");
- còn lại (có dòng thiếu nhưng đều đã chốt) → `RECEIVE_SHORT` (`DONE` + `CLOSED`, lý do "Nhận thiếu, không chờ giao bù", người đóng là Thủ kho).

**Sự kiện** thêm vào `purchase_order_event.kind` (sửa CHECK của bảng):
- `RECEIPT_POSTED` (note = mã phiếu): "Văn Tùng ghi sổ PN-2026-090";
- `BACKORDER_MARKED` (note = phần chờ, VD "40 mâm giàn giáo 1,6m"): gộp hiển thị cùng dòng trên: "…, đánh dấu chờ giao bù 40 mâm";
- `RECEIVED` khi đơn nhận đủ; `CLOSED` (có sẵn) khi phiếu đóng đơn.

D3b "Còn chờ giao bù…" = các dòng mở còn thiếu của đơn `IN_PROGRESS` đã có phiếu. Văn phòng vẫn đóng đơn bằng lệnh `CLOSE` có sẵn.

Lựa chọn đã cân nhắc:
- **Một ô "Chờ giao bù" cho cả phiếu.** Không chọn: bản vẽ M3 đặt ô dưới từng dòng, và một chuyến có thể vừa có mã chờ, vừa có mã chốt thiếu.
- **Cột `backorder` ở dòng đơn.** Không chọn: đơn bị khóa sửa sau phiếu nhập; trạng thái chờ đổi theo từng chuyến nên thuộc về phiếu.
- **Không lưu dòng "Chuyến này không có"** (chỉ lưu dòng đã đếm). Không chọn: mất dấu "Thủ kho đã xem dòng này", và mất chỗ lưu `awaits_rest` cho dòng đó.

### D7. M1 lấy dữ liệu gì (điểm cần chốt 6)

`GET /api/receiving/arrivals` (quyền `receiving.manage`) trả các đơn **`IN_PROGRESS`** (mọi ngày), mỗi đơn:
- mã đơn, giờ dự kiến, ngày dự kiến, nhà cung cấp, phương tiện, loại hàng, số mã còn mở;
- nhãn ngày: "Hôm nay 09:30", "Trễ 2 ngày" (ngày dự kiến < hôm nay), "Mai", "28/10";
- `hasReceipts` để hiện "Đang nhận · chờ giao bù 40 mâm".

Thứ tự: trễ và hôm nay trước (theo giờ), rồi các ngày sau. M1 hiện các đơn tới hết ngày mai, kèm "Xem N đơn ngày sau". Câu chào "hôm nay có N việc" đếm thẻ của hôm nay và trễ. Lý do lấy mọi đơn đang xử lý chứ không chỉ hôm nay: D3b ghi "Đơn vẫn hiện ở 'Xe sắp về' trên điện thoại thủ kho cho tới khi nhận đủ hoặc đóng đơn", và xe hay về sớm/trễ so với ngày hẹn.

- Thẻ có nút "Bắt đầu nhập hàng"; trên máy đã có nháp của đơn đó thì nút là "Tiếp tục nhập".
- Thanh "N phiếu chưa gửi" đọc IndexedDB (D1), không gọi server.
- "Xuất hàng" (`deliveries`) và "Công trình trả hàng" (`returns-and-compensation`): **không hiện** ở change này. M1 là danh sách các khối, mỗi change sau thêm khối của mình; khối không có việc thì ẩn. Vai trò không có `receiving.manage` không thấy khối "Xe sắp về".
- Không có việc nào: "Hôm nay chưa có việc nào. Xe sắp về sẽ hiện ở đây."

### D8. Bảng dữ liệu (migration `drizzle/0005_goods_receipts.sql`)

**`goods_receipt`** (chỉ có phiếu đã ghi sổ; không có trạng thái):
- `id uuid` PK; `code text unique` (`PN-2026-094`);
- `order_id` → `purchase_order` `RESTRICT`; `trip_no int > 0`, `unique (order_id, trip_no)`;
- `location_id` → `location` `RESTRICT` (bãi nhập);
- `client_draft_id uuid not null unique` (D1);
- `business_date date`; `arrived_at timestamptz` null (giờ mở phiếu trên máy, M3 "về lúc 09:34"); `vehicle text` null (điền sẵn từ đơn, sửa được);
- `scrap_price_id` → `scrap_price` `RESTRICT` null, `scrap_price_per_kg bigint` null, CHECK cùng null hoặc cùng có;
- `posting_id uuid not null` (lô dòng sổ kho của phiếu);
- `created_by` → `user` `RESTRICT`, `created_at`.

**`goods_receipt_line`**:
- `id uuid`; `receipt_id` → `goods_receipt` `RESTRICT`; `line_no int`;
- `order_line_id` → `purchase_order_line` `RESTRICT` (dòng đơn có phiếu nhập không xóa được: thêm một lớp chặn cho luật khóa sửa của `purchase-orders` D6); `item_id` → `item` `RESTRICT`;
- `status` (`COUNTED` | `NOT_IN_TRIP`); `quantity numeric(14,3) >= 0` theo đơn vị của mã; `weighed_kg numeric(14,3)` null, `> 0` khi có;
- `qty_new`, `qty_good`, `qty_needs_repair`, `qty_scrap` `numeric(14,3) >= 0`, CHECK tổng = `quantity`;
- `awaits_rest boolean not null default false`;
- CHECK: `NOT_IN_TRIP` ⇒ `quantity = 0` và `weighed_kg is null`; `COUNTED` ⇒ `quantity > 0`;
- `unique (receipt_id, order_line_id)`.

**`goods_receipt_cost`**: `id`, `receipt_id` `RESTRICT`, `line_no`, `label text` (1–60), `amount bigint > 0`.

**`scrap_price`** (D9): `id bigint identity`, `price_per_kg bigint > 0`, `note text` null, `created_by` → `user`, `created_at`. Trigger chặn `UPDATE`/`DELETE` như sổ kho ("Giá sắt vụn chỉ ghi thêm").

**Không lưu tiền** trên phiếu:
- tiền hàng = số × đơn giá dòng đơn (dòng đơn bị khóa sau phiếu nhập, và `RESTRICT` giữ nó);
- chi phí phân bổ và giá trị từng tình trạng đọc từ sổ kho theo `document_id` của phiếu.
- Integration test đối chiếu: Σ `amount` sổ kho của phiếu = tiền hàng + chi phí chuyến.

Index: `goods_receipt (order_id)`, `goods_receipt (business_date desc)` cho M7, `goods_receipt_line (order_line_id)`.

Sửa bảng cũ: chỉ CHECK `kind` của `purchase_order_event` (thêm `RECEIPT_POSTED`, `BACKORDER_MARKED`, `RECEIVED`).

Lựa chọn đã cân nhắc: **Lưu tiền hàng, chi phí phân bổ trên dòng phiếu.** Không chọn: là bản sao thứ hai của số trong sổ kho, có thể lệch (quy tắc CLAUDE.md).

### D9. Giá sắt vụn tham khảo

- Bảng `scrap_price` chỉ ghi thêm; giá hiện hành = dòng mới nhất. Đổi giá = thêm dòng. Phiếu đã ghi sổ giữ giá đã dùng (`scrap_price_per_kg` trên phiếu), nên đổi giá không làm đổi giá vốn cũ.
- Màn `/settings/scrap-price` (Giám đốc, `scrap-price.manage`), vào từ thẻ mới ở `/settings`:
  - khối "Giá hiện hành": "7.500 ₫/kg · Giám Đốc cập nhật 20/10/2026";
  - form "Giá mới (₫/kg)" + ghi chú, nút "Lưu giá";
  - bảng 20 lần đổi gần nhất.
- Giá phải là số nguyên > 0 (₫/kg). Không có ngày hiệu lực tương lai: giá có hiệu lực ngay khi lưu.

Lựa chọn đã cân nhắc: **Một dòng cấu hình, sửa đè.** Không chọn: mất dấu giá nào đã dùng lúc nào; phiếu đã lưu giá riêng nhưng Giám đốc cần xem lịch sử.

### D10. Thay chỗ nối `receipts.ts` và phần nhận hàng D3b

- `receiptSummaries(tx, orderIds)` đọc `goods_receipt` + `goods_receipt_line`:
  - `trips`: số phiếu;
  - `receivedByItem`: tổng đã nhận **theo đơn vị dòng đơn** (dòng kg: tổng kg cân), phần nghìn;
  - thêm `openLineIds` (D6) và `waiting` (dòng mở còn thiếu, số thiếu) cho M1, M3, D3b.
- `hasReceiptsSql(orderId)` = `exists (select 1 from goods_receipt where order_id = …)`. Các chỗ đang gọi (tab D2, nhãn, luật sửa/hủy/đóng) chạy đúng mà không sửa.
- D3b dùng hàm thuần `orderReceivingSummary` (tiền theo từng chuyến, so với đơn):
  - "Đã nhận" của dòng = Σ các chuyến, kèm "đủ", "thiếu 40 · Chờ giao bù", "thiếu 4 · Không chờ", "cân dư 12,5 kg";
  - "Thành tiền" của dòng = Σ tiền hàng từng chuyến (mỗi chuyến làm tròn riêng, khớp từng chuyến người bán giao);
  - "Phải trả người bán" = Σ tiền hàng mọi chuyến (#13, #26), chữ phụ "chưa chốt vì còn chờ giao bù" khi đơn còn mở;
  - "So với đơn": tiền hàng dự kiến, thực nhận, từng dòng thiếu/dư, chi phí dự kiến, chi phí thực tế (Σ chi phí các chuyến);
  - "Các chuyến nhập": mỗi phiếu một khối (mã, "Đã ghi sổ", ngày giờ, xe, người nhập, các dòng đã đếm, các khoản chi phí, tổng).

### D11. API (bọc `withAuth`, kiểm bằng zod)

| Route | Quyền | Input | Output |
|---|---|---|---|
| `GET /api/receiving/arrivals` | `receiving.manage` | – | thẻ M1 (D7) |
| `GET /api/receiving/orders/[code]` | `receiving.manage` | – | dữ liệu M3: đơn, dòng còn mở (đã nhận, còn lại, đơn vị, trọng lượng chuẩn), chi phí điền sẵn (chuyến đầu: chi phí dự kiến; sau: rỗng), bãi đang dùng, giá sắt vụn hiện hành |
| `POST /api/receiving/receipts` | `receiving.manage` | `draftId`, `orderCode`, `locationId`, `arrivedAt`, `vehicle`, `lines[{ orderLineId, status, quantity, weighedKg, split: { NEW, GOOD, NEEDS_REPAIR, SCRAP }, awaitsRest }]`, `costs[{ label, amount }]` | 201 `{ code, tripNo, orderLabel }`; 200 cùng dạng + `replayed: true` |
| `GET /api/receiving/receipts` | `receiving.manage` | `before` (ngày), `days` (mặc định 2) | phiếu M7 nhóm theo ngày |
| `GET /api/receiving/receipts/[code]` | `receiving.manage` hoặc `purchasing.view` | – | phiếu chỉ xem |
| `GET /api/stock/lookup` | `stock.lookup` | `code` | vật tư + tồn theo tình trạng ở bãi, ở xưởng, ở công trình (không có giá vốn) |
| `GET /api/settings/scrap-price` | `scrap-price.manage` | – | giá hiện hành + 20 lần đổi |
| `POST /api/settings/scrap-price` | `scrap-price.manage` | `{ pricePerKg, note? }` | giá hiện hành |

Số lượng, tiền gửi dạng chuỗi, đọc bằng `parseQuantity` / `parseMoney` có sẵn.

### D12. Giao diện

Trang Mobile (thay trang giữ chỗ):
- `/m` (M1), `/m/scan` (M2), `/m/history` (M7);
- `/m/receive/[orderCode]` (M3): trang server tải dữ liệu đơn một lần, phần còn lại chạy ở client, nên **mất sóng giữa chừng vẫn đếm tiếp được**. `?draft=<id>` mở lại nháp; không có thì tìm nháp của đơn đó trên máy, không có nữa thì tạo nháp mới;
- `/m/receipts/[code]`: phiếu chỉ xem, app bar có nút quay lại.

Component trong `src/components/receiving/`: `arrival-card`, `receipt-form`, `receipt-line-card` (Stepper / ô kg / Condition Split / "Chuyến này không có" / "Chờ giao bù"), `trip-costs`, `receipt-confirm-bar` (nút "Xác nhận nhập kho" vô hiệu kèm lời nhắc dòng còn thiếu, như bản vẽ), `receipt-view`; `src/components/scan/` (`qr-scanner`, `item-stock-card`); `src/components/drafts/` (`draft-banner`, `draft-list`, `outbox-runner`).

- Thẻ dòng chưa đếm/chưa chia đủ có **viền `warning`** (`docs/ui.md` 3.4). Khối `primary` đặc duy nhất của M3: "Tổng chi phí chuyến".
- Dùng Stepper, Condition Split, badge có sẵn, token Bright Blue Base; hex trong bản vẽ đổi sang token.
- Desktop: D3b (D10), `/settings/scrap-price` (D9), thẻ "Giá sắt vụn tham khảo" ở `/settings`.

### D13. Quyền

Thêm vào `src/domain/permissions.ts`:

```ts
// goods-receipt design D13: the storekeeper receives on the phone; the
// director may stand in. Office roles read receipts through purchasing.view.
"receiving.manage": ["DIRECTOR", "WAREHOUSE"],
// M2 shows stock quantities (no cost) to anyone holding a phone.
"stock.lookup": EVERYONE,
"scrap-price.manage": ["DIRECTOR"],
```

- Thủ kho **không** có `purchasing.view`: D2/D3b vẫn chỉ cho văn phòng. Thủ kho đọc đơn qua API `receiving` (chỉ đơn đang xử lý, không có đơn giá).
- Nút "Xem thẻ kho" trên M2 chỉ hiện khi có `inventory.view`.
- `src/app/route-guards.test.ts` tự bắt route quên `withAuth`.

### D14. Dữ liệu mẫu và E2E

- `npm run db:seed:dev` (qua service, chỉ chạy khi chưa có phiếu nào):
  - giá sắt vụn 7.500 ₫/kg;
  - đẩy bộ đếm `PN` năm 2026 lên 089 (sổ kho mẫu đã dùng tới `PN-2026-087`);
  - đơn `PO-2026-051` như D3b: hai phiếu `PN-2026-090`, `PN-2026-093`, Mâm chờ giao bù 40 → "Đang nhận".
- E2E:
  - `global-setup.ts` chỉ xóa đơn `E2E thử` **chưa có phiếu nhập**; đơn đã có phiếu ở lại (sổ kho không xóa được), ảnh mốc D2 đã lọc theo nhà cung cấp mẫu khác nên không đổi.
  - Đơn E2E nhập hàng dùng mã `E2E-KHO-01/02`, kiểm tồn theo chênh lệch như `inventory.spec.ts`.
  - Mất mạng: `context.setOffline(true)` lúc bấm xác nhận, kiểm thanh "đã lưu nháp", bật lại mạng, kiểm phiếu được tạo **một lần** (đếm phiếu theo `client_draft_id`).
  - Camera: E2E chỉ kiểm đường gõ mã; hàm đọc mã QR có unit test.

## Risks / Trade-offs

- **[Nháp chỉ ở một máy]** Mất/hỏng điện thoại thì mất nháp chưa gửi. → Nháp tự gửi ngay khi có mạng; phiếu đếm xong thường gửi trong vài phút. Ghi rõ trong hướng dẫn thủ kho.
- **[Trình duyệt xóa IndexedDB]** (Safari xóa dữ liệu trang không dùng 7 ngày). → `storage.persist()`; app cài lên màn hình chính được miễn; nháp thường sống vài giờ.
- **[Ngày nghiệp vụ là ngày server nhận]** Nháp xác nhận lúc 23:50 mất sóng, tới 00:10 mới gửi được → ghi ngày hôm sau. → Chấp nhận: sổ kho không cho ghi lùi ngày; phiếu vẫn lưu `arrived_at` thật để tra.
- **[Đơn đổi trong lúc đếm]** Văn phòng sửa dòng đơn trước chuyến đầu, hoặc đóng đơn. → Server từ chối (409), nháp giữ nguyên số đã đếm; mở lại đơn thì giữ số của các mã vẫn còn trong đơn.
- **[Giá sắt vụn cũ]** → M3 hiện ngày cập nhật giá; tổng giá trị lô vẫn đúng bằng tiền thật bỏ ra (#27).
- **[File wasm ~1 MB]** → Chỉ tải ở màn quét, chỉ trên trình duyệt không có `BarcodeDetector`, trình duyệt cache lại.

## Migration Plan

- Migration chỉ thêm 4 bảng và nới CHECK `kind` của `purchase_order_event`. Không đụng dòng sổ kho cũ.
- Rollback trước khi có phiếu thật: xóa 4 bảng, trả CHECK cũ. Sau khi đã ghi phiếu thật thì không rollback được (sổ kho chỉ ghi thêm); sửa bằng phiếu điều chỉnh kho.

## Đã chốt khi duyệt PR

1. Thư viện quét QR: `barcode-detector` (D2), chốt 27/10/2026.
2. Dòng "Chuyến này không có" mặc định **chờ chuyến sau** (D6), chốt 27/10/2026, ghi thành 0.2 #29.
