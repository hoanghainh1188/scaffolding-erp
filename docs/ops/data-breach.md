# Runbook: sự cố lộ dữ liệu cá nhân

> Đây là bản tra cứu theo Luật 91/2025/QH15, Nghị định 356/2025/NĐ-CP và PDPA Singapore, **chưa phải ý kiến luật sư** (theo dõi ở #78). Thời hạn, nơi báo và mẫu hồ sơ phải được luật sư xác nhận trước khi đưa dữ liệu thật lên.

## 1. Thế nào là sự cố

Coi là sự cố khi **nghi ngờ** có một trong các việc sau, không chờ chắc chắn:

- Bản sao lưu, `DATABASE_URL`, `PII_ENCRYPTION_KEYS` lọt ra ngoài (chat, commit, log, máy người đã nghỉ).
- Tài khoản có quyền `partners.manage` bị người lạ dùng.
- Báo lỗi hoặc log có dãy 12 chữ số, chuỗi `pii1.`.
- File Excel phải trả, danh sách người bán gửi nhầm người.

## 2. Mốc 72 giờ

- **Mốc tính từ lúc phát hiện hoặc nghi ngờ đầu tiên**, không phải lúc xác nhận xong.
- Ví dụ: nghi lộ bản sao lưu lúc **09:00 ngày 12/11/2026** thì hạn báo người bị ảnh hưởng là **09:00 ngày 15/11/2026**.
- Ghi ngay giờ phát hiện vào hồ sơ sự cố (mục 6).

## 3. Các bước và người chịu trách nhiệm

| # | Việc | Người chịu trách nhiệm | Hạn |
|---|---|---|---|
| 1 | Ghi giờ phát hiện, mở hồ sơ sự cố | Người phát hiện | Ngay |
| 2 | Báo Giám đốc và Trưởng nhóm Kỹ thuật (mức S1 ở `production.md` mục 5) | Người phát hiện | ≤ 15 phút |
| 3 | Khoanh vùng: thứ gì lộ, từ lúc nào, bao nhiêu người | Trưởng nhóm Kỹ thuật | ≤ 4 giờ |
| 4 | Chặn nguồn lộ, đổi khóa và secret (mục 4) | Trưởng nhóm Kỹ thuật | ≤ 4 giờ |
| 5 | Quyết định có phải báo hay không, cùng luật sư | Giám đốc | ≤ 24 giờ |
| 6 | Báo người bị ảnh hưởng (mục 5) | Giám đốc | ≤ 72 giờ |
| 7 | Báo cơ quan quản lý (mục 5) | Giám đốc | ≤ 72 giờ |
| 8 | Viết nguyên nhân, cách phòng tái diễn, đóng hồ sơ | Trưởng nhóm Kỹ thuật | ≤ 14 ngày |

## 4. Khoanh vùng và đổi khóa

Khoanh vùng:

- D18 Nhật ký: lọc theo người, thời gian, cờ "Dữ liệu nhạy cảm".
- Vercel và Sentry: log trong khoảng nghi ngờ.
- Neon: nhánh và bản sao lưu ai đã tải.

Chỉ lộ bản sao lưu hoặc DB, **khóa không lộ**: CCCD vẫn là bản mã. Tên, điện thoại, địa chỉ, 4 số cuối thì đã lộ. Vẫn phải đánh giá và báo.

Lộ khóa, hoặc không loại trừ được:

1. Sinh khóa mới, đổi theo `personal-data.md` mục 2. Coi mọi CCCD trong bản sao lưu có khóa đó là đã lộ.
2. Đổi `BETTER_AUTH_SECRET`, mật khẩu DB, `BACKUP_ENCRYPTION_KEY` theo `production.md` Sự cố 6.
3. Đăng xuất mọi máy của tài khoản nghi bị dùng (`/sessions`, D17).

## 5. Báo cho ai

- **Người bị ảnh hưởng:** gọi điện hoặc nhắn trực tiếp. Nêu dữ liệu nào lộ, khi nào, đã làm gì, họ nên làm gì, số liên hệ.
- **Cơ quan quản lý:** Cục An ninh mạng và phòng, chống tội phạm công nghệ cao (A05), Bộ Công an. **Chờ luật sư xác nhận** nơi nhận và mẫu.
- **Singapore:** vì dữ liệu lưu tại đó, hỏi luật sư có phải báo PDPC theo PDPA hay không.

## 6. Hồ sơ sự cố (lưu ít nhất 5 năm, ngoài DB)

- Giờ phát hiện, người phát hiện, cách phát hiện.
- Dữ liệu và số người bị ảnh hưởng.
- Nguyên nhân, việc đã làm và giờ làm.
- Đã báo ai, lúc nào, nội dung (kèm bản sao).
- Ý kiến luật sư.

Không chép số CCCD, số tài khoản đầy đủ vào hồ sơ.
