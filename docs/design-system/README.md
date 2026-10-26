Bright Blue Base là design system dùng chung, không gắn với sản phẩm nào: nền trắng, xanh dương tươi, bo tròn, có một chút vui. Tên màu trùng với biến của shadcn (`primary`, `muted`, `ring`…), nên thiết kế và code dùng chung một ngôn ngữ cho React (shadcn/ui), Vue (shadcn-vue), Angular (spartan) và Flutter (shadcn_ui).

## Tinh thần

- Tươi sáng: trắng và xanh là chủ đạo. Vàng chanh và hồng chỉ điểm xuyết.
- Trẻ trung: góc bo tròn, tiêu đề to có cá tính, một chi tiết vui mỗi màn hình (sticker nghiêng, hình tròn bị cắt).
- Như người làm: mỗi màn hình có MỘT điểm nhấn chủ đích. Không lưới đều tăm tắp, không mọi thứ căn giữa.

## Giọng văn

- Tiếng Việt tự nhiên, câu ngắn, gọi người dùng là "bạn". Hệ thống không xưng "tôi".
- Viết hoa chữ đầu câu, kể cả nút và tiêu đề: "Thêm khoản chi", không "Thêm Khoản Chi".
- Nút: động từ đứng đầu, 1–3 từ. Không "OK", "Submit", "Click vào đây".
- Lỗi: nói lỗi gì + cách sửa. "Email chưa đủ. Thêm phần sau dấu @." Không "Lỗi: dữ liệu không hợp lệ".
- Trạng thái rỗng là lời mời: "Chưa có khoản chi nào" + một nút. Không "Không có dữ liệu".
- Thành công: "Đã thêm khoản chi". Không "thành công!", không dấu chấm than.
- Không emoji trong giao diện.
- Dữ liệu mẫu phải thật: tên Việt (Minh Anh, Quốc Bảo), tiền "4.250.000đ", ngày "24/10/2026", giờ "08:15".

## Màu

- Đặt nền trang bằng `background`, thẻ và ô nhập bằng `card`. Chữ chính `foreground`, chữ phụ `muted-foreground`.
- Dùng `primary` cho nút chính, link, mục đang chọn và MỘT khối đặc lớn mỗi màn hình (`StatCard`). Chữ trên nó là `primary-foreground`, không bao giờ viết cứng màu trắng.
- Tỉ lệ 60-30-10: 60% `background`/`card`, 30% chữ và viền, 10% màu rực. Màu rực ít thì mới nổi.
- `highlight` (vàng chanh) cho Badge "Mới", tô nền chữ cần nhấn, một hình khối trang trí. Tối đa 1–2 chỗ mỗi màn hình. Chữ trên nó luôn là `highlight-foreground`.
- `pop` (hồng) cho chấm thông báo và Badge "Hot". Tối đa một chỗ mỗi màn hình.
- Chú ý tên shadcn: `secondary` và `accent` là màu NHẠT (nút phụ, nền khi rê chuột, mục đang chọn trong menu). Không phải màu nhấn.
- `success`, `warning`, `destructive` luôn đi kèm icon hoặc chữ. Không dùng màu là cách duy nhất để báo trạng thái.
- Biểu đồ dùng `chart-1` … `chart-5` theo thứ tự. `chart-3` (vàng chanh) chỉ cho cột và vùng, không cho đường mảnh.
- Mọi cặp chữ/nền ghi trong ghi chú của token đạt 4.5:1 ở cả chế độ Sáng và Tối.

## Chữ

- Tiêu đề và con số lớn: họ `display` (Bricolage Grotesque), đậm 700, khoảng chữ hơi khít. Kiểu `display-xl`, `display`, `h1`, `h2`.
- Nội dung, nhãn, nút: họ `body` (Be Vietnam Pro, vẽ riêng cho tiếng Việt). Kiểu `body-lg`, `body`, `label`, `caption`.
- Chữ nội dung tối thiểu 16px (`body`) trên điện thoại. Ô nhập luôn 16px.
- Dám làm to: tiêu đề trang gấp 2–3 lần chữ nội dung. Mỗi màn hình chỉ một `display-xl`.
- Cả hai họ chữ lấy từ Google Fonts.

## Khoảng cách, bo góc, viền, bóng

- Chỉ dùng bước `space-1` … `space-16` (4, 8, 12, 16, 20, 24, 32, 40, 48, 64px). Lề trang điện thoại `space-4`, padding thẻ `space-5`, khoảng giữa thẻ `space-6`, giữa các nhóm `space-8`.
- Nhịp có chủ đích: tiêu đề sát nội dung của nó (`space-2`), các nhóm cách xa nhau (`space-8`).
- Bo góc tròn hơn bình thường: nút và ô nhập `radius-md`, thẻ `radius-lg`, hộp thoại và khối nổi bật `radius-xl`, Badge/Switch/Avatar `radius-pill`.
- Viền 1px `border` để tách khối. Bóng `shadow-popover` chỉ cho thứ nổi lên trên trang (menu, Toast, Dialog), không cho thẻ thường.
- Căn trái là mặc định. Chỉ căn giữa cho trạng thái rỗng và hộp thoại.

## Trạng thái và chuyển động

- Focus bàn phím: viền `ring` 2px liền, cách 2px, trên mọi thứ bấm được.
- Khi bấm nút: thu nhỏ còn 0.97 trong 120ms. Hover, mở/đóng: 120–200ms.
- Đang tải danh sách: `Skeleton`. Vòng quay chỉ nằm trong nút đang xử lý.
- Tắt hết chuyển động khi người dùng chọn giảm chuyển động.
- Vùng bấm tối thiểu 44×44px.

## Icon

- Dùng bộ Lucide (mặc định của shadcn): nét 2px, đầu tròn, không tô đặc, cùng màu với chữ bên cạnh. Cỡ 18px trong nút, 20–24px đứng riêng.
- Hệ thống chưa có bộ icon riêng. Icon trong các bản xem trước là nét vẽ đơn giản theo kiểu Lucide, không phải file gốc của Lucide.
- Icon đứng một mình phải có `aria-label`. Không dùng emoji làm icon.

## Tránh

- Gradient tím–xanh, nền tối có chữ phát sáng, kính mờ (glassmorphism).
- Thẻ có viền màu một bên, lưới thẻ to bằng nhau, bóng đổ mờ to dưới mọi thứ.
- Câu sáo rỗng ("Cách mạng hoá trải nghiệm"), số liệu trang trí, "Lorem ipsum".

## Dùng cho một sản phẩm mới

- Giữ nguyên mọi token. Chỉ đổi khi sản phẩm thật sự cần nhận diện riêng, và đổi theo thứ tự: `primary` (cùng `primary-foreground`, `ring`, `accent`), rồi `highlight`, rồi họ chữ `display`.
- Đổi xong, kiểm tra lại độ tương phản các cặp chữ/nền ghi trong ghi chú token, ở cả hai chế độ.
- Trong code, các token này sinh ra `shadcn-theme.css` (web) và `shad_theme.dart` (Flutter); tên biến giữ nguyên.
