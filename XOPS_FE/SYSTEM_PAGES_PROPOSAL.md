# Frontend Structure & Page Proposal 

Dựa trên cấu trúc tham khảo từ hệ thống (`README.md` cũ) và kiến trúc ứng dụng hiện tại (`App.tsx`), dưới đây là tài liệu tổng hợp và đề xuất các trang (Pages) cho cả 3 roles: **Customer (Người dùng/Khách hàng)**, **Staff (Nhân viên nhà hàng)**, và **Admin (Quản trị viên)** trong hệ thống Food Order App.

## I. CUSTOMER (BUYER) - MVP PAGES
### Auth & Visitor
| # | Page Path | Ghi chú ngắn gọn |
|---|---|---|
| 1 | `/onboarding` | Intro giới thiệu app lần đầu |
| 2 | `/login` | Đăng nhập (email/password, social login) |
| 3 | `/register` | Đăng ký tài khoản mới |
| 4 | `/forgot-password` | Quên mật khẩu & reset link *(Đề xuất thêm để hoàn thiện Auth)* |
| 5 | `/` | Trang chủ (Banner, món ăn nổi bật, danh mục) |
| 6 | `/about` | Giới thiệu về ứng dụng |

### Shop & Checkout
| # | Page Path | Ghi chú ngắn gọn |
|---|---|---|
| 7 | `/menu` | Danh sách tất cả món ăn & tìm kiếm/lọc |
| 8 | `/food/:id` | Chi tiết món ăn (thành phần, tuỳ chọn, đánh giá) |
| 9 | `/ai-suggestions` | Gợi ý món ăn an toàn/thay thế (Safe Alternatives) |
| 10 | `/cart` | Giỏ hàng (quản lý món, số lượng, subtotal) |
| 11 | `/checkout` | Thanh toán (thông tin giao hàng, chọn phương thức) |
| 12 | `/success` | Thanh toán thành công & mã đơn hàng |

### Account & Order Tracking
| # | Page Path | Ghi chú ngắn gọn |
|---|---|---|
| 13 | `/profile` | Thông tin cá nhân (Profile Settings) |
| 14 | `/addresses` | Quản lý địa chỉ giao hàng |
| 15 | `/profile/history` | Lịch sử đơn hàng của tôi |
| 16 | `/order-detail` | Chi tiết một đơn hàng cụ thể |
| 17 | `/track-order` | Theo dõi trạng thái đơn hàng (Đang giao/Chuẩn bị chờ nhận) |
| 18 | `/rating` | Đánh giá đơn hàng/món ăn sau khi nhận |
| 19 | `/profile/favorites` | Danh sách món ăn yêu thích |
| 20 | `/vouchers` | Cửa hàng voucher/Danh sách voucher public |
| 21 | `/vouchers/:id` | Chi tiết voucher |
| 22 | `/wallet` hoặc `/profile/wallet` | Ví voucher của cá nhân |
| 23 | `/membership` | Cấp bậc thành viên & Quyền lợi VIP |

## II. STAFF (RESTAURANT KITCHEN/CS) - MVP PAGES
Mục đích: Nhân viên/Bếp quản lý đơn hàng theo thời gian thực, chuẩn bị món, giao tiếp khách hàng và cập nhật tồn kho nhanh.

| # | Page Path | Ghi chú ngắn gọn |
|---|---|---|
| 24 | `/staff/login` | Đăng nhập cho nhân viên |
| 25 | `/staff` | Dashboard tổng quan ca làm việc (đơn mới, cần làm) |
| 26 | `/staff/orders` | Quản lý Đơn hàng (Tiếp nhận -> Đang nấu -> Giao đối tác) |
| 27 | `/staff/menu` | Quản lý tình trạng món ăn trong ngày (hết hạn, bật/tắt món do hết nguyên liệu) |
| 28 | `/staff/customers` | Danh sách khách hàng hiện tại (chủ yếu để hỗ trợ) |
| 29 | `/staff/customers/:id` | Chi tiết khách hàng (lịch sử khiếu nại, hỗ trợ theo đơn) |
| 30 | `/staff/notifications` | Thông báo đơn hàng mới *(Đề xuất thêm)* |

## III. ADMIN PANEL - MVP PAGES
Mục đích: Quản trị toàn hệ thống, doanh thu, menu tổng, nhân viên, chiến dịch khuyến mãi và phân tích chỉ số cấp cao.

