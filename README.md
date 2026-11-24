# Trạm Job Đua Thuyền TGHV — phiên bản 2

## Chức năng
- Giao diện xanh dương pastel – trắng, tương thích điện thoại.
- Thành viên đăng ký; Admin duyệt, từ chối hoặc khóa.
- Thành viên đăng Job với tổng Slot, số hoa, giá và mô tả.
- Thành viên nhận một hoặc nhiều Slot; hệ thống không cho nhận vượt số Slot còn lại.
- Khi Slot đã nhận bằng tổng Slot, Job tự chuyển trạng thái `DONE`.
- Bên đăng Job đóng 1.000đ/job; mỗi thành viên nhận job đóng 1.000đ.
- Mỗi bên gửi ảnh minh chứng JPG/PNG/WEBP tối đa 5MB; Admin xác nhận hoặc từ chối.
- Thông tin liên hệ bị khóa cho đến khi phí bên đăng và phí của thành viên nhận tương ứng được Admin xác nhận.
- Tự ghi nhận phí điều phối 1.000đ khi job đủ Slot và chuyển DONE.
- Admin xem danh sách thành viên, minh chứng và sổ phí điều phối.

## Chạy thử
Yêu cầu Node.js 20+.
1. Giải nén ZIP.
2. Mở terminal tại thư mục dự án, chạy `npm install`.
3. Sao chép `.env.example` thành `.env`.
4. Đổi `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` trong `.env`.
5. Chạy `npm start`, mở `http://localhost:3000`.

Nếu không tạo `.env`, tài khoản thử ban đầu là `admin@example.com` / `ChangeMe123!`. Chỉ dùng local demo, tuyệt đối đổi trước khi công khai.

## Triển khai online
Đây là mã nguồn Node.js + SQLite, chưa được host sẵn. Cần hosting hỗ trợ Node.js 20 và persistent disk/volume gắn tại thư mục `data/`, vì database, session và ảnh minh chứng được lưu tại đây. Cần bật HTTPS và sao lưu thư mục `data/`. Không dùng hosting chỉ có ổ đĩa tạm thời. Thiết lập biến môi trường: `NODE_ENV=production`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`.

## Lưu ý nghiệp vụ
- Mức 1.000đ là số tiền được ghi nhận trong hệ thống; website không tự xác minh giao dịch ngân hàng. Admin phải đối chiếu ảnh minh chứng và xác nhận.
- Bản này ghi phí bên đăng theo mỗi job và phí bên nhận theo mỗi thành viên nhận job; nếu một thành viên nhận nhiều Slot trong cùng job thì vẫn là một khoản phí 1.000đ cho tài khoản nhận job.
- Job chuyển DONE khi đủ Slot, không phụ thuộc trạng thái thanh toán. Tuy nhiên thông tin liên hệ vẫn khóa cho tới khi thanh toán đủ và được Admin xác nhận.
- Cần sao lưu thường xuyên và kiểm thử trên môi trường staging trước khi vận hành thực tế.
