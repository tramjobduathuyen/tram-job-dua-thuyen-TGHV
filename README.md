# Trạm Job Đua Thuyền TGHV — mã nguồn

Ứng dụng Node.js + Express + SQLite. Có đăng ký thành viên chờ duyệt, đăng nhập, vai trò Admin/thành viên, tạo job, nhận job, hoàn thành job, khóa/duyệt thành viên, dashboard và sổ giao dịch.

## Chạy trên máy tính
1. Cài Node.js 20 trở lên.
2. Mở thư mục này trong Terminal/Command Prompt.
3. Chạy `npm install`.
4. Sao chép `.env.example` thành `.env`; đổi `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
5. Chạy `npm start`, sau đó mở `http://localhost:3000`.

Lần chạy đầu sẽ tự tạo Admin theo biến môi trường. Nếu không tạo `.env`, mặc định `admin@example.com` / `ChangeMe123!` chỉ để chạy thử cục bộ, không dùng trên Internet.

## Đưa lên Internet
Cần hosting hỗ trợ Node.js 20 và ổ đĩa lưu trữ bền vững (persistent disk/volume) gắn tại thư mục `data/`, vì SQLite lưu dữ liệu ở đó. Build: `npm install`; Start: `npm start`. Cấu hình `NODE_ENV=production`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, bật HTTPS. Nếu hosting không có persistent disk, phải chuyển SQLite sang PostgreSQL trước khi dùng thật.

## Lưu ý
Đây là mã nguồn để chạy thử và triển khai tiếp, chưa phải website đã được xuất bản. Không thể bảo đảm tuyệt đối không lỗi trên mọi hosting; cần cài dependencies và kiểm tra môi trường triển khai. Giao dịch là ghi nhận thủ công, chưa tự xác minh chuyển khoản. Chức năng thu phí 1.000đ trước khi mở liên hệ chưa được tích hợp cổng thanh toán; hiện thông tin liên hệ hiển thị cho người đã đăng nhập. Không đưa mật khẩu Admin mặc định lên hosting.