| # | Page Path | Ghi chú ngắn gọn |
|---|---|---|
| 31 | `/admin/login` | Đăng nhập admin |
| 32 | `/admin` | Dashboard báo cáo tổng quan (Revenue, Users, Orders, KPI) |
| 33 | `/admin/menu` | Quản lý Menu (Tạo mới, sửa, xoá món ăn toàn hệ thống, set giá) |
| 34 | `/admin/inventory` | Quản lý Kho nguyên liệu/Tồn kho |
| 35 | `/admin/orders` | Theo dõi toàn bộ Đơn hàng của hệ thống và xử lý tranh chấp |
| 36 | `/admin/delivery` | Quản lý Vận chuyển/Tài xế/Đối tác giao hàng |
| 37 | `/admin/customers` | Quản lý người dùng (Block, cấp điểm thành viên thủ công) |
| 38 | `/admin/staff` | Quản lý Nhân viên (Tạo tài khoản, phân quyền, ca làm) |
| 39 | `/admin/reviews` | Quản trị Đánh giá & Phản hồi từ khách (Duyệt/Xoá comment) |
| 40 | `/admin/vouchers` | Quản trị Khuyến mãi & Voucher toàn hệ thống (Tạo code mới) |
| 41 | `/admin/analytics` | Phân tích chuyên sâu (Doanh thu, hành vi, món bán chạy nhất) |
| 42 | `/admin/settings` | Cài đặt hệ thống (Phí vận chuyển chung, payment gateways) |

---

## IV. TÁI SỬ DỤNG COMPONENTS (CHUYẾN LƯỢC TỐI ƯU CODE)

Dựa trên cấu trúc của React Router hiện tại, hệ thống có thể tối ưu tái sử dụng các components sau giữa các role:

### 1. Phân quyền và Layouts chung
- **Auth Component:** Forms login có thể dùng chung thay vì làm lại, chỉ thay đổi API endpoint để lấy token tương ứng. Hoặc dùng chung 1 logic `/login` sau đó điều hướng tuỳ thuộc vào Payload của JWT Role.
- **Table & Pagination (`<DataTable />`):** Dùng chung bảng danh sách (orders, menu, customers) cho `/admin/*` và `/staff/*`. Tái sử dụng >90% logic hiển thị, chỉ truyền thêm các cột actions khác nhau.

### 2. Dashboard Stats & Charts
- Tái sử dụng các thẻ thống kê `<StatCard />` (Số đơn hôm nay, Doanh thu ca này) cho `/admin` và `/staff`.
- Biểu đồ (`<RevenueChart />`, `<OrdersChart />`) chia sẻ chung logic UI, Admin load theo tháng/năm, Staff load theo ca/ngày.

### 3. Order Management (Quản lý đơn hàng)
- `<OrderTimeline />`: Component theo dõi trạng thái từ lúc đặt tới lúc giao có thể dùng cả ở `/track-order` (cho Customer) và phần chi tiết ở `/staff/orders` & `/admin/orders`.
- Workflow Status dùng chung 1 Enum 1 thẻ `<StatusBadge />` (vd: `PENDING`, `PREPARING`, `DELIVERING`, `COMPLETED`).

### 4. Menu & Food Component
- `<FoodCard />`: Dùng chung trên `/`, `/menu`, `/profile/favorites`, `/ai-suggestions`.
- `<FoodForm />`: Admin dùng form này ở `/admin/menu` để tạo full món mới, Staff có thể tái sử dụng một mode `readonly=true` ngoại trừ nút "Tạm thả/ẩn món".

### 5. Profile & Forms
- Form form chỉnh sửa thông tin User `<ProfileForm />` dùng ở `/profile` và tái sử dụng cho `<StaffProfile />` và cho popup chỉnh sửa `<UserEditModal />` bên Admin.

## V. CÁC TRANG VÀ FLOW ĐỀ XUẤT BỔ SUNG ĐỂ HOÀN THIỆN
1. **Flow Quên Mật Khẩu (`/forgot-password`)**: Đặc biệt quan trọng đối với Customer account.
2. **Global Handle 404 (`/404`)**: Page thông báo "Trang không tồn tại" chung thay vì redirect thẳng về root.
3. **Phân biệt luồng Login riêng biệt (Tuỳ chọn)**: Có thể cung cấp `/staff/login` và `/admin/login` để tăng bảo mật đối với người dùng nội bộ.
4. **Phân trang & Lọc cho Menu**: Bổ sung bộ lọc cho danh mục món ăn (dựa trên categories) ở `/menu` nếu chưa có.
5. **Flow Notifications (`/profile/notifications`)**: Trung tâm thông báo để lưu trữ khuyến mãi hoặc thông báo đơn hàng đang tới cho user thay vì chỉ rely vào SMS/Email.
