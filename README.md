# Trạm Job Đua Thuyền TGHV

MVP website quản lý Job với giao diện pastel xanh dương – trắng, dùng React + Vite + Supabase.

## Chức năng có trong mã nguồn
- Đăng ký / đăng nhập email và mật khẩu.
- Hồ sơ mới tự tạo ở trạng thái `pending`; Admin duyệt mới được đăng/nhận Job.
- Đăng Job, mô tả và tổng số Slot.
- Thành viên gửi yêu cầu nhận Job; người đăng xác nhận.
- Xác nhận Slot bằng hàm SQL có khóa giao dịch; đủ Slot thì Job tự chuyển `DONE`.
- Mỗi Job có phí 1.000đ cho người đăng (`poster`) và 1.000đ cho người nhận (`receiver`).
- Mỗi bên tải ảnh minh chứng chuyển khoản; Admin duyệt hoặc từ chối.
- Thông tin liên hệ lưu ở bảng riêng `job_contacts`; RLS chỉ cho phép người đăng hoặc người nhận đã được xác nhận đọc khi cả hai khoản phí đã được duyệt.

## Yêu cầu trước khi chạy
- Node.js 20+ (khuyến nghị).
- Một dự án Supabase.

## 1. Cấu hình Supabase
1. Mở Supabase project.
2. Vào **SQL Editor** → **New query**.
3. Mở `supabase/schema.sql`, sao chép toàn bộ nội dung và Run.
4. Vào **Project Settings → API** để lấy Project URL và anon/public key.
5. Copy `.env.example` thành `.env`, điền:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Không bao giờ dùng `service_role` key ở frontend.

## 2. Tạo Admin đầu tiên
1. Chạy website và đăng ký tài khoản bằng email của bạn.
2. Vào Supabase → **Authentication → Users**, sao chép UUID của tài khoản.
3. Vào SQL Editor, chạy:
   ```sql
   update public.profiles
   set role = 'admin', status = 'approved'
   where id = 'YOUR-USER-UUID';
   ```
4. Đăng xuất và đăng nhập lại. Tài khoản này sẽ thấy tab **Quản trị**.

## 3. Chạy trên máy tính
```bash
npm install
npm run dev
```
Mở địa chỉ localhost được Vite hiển thị.

## 4. Deploy lên Vercel
- Đưa toàn bộ thư mục dự án lên GitHub.
- Trong Vercel chọn **Add New → Project** và import repository.
- Thêm Environment Variables giống các biến trong `.env`.
- Deploy.
- Sau khi có domain Vercel, vào Supabase → Authentication → URL Configuration:
  - Site URL: domain Vercel.
  - Redirect URLs: thêm domain Vercel, ví dụ `https://your-project.vercel.app/**`.

## 5. Cấu hình tài khoản ngân hàng
Bản hiện tại yêu cầu Admin trao đổi thông tin tài khoản nhận tiền cho thành viên. Có thể bổ sung thông tin QR/ngân hàng trong giao diện sau khi bạn cung cấp tên ngân hàng, số tài khoản và tên chủ tài khoản.

## Lưu ý quan trọng
- Đây là bản MVP khởi đầu, chưa tích hợp cổng thanh toán tự động; Admin đối chiếu ảnh chuyển khoản thủ công.
- Không nên dùng dữ liệu thật trước khi kiểm thử kỹ RLS, quy trình duyệt, và quyền truy cập.
- Nên bổ sung chính sách xử lý hoàn phí, khiếu nại, hủy Slot và nhật ký kiểm toán trước khi vận hành chính thức.
