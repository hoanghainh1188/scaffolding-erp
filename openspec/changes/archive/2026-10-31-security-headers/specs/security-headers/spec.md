# Spec Delta

## Purpose

Bảo vệ ứng dụng web khỏi tấn công XSS và chèn script trái phép bằng Content-Security-Policy (CSP) với cơ chế nonce ngẫu nhiên cho từng request.

## ADDED Requirements

### Requirement: Header Content-Security-Policy theo nonce
Mọi phản hồi trang HTML của hệ thống SHALL trả về header `Content-Security-Policy` chứa directive `script-src` kèm nonce ngẫu nhiên dạng base64. Nonce này SHALL được sinh mới độc lập cho mỗi request và không trùng lặp.

#### Scenario: Phản hồi trang HTML có header CSP và nonce
- **WHEN** trình duyệt gửi request `GET /login` hoặc `GET /dashboard`
- **THEN** phản hồi trả về HTTP header `Content-Security-Policy` chứa `script-src 'self' 'nonce-` và `'strict-dynamic'`
- **AND** header `x-nonce` chứa chuỗi nonce base64 tương ứng

#### Scenario: Hai request liên tiếp có nonce khác nhau
- **WHEN** client gửi hai request liên tiếp tới `/login`
- **THEN** giá trị nonce trong header `Content-Security-Policy` của hai phản hồi là hai chuỗi ngẫu nhiên khác nhau

### Requirement: Trình duyệt chặn script không có nonce
Mọi thẻ script nội tuyến hoặc script ngoài không chứa đúng giá trị nonce SHALL bị trình duyệt chặn thực thi theo chính sách của CSP.

#### Scenario: Script nội tuyến không có nonce bị chặn
- **WHEN** một script nội tuyến không gắn thuộc tính `nonce` được chèn vào DOM của trang
- **THEN** trình duyệt từ chối thực thi script đó và ghi nhận lỗi vi phạm CSP trong console

### Requirement: Duy trì 4 header bảo mật tĩnh hiện có
Hệ thống SHALL tiếp tục gửi kèm 4 header bảo mật tĩnh gồm `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, và `Permissions-Policy` trên mọi phản hồi HTTP.

#### Scenario: Kiểm tra các header bảo mật cơ bản
- **WHEN** client gửi request tới bất kỳ đường dẫn nào của ứng dụng
- **THEN** phản hồi chứa `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- **AND** `Permissions-Policy` cho phép camera cho `self` và chặn microphone, geolocation
