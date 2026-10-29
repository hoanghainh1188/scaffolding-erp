# Proposal: stock-value-adjustment

## Why

Sổ kho chỉ ghi thêm. Phiếu điều chỉnh hiện có (`stock-adjustments`) chỉ sửa **số lượng, tình trạng, vị trí** theo giá BQ hiện tại, không sửa được **giá trị** đã ghi sai. Ví dụ: phiếu nhập ghi nhầm chi phí chuyến 35.000.000 ₫ thay vì 3.500.000 ₫ thì giá BQ của các mã trong chuyến bị đội lên, và hiện không có chứng từ nào kéo về. Cần có trước khi chạy thật (issue #42, tách từ review PR #41).

- Giai đoạn: **[MVP]**, change kỹ thuật **K6** trong `docs/roadmap.md`, issue #42.
- Màn hình: dùng lại trang **Phiếu điều chỉnh** `/inventory/adjustments` (danh sách, chi tiết, khung lập phiếu) đã có của `stock-adjustments`. Trang này không có mã D riêng trong `docs/ui.md` và không có file thiết kế; thêm một loại phiếu mới vào đó, không vẽ màn mới. Thẻ kho **D11** hiện thêm dòng điều chỉnh giá.
- Quyết định đã chốt dùng: `docs/requirements.md` 0.2 #10 (làm tròn 1 ₫), #11 (chỉ hàng vào từ ngoài đổi giá BQ), #24 (giá BQ gộp mọi vị trí), #25, #27 (cách chia chi phí chuyến và chia theo tình trạng), #30 (lý do có change này).

## What Changes

- **Phiếu điều chỉnh giá trị** mã `ĐCG-<năm>-<3 số>` (VD `ĐCG-2026-001`), bộ đếm `document_counter` có sẵn. Mỗi dòng = một (mã hàng + tình trạng) và một **chênh lệch giá trị** (₫, khác 0, có dấu). **Không đổi số lượng.**
- **Giá BQ mới = (tồn × giá BQ hiện tại + chênh lệch) ÷ tồn**, tồn gộp mọi vị trí kể cả công trình (#24), làm tròn 1 ₫, 0,5 lên (#10). Tính lại **lúc duyệt**, theo tồn và giá BQ lúc đó.
- **Lý do** và **chứng từ gốc** bắt buộc. Chứng từ gốc phải có trong sổ kho và phải có dòng sổ của từng (mã + tình trạng) trên phiếu.
- **Chặn** khi tồn của (mã + tình trạng) bằng 0 lúc lập hoặc lúc duyệt, và khi giá trị sau điều chỉnh âm.
- **Sửa chi phí chuyến của phiếu nhập**: chọn phiếu nhập, nhập chi phí chuyến đúng; hệ thống chia lại đúng như phiếu gốc (cách chia của đơn, chia theo tình trạng với giá sắt vụn của phiếu) và tự sinh các dòng chênh lệch. Một phiếu nhập chỉ có một phiếu sửa chi phí chưa ghi sổ tại một lúc.
- **Luồng** như phiếu điều chỉnh: Nháp → Chờ duyệt → Đã ghi sổ; Giám đốc duyệt mới ghi sổ, trả lại kèm lý do; duyệt hai lần chỉ ghi một lần. Quyền: lập `inventory.adjust`, duyệt `inventory.approve`.
- **Sổ kho thêm loại biến động `REVALUE`**: số lượng **0**, **không có vị trí** (giá BQ là của toàn công ty), giá trị = chênh lệch, giá BQ sau = giá mới. Đây là loại duy nhất được có số lượng 0.
- **Thẻ kho D11** hiện dòng `REVALUE` ở mọi bộ lọc vị trí (cột Nhập, Xuất trống; diễn giải ghi giá trị điều chỉnh và giá BQ cũ → mới).
- **Nhật ký thao tác** ghi các thao tác của phiếu điều chỉnh giá như phiếu điều chỉnh (Tạo, Sửa, Xóa nháp, Gửi, Duyệt, Trả lại).
- Ghi quyết định mới vào `docs/requirements.md` **0.2 #35** (chốt 29/10/2026, ngay trong PR này theo review).
- Cập nhật `CLAUDE.md` mục Quy ước code "Sổ kho": `location_id` có thể trống (chỉ `REVALUE`), cách truy vấn theo vị trí cho đúng (task 1.4).

## Ảnh hưởng tới sổ kho và giá vốn

- **Không sửa dòng cũ.** Chỉ thêm dòng `REVALUE` mới qua `postMovements`, trong transaction duyệt.
- Giá BQ của (mã + tình trạng) đổi **từ ngày duyệt**. Các dòng đã ghi trước đó (xuất, bán, thu hồi) giữ đơn giá cũ; dòng sau dùng giá mới.
- Hàng ở công trình **có** chịu chênh lệch (giá BQ gộp mọi vị trí, #24); thu hồi về sau ghi theo giá mới. Tiền thuê, đền bù không dựa trên giá vốn nên không đổi.
- Hàng của chứng từ gốc đã ra khỏi kho một phần thì **toàn bộ chênh lệch** dồn vào hàng còn tồn: tổng giá vốn của cả công ty (đã xuất + còn tồn) cuối cùng đúng, nhưng giá BQ hàng còn tồn tạm lệch so với giá "đúng" (design D3).
- Sổ kho hiện có không đổi; bảng `inventory_cost` cập nhật trong cùng transaction; `npm run inventory:check` phải khớp sau khi duyệt.
- **DB:** ràng buộc của `inventory_ledger` nới cho đúng một trường hợp `REVALUE` (số lượng 0, vị trí trống). Các dòng khác giữ nguyên luật.

## Ngoài phạm vi

- Sửa **tiền hàng** (đơn giá trên đơn thu mua, số lượng tính tiền): đụng công nợ phải trả người bán, để phân hệ Tài chính.
- Ghi phần chênh lệch của hàng **đã bán, đã xuất hết** vào giá vốn hàng bán hay sổ cái: chưa có phân hệ kế toán.
- Tự chia lại cho **phiếu sửa chữa** hay **tồn đầu kỳ** theo phiếu gốc: dùng dòng nhập tay (mỗi phiếu đó ghi giá trị theo từng mã, không có bước chia chung).
- Sửa lùi ngày (ghi điều chỉnh vào ngày của chứng từ gốc) và tính lại các dòng sổ sau đó.
- Điều chỉnh giá trị theo từng vị trí; điều chỉnh giá trị kèm đổi số lượng trong cùng một dòng.
- Màn mới, mã màn mới trong `docs/ui.md`; in phiếu.

## Capabilities

### New Capabilities

- `stock-value-adjustments`: phiếu điều chỉnh giá trị kho: dòng chênh lệch theo (mã + tình trạng), công thức giá BQ mới, chặn tồn 0 và giá trị âm, chứng từ gốc bắt buộc, sửa chi phí chuyến của phiếu nhập (chia lại như phiếu gốc), luồng lập/duyệt, quyền, hiển thị trên trang Phiếu điều chỉnh.

### Modified Capabilities

- `inventory-ledger`: thêm loại biến động `REVALUE` (số lượng 0, không vị trí, chỉ đổi giá BQ); sửa luật "dòng số lượng 0" và luật "loại nào đổi giá vốn".
- `stock-views`: thẻ kho D11 hiện dòng điều chỉnh giá ở mọi bộ lọc vị trí.
- `activity-log`: phiếu điều chỉnh giá trị nằm trong danh sách chứng từ được ghi nhật ký, có tóm tắt riêng.

## Impact

- **DB:** migration `drizzle/0009_stock_value_adjustment.sql`: thêm `REVALUE` vào ràng buộc `inventory_ledger` (vị trí cho phép trống chỉ với `REVALUE`); `stock_adjustment` thêm loại `REVALUE`, cột `source_receipt_id`, `corrected_trip_cost`; `stock_adjustment_line` thêm kiểu `VALUE`, cột `value_delta`, vị trí cho phép trống với kiểu `VALUE`.
- **Code mới:** `src/domain/stock-revaluation.ts` (công thức giá BQ mới, chặn, chia lại chi phí chuyến — hàm thuần, unit test), `src/lib/inventory/revaluations.ts` (dựng dòng từ phiếu nhập, kiểm chứng từ gốc).
- **Sửa:** `src/domain/movement.ts`, `src/lib/inventory/post.ts` (nhận `REVALUE`), `src/lib/inventory/adjustments.ts` (loại phiếu mới), `src/lib/inventory/card.ts` (dòng không vị trí), `src/lib/inventory/activity.ts`, API `src/app/api/inventory/adjustments/**` (thêm route dựng dòng từ phiếu nhập), `src/components/inventory/adjustment-form-sheet.tsx`, trang chi tiết phiếu, seed dev (một phiếu `ĐCG` chờ duyệt).
- **Dùng lại:** `allocate`, `splitLotByCondition` (`src/domain/landed-cost.ts`), tính chi phí chuyến (`src/domain/receipt-cost.ts`), `lockForPosting`, `nextDocumentCode`, `logActivity`, `withAuth`, `requirePermission`.
- Không thêm thư viện. Không đổi bảng quyền.
