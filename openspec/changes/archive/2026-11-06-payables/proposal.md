# Proposal: payables — Công nợ phải trả người bán [Bản 2]

## Why

Công ty mua hàng cũ, phế liệu của nhiều người bán (công ty, cá nhân, cai thầu). Hiện phần mềm biết mỗi chuyến nhận bao nhiêu tiền hàng (D3b "Phải trả người bán") nhưng không biết **đã trả bao nhiêu, còn nợ ai, khoản nào quá hạn**. Kế toán vẫn theo dõi bằng Excel. Phải thu (`receivables`) đã xong, nên giờ làm phía phải trả theo cùng cách: khoản nợ tính ra từ chứng từ gốc, tiền chỉ ghi thêm (0.2 #98–#101).

## What Changes

- **Khoản phải trả tính ra, không lưu số tiền:** mỗi phiếu nhập đã ghi sổ là một khoản = Σ số thực nhận × đơn giá dòng đơn (kg theo cân thực tế, làm tròn từng dòng như hiện nay), **không gồm** chi phí chuyến (0.2 #26), **chưa VAT** (0.2 #101). Dùng đúng hàm tiền hàng đang có của phiếu nhập (`receiptGoodsAmount`), không có công thức thứ hai.
- **Hạn trả:** = ngày nhập + **số ngày được nợ** của người bán (0.2 #99). Thêm trường này vào nhà cung cấp (D16), 0–365, mặc định 0 = trả ngay. Hạn **lưu trên phiếu nhập lúc ghi sổ**, nên đổi số ngày chỉ áp cho phiếu nhập sau.
- **Phiếu chi** `PC-YYYY-NNN` (bảng đếm `document_counter`): loại **Trả tiền hàng** hoặc **Ứng trước**, Tiền mặt / Chuyển khoản, ngày chi không sau hôm nay. Trả tiền hàng tự trừ khoản đến hạn sớm nhất trước; Kế toán chỉ định khoản khác được. Chi dư và tiền ứng thành **tiền ứng trước**, tự trừ vào phiếu nhập sau (0.2 #100).
- **Không sửa phiếu chi**; ghi sai thì hủy có lý do, các khoản đã trừ mở lại, tiền ứng trước khác tự trừ lại.
- Phiếu chi, phân bổ, dòng hủy **chỉ ghi thêm** (trigger + `APPEND_ONLY_TABLES`). Tiền ứng trước tính ra, không lưu số dư.
- **Ghi sổ phiếu nhập** (`postReceipt`) tự trừ tiền ứng trước của người bán trong cùng transaction; hủy phiếu chi cũng vậy (hàm dùng chung `settleAdvances`, có test tĩnh bắt chỗ quên).
- **Khóa tiền đã phát sinh:** phiếu nhập đã ghi sổ không sửa được ở DB (thêm ba bảng phiếu nhập vào `APPEND_ONLY_TABLES`); đơn giá, đơn vị, mã của dòng đơn đã có phiếu nhập bị trigger chặn đổi. Điều chỉnh giá trị `ĐCG` chỉ đổi giá vốn, không đổi phải trả.
- **Màn D14c** `/payables`: thanh tab **Phải thu / Phải trả** (thêm cùng thanh tab vào D14); bốn ô tổng; bảng theo người bán (lọc, tìm, phân trang); các khoản của một người bán; form ghi phiếu chi có xem trước; danh sách phiếu chi có nút Hủy; **Xuất Excel** bằng `buildXlsxBook`.
- **Phần lõi phân bổ dùng chung với phải thu:** tách hàm thuần chung (thứ tự cố định, chia FIFO, trừ tiền trả trước, tình hình theo ngày Việt Nam) ra `src/domain/allocation.ts`; `src/domain/receivables.ts` giữ nguyên chữ ký và hành vi, test cũ giữ nguyên.
- CCCD / số tài khoản của người bán cá nhân chỉ hiện dạng che trên D14c và Excel.
- Nhật ký D18: loại chứng từ mới **Phiếu chi** (ghi, hủy); ghi sổ phiếu nhập có trừ ứng trước thì tóm tắt thêm "· trừ tiền ứng trước x ₫".

## Capabilities

### New Capabilities

- `payables`: khoản phải trả theo phiếu nhập, hạn trả, quá hạn, thứ tự cố định, màn D14c (tab, ô tổng, lọc, các khoản), Excel, quyền xem.
- `supplier-payments`: phiếu chi (Trả tiền hàng / Ứng trước), phân bổ, tiền ứng trước, tự trừ khi ghi sổ phiếu nhập, hủy có lý do, chống trừ trùng, quyền ghi / hủy.

### Modified Capabilities

- `partner-directory`: nhà cung cấp có **số ngày được nợ** (D16).
- `goods-receipts`: ghi sổ phiếu nhập lưu hạn trả và trừ tiền ứng trước; phiếu nhập đã ghi sổ không sửa được ở DB.
- `purchase-orders`: đơn giá, đơn vị, mã của dòng đơn đã có phiếu nhập không đổi được (chặn cả ở DB).
- `database-access`: thêm bảng chỉ ghi thêm (phiếu chi, phân bổ, dòng hủy, ba bảng phiếu nhập).
- `activity-log`: thao tác phiếu chi được ghi; loại Phiếu chi trên D18; trừ ứng trước ghi trong dòng của phiếu nhập.

## Ngoài phạm vi

- VAT đầu vào, hóa đơn mua hàng (0.2 #101).
- Phải trả nhà xe, bốc xếp: chi phí chuyến trả ngay, không thành khoản (0.2 #98).
- Đề nghị chi, Giám đốc duyệt chi, in phiếu chi.
- Thủ kho ghi phiếu chi trên điện thoại; M3 không có ô tiền (0.2 #103).
- Bù trừ phải thu với phải trả khi một đối tác vừa là nhà thầu vừa là người bán.
- Trả lại hàng cho người bán (giảm khoản phải trả): chưa có nghiệp vụ trả hàng mua.
- Nhập nợ đầu kỳ người bán (số phải trả cũ từ Excel): làm ở `data-migration` (#48) (0.2 #105).
- Báo cáo tuổi nợ phải trả, dòng tiền: `management-reports`.

## Impact

- **Màn:** D14c mới (`/payables`), D14 thêm thanh tab, D16 thêm trường số ngày được nợ. Ảnh mốc D14, D16 đổi; D14c mới.
- **DB:** migration `0021_payables.sql`: cột `supplier.payment_terms_days`, cột `goods_receipt.due_date` (điền cho phiếu cũ = ngày nhập), ba bảng `supplier_payment`, `supplier_payment_allocation`, `supplier_payment_cancellation`, trigger chỉ ghi thêm (cả ba bảng phiếu nhập), trigger khóa giá dòng đơn, check `activity_log` thêm loại `SUPPLIER_PAYMENT`.
- **Sổ kho, giá vốn:** **không đổi** số liệu đã có. Không ghi dòng sổ nào; giá vốn, tồn kho, phân bổ chi phí chuyến giữ nguyên. Phiếu nhập cũ chỉ được điền hạn trả.
- **Code:** `src/domain/allocation.ts` (mới, tách từ `receivables.ts`), `src/domain/payables.ts`, `src/lib/payables/`, `src/lib/receiving/post.ts` (gọi `settleAdvances`), `src/domain/permissions.ts` (`payables.view`, `payments.manage`), `src/lib/navigation.ts`, `src/lib/catalog/partners.ts`, D16, `src/db/grants.ts`.
- **API:** `GET /api/payables/suppliers`, `GET /api/payables/suppliers/[id]`, `POST /api/payables/payments`, `POST /api/payables/payments/preview`, `POST /api/payables/payments/[id]/cancel`, `GET /api/payables/export`.
- **Dữ liệu cũ:** mọi phiếu nhập đã ghi sổ trước khi deploy thành khoản còn nợ, hạn = ngày nhập (thường đã quá hạn). Kế toán ghi phiếu chi bù cho các khoản đã trả (0.2 #105, Migration Plan trong design).
