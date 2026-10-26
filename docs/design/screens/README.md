# Thiết kế màn hình (bản chép từ Claude Design)

Bản chép các artboard đã duyệt trên canvas **Scaffolding ERP – Thiết kế màn hình** (link ở `docs/ui.md` mục 3.4). Mỗi file `*.dc.html` là một màn; bảng màn ↔ change ở `docs/ui.md` mục 3.4.

## Dùng thế nào

- Là **tham chiếu bố cục và nội dung**: khối nào ở đâu, cột bảng, nhãn, trạng thái, chữ tiếng Việt.
- Mở thẳng file trong trình duyệt để xem (thẻ `<x-dc>`/`<helmet>` là khung của Claude Design, bỏ qua được).
- Desktop vẽ ở 1366px, mobile ở 390px.

## Không copy nguyên

- **Mã màu hex trong file là token Bright Blue Base viết cứng.** Khi code phải dùng token (`bg-primary`, `text-muted-foreground`...). Bảng đổi hex → token ở `docs/design-system/tokens.json`. `npm run lint` chặn hex trong `src/`.
- **Style inline** chỉ để vẽ. Khi code dùng component shadcn/ui + Tailwind.
- **Số liệu là dữ liệu mẫu** (Minh Phát, An Phú – Block B...), không phải dữ liệu thật hay seed bắt buộc.
- Quy tắc nghiệp vụ lấy từ `openspec/specs/` và `docs/requirements.md` mục 0. Nếu thiết kế khác spec thì **spec thắng**.

## Cập nhật

Canvas là bản gốc. Sửa trên canvas xong thì chép lại file vào đây trong cùng PR với thay đổi tài liệu.
