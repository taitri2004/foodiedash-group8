# FoodieDash Backend (XOPS_BE)

REST API + WebSocket server cho ứng dụng đặt đồ ăn FoodieDash, được xây dựng bằng **Node.js + Express + TypeScript** và kết nối **MongoDB/DocumentDB**.

---

## Mục lục

- [Kiến trúc tổng quan](#kiến-trúc-tổng-quan)
- [Tech Stack](#tech-stack)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Cài đặt & Chạy local](#cài-đặt--chạy-local)
- [Biến môi trường](#biến-môi-trường)
- [API Endpoints](#api-endpoints)
- [Models (Database)](#models-database)
- [WebSocket Events](#websocket-events)
- [Authentication & Authorization](#authentication--authorization)
- [Docker](#docker)
- [Deploy lên AWS ECS](#deploy-lên-aws-ecs)

---

## Kiến trúc tổng quan

```
Client (FE / Mobile)
        │
        ▼
  API Gateway (HTTP)
        │
        ▼
  Internal ALB
        │
        ▼
  ECS Fargate (XOPS_BE)
   ├── Express REST API  (port 4000)
   ├── Socket.io Server  (same port)
   ├── Mongoose → DocumentDB (MongoDB 5.0)
   ├── Cloudinary (file storage)
   ├── Nodemailer / Gmail SMTP (email)
   ├── PayOS (payment gateway)
   └── Gemini + Groq (AI recommendations)
```

---

## Tech Stack

| Thành phần | Công nghệ |
|---|---|
| Runtime | Node.js 22.x |
| Language | TypeScript 5.x |
| Framework | Express 4.21 |
| Database | MongoDB / AWS DocumentDB 5.0 |
| ODM | Mongoose 8.2 |
| Real-time | Socket.io 4.8 |
| Auth | JWT (access + refresh token) |
| File storage | Cloudinary |
| Email | Nodemailer + Gmail SMTP |
| Payment | PayOS |
| AI | Google Gemini + Groq SDK |
| Validation | Zod |
| Task scheduling | node-cron |
| Containerization | Docker (node:20-alpine) |

---

## Cấu trúc thư mục

```
XOPS_BE/
├── src/
│   ├── config/           # Cấu hình DB, Cloudinary, Multer, Email, PayOS
│   ├── constants/        # Env vars, HTTP codes, error codes, regex
│   ├── controllers/      # Route handlers (22 controllers)
│   ├── middlewares/      # authenticate, authorize, errorHandler, customResponse
│   ├── models/           # Mongoose schemas (17 models)
│   ├── routes/           # Định nghĩa API routes (13 file)
│   ├── seeds/            # Script seed dữ liệu mẫu
│   ├── services/         # Business logic (15 services)
│   ├── types/            # TypeScript interfaces & DTOs
│   ├── utils/            # Helper functions (18 utils)
│   ├── validators/       # Zod validation schemas
│   └── index.ts          # App entry point + Socket.io setup
├── .env                  # Biến môi trường local
├── .env.production       # Biến môi trường production (không load tự động)
├── Dockerfile
├── global-bundle.pem     # TLS cert cho AWS DocumentDB
├── tsconfig.json
└── package.json
```

---

## Cài đặt & Chạy local

### Yêu cầu

- Node.js 22.x (`nvm use` nếu đã có `.nvmrc`)
- MongoDB đang chạy local hoặc connection string tới Atlas/DocumentDB

### Bước 1 — Clone & install

```bash
git clone <repo-url>
cd XOPS_BE
npm install
```

### Bước 2 — Tạo file `.env`

Copy từ template và điền giá trị (xem phần [Biến môi trường](#biến-môi-trường)):

```bash
cp .env.example .env
```

### Bước 3 — Seed dữ liệu mẫu (tuỳ chọn)

```bash
npm run seed:products
npm run seed:vouchers
npm run seed:users
npm run seed:orders
```

### Bước 4 — Chạy dev server

```bash
npm run dev
```

Server khởi động tại `http://localhost:4000` (hoặc PORT trong `.env`).

---

## Biến môi trường

> **Lưu ý production:** Khi `NODE_ENV=production`, file `.env.production` **không được đọc tự động**. Tất cả biến phải được inject qua ECS Task Definition hoặc AWS Secrets Manager.

Tạo file `.env` với các key sau:

```env
# App
NODE_ENV=development
PORT=4000
APP_ORIGIN=http://localhost:5173

# Database
MONGODB_URI=mongodb://localhost:27017/foodiedash

# JWT Auth
AUTH_JWT_SECRET=<your-secret>
AUTH_JWT_REFRESH_SECRET=<your-refresh-secret>
AUTH_ACCESS_TOKEN_TTL_MINUTES=10080    # 7 ngày (mặc định)
AUTH_REFRESH_TOKEN_TTL_DAYS=30         # 30 ngày (mặc định)

# Email (Gmail SMTP)
GOOGLE_APP_USER=your-email@gmail.com
GOOGLE_APP_PASSWORD=xxxx xxxx xxxx xxxx   # Gmail App Password

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# AI
GEMINI_API_KEY=your-gemini-key
GROQ_API_KEY=your-groq-key

# PayOS
PAYOS_CLIENT_ID=your-client-id
PAYOS_API_KEY=your-api-key
PAYOS_CHECKSUM_KEY=your-checksum-key
```

---

## API Endpoints

Base URL: `https://<domain>/api`

Health check: `GET /api/health` → `{ "status": "ok" }`

### Auth — `/api/auth`

| Method | Path | Mô tả | Auth |
|--------|------|--------|------|
| POST | `/register` | Đăng ký tài khoản | |
| POST | `/login` | Đăng nhập | |
| POST | `/logout` | Đăng xuất | ✓ |
| POST | `/refresh` | Làm mới access token | |
| GET | `/me` | Thông tin user hiện tại | ✓ |
| POST | `/verify-email` | Xác thực email | |
| POST | `/resend-verify-email` | Gửi lại email xác thực | |
| POST | `/password/forgot` | Quên mật khẩu (gửi OTP) | |
| POST | `/password/verify-otp` | Xác thực OTP | |
| POST | `/password/reset` | Đặt lại mật khẩu | |

### User — `/api/users`

| Method | Path | Mô tả | Auth |
|--------|------|--------|------|
| GET | `/me` | Lấy profile | ✓ |
| PATCH | `/me` | Cập nhật profile | ✓ |
| PATCH | `/me/password` | Đổi mật khẩu | ✓ |
| PATCH | `/me/avatar` | Cập nhật avatar | ✓ |
| GET | `/me/points` | Lịch sử điểm thưởng | ✓ |
| GET | `/me/membership` | Thông tin membership | ✓ |
| POST | `/me/referral/claim` | Nhận thưởng referral | ✓ |

### Products — `/api/products`

| Method | Path | Mô tả | Auth |
|--------|------|--------|------|
| GET | `/` | Danh sách sản phẩm | |
| GET | `/categories` | Danh sách danh mục | |
| GET | `/:id` | Chi tiết sản phẩm | |
| GET | `/recommendations` | Gợi ý AI | ✓ |
| GET | `/safe-foods` | Thực phẩm phù hợp sức khoẻ | ✓ |
| POST | `/` | Tạo sản phẩm | ADMIN |
| PUT | `/:id` | Cập nhật sản phẩm | ADMIN |
| DELETE | `/:id` | Xoá sản phẩm | ADMIN |

### Orders — `/api/orders`

| Method | Path | Mô tả | Auth |
|--------|------|--------|------|
| POST | `/` | Đặt đơn mới | ✓ |
| GET | `/me` | Lịch sử đơn hàng | ✓ |
| GET | `/:idOrCode` | Chi tiết đơn | ✓ |
| PATCH | `/:id/cancel` | Huỷ đơn | ✓ |
| GET | `/` | Tất cả đơn hàng | ADMIN/STAFF |
| PATCH | `/:id/status` | Cập nhật trạng thái | ADMIN/STAFF |
| PATCH | `/:id/confirm` | Xác nhận đơn | STAFF/ADMIN |
| PATCH | `/:id/reject` | Từ chối đơn | STAFF/ADMIN |
| PATCH | `/:id/ready` | Đơn sẵn sàng giao | STAFF/ADMIN |
| PATCH | `/:id/deliver` | Bắt đầu giao | STAFF/ADMIN |
| PATCH | `/:id/complete` | Hoàn thành giao | STAFF/ADMIN |
| GET | `/revenue/weekly` | Doanh thu tuần | ADMIN |
| GET | `/dashboard/stats` | Thống kê dashboard | ADMIN |

### Cart — `/api/cart` (yêu cầu auth)

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/` | Lấy giỏ hàng |
| POST | `/items` | Thêm sản phẩm |
| PATCH | `/items` | Cập nhật số lượng |
| DELETE | `/items` | Xoá sản phẩm |
| POST | `/merge` | Merge giỏ hàng (guest → logged in) |
| DELETE | `/` | Xoá toàn bộ giỏ |

### Vouchers — `/api/vouchers`

| Method | Path | Mô tả | Auth |
|--------|------|--------|------|
| GET | `/` | Danh sách voucher | |
| GET | `/code/:code` | Tìm theo mã | |
| GET | `/:id` | Chi tiết voucher | |
| POST | `/validate` | Kiểm tra voucher hợp lệ | |
| POST | `/` | Tạo voucher | ADMIN |
| PUT | `/:id` | Cập nhật voucher | ADMIN |
| DELETE | `/:id` | Xoá voucher | ADMIN |
| POST | `/:id/use` | Áp dụng voucher | ✓ |

### Payments — `/api/payments`

| Method | Path | Mô tả |
|--------|------|--------|
| POST | `/webhook/payos` | PayOS webhook |
| GET | `/payos/cancel` | Callback huỷ thanh toán |

### Reviews — `/api/reviews`

| Method | Path | Mô tả | Auth |
|--------|------|--------|------|
| GET | `/product/:productId` | Reviews của sản phẩm | |
| GET | `/order/:orderId` | Reviews của đơn | ✓ |
| POST | `/` | Tạo review | ✓ |

### Notifications — `/api/notifications` (yêu cầu auth)

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/` | Danh sách thông báo |
| GET | `/unread-count` | Số thông báo chưa đọc |
| PATCH | `/read-all` | Đánh dấu tất cả đã đọc |
| PATCH | `/:id/read` | Đánh dấu 1 thông báo đã đọc |

### Support Chat — `/api/support` (yêu cầu auth)

| Method | Path | Mô tả | Role |
|--------|------|--------|------|
| POST | `/conversations` | Tạo / lấy cuộc trò chuyện | CUSTOMER |
| GET | `/conversations` | Danh sách hội thoại | CUSTOMER |
| GET | `/conversations/:id/messages` | Tin nhắn trong cuộc trò chuyện | ✓ |
| POST | `/conversations/:id/messages` | Gửi tin nhắn | ✓ |
| PATCH | `/conversations/:id/read` | Đánh dấu đã đọc | ✓ |
| PATCH | `/conversations/:id/close` | Đóng cuộc trò chuyện | ✓ |
| GET | `/staff/conversations` | Danh sách cho staff | STAFF |
| GET | `/settings` | Cấu hình support | ✓ |
| POST | `/settings` | Cập nhật cấu hình | ADMIN/STAFF |

### Admin — `/api/admin`

| Method | Path | Mô tả |
|--------|------|--------|
| POST | `/staff` | Tạo tài khoản nhân viên |
| GET | `/staff` | Danh sách nhân viên |
| PATCH | `/staff/:id` | Cập nhật trạng thái nhân viên |
| GET | `/customers` | Danh sách khách hàng |
| GET | `/customers/:userId/incidents` | Vi phạm của khách |
| GET | `/cash-control` | Kiểm soát tiền mặt |
| POST | `/collect-cash` | Thu tiền |
| GET | `/reviews` | Tất cả reviews |
| POST | `/reviews/:reviewId/reply` | Phản hồi review |
| GET | `/ingredients` | Quản lý nguyên liệu |
| GET | `/inventory` | Tồn kho |
| GET | `/shippers` | Danh sách shipper |
| GET | `/deliveries/active` | Giao hàng đang hoạt động |
| GET | `/dispatch/pending-orders` | Đơn chờ điều phối |
| POST | `/dispatch/assign` | Giao đơn cho shipper |

### Settings — `/api/settings`

| Method | Path | Mô tả | Auth |
|--------|------|--------|------|
| GET | `/` | Lấy cài đặt ứng dụng | |
| PUT | `/` | Cập nhật cài đặt | ADMIN |

---

## Models (Database)

| Model | Collection | Mô tả |
|-------|-----------|--------|
| UserModel | users | Tài khoản người dùng (ADMIN/STAFF/CUSTOMER) |
| RefreshTokenModel | refreshtokens | JWT refresh tokens |
| VerificationModel | verificationcodes | OTP / email verification |
| ProductModel | products | Danh mục sản phẩm |
| CartModel | carts | Giỏ hàng |
| OrderModel | orders | Đơn hàng |
| VoucherModel | vouchers | Mã giảm giá |
| ReviewModel | reviews | Đánh giá sản phẩm/đơn hàng |
| NotificationModel | notifications | Thông báo push |
| PaymentRequestModel | paymentrequests | Yêu cầu thanh toán PayOS |
| PointTransactionModel | pointtransactions | Lịch sử điểm thưởng |
| FileModel | files | Metadata file upload |
| AuditLogModel | auditlogs | Audit log hệ thống |
| SupportConversationModel | supportconversations | Cuộc trò chuyện hỗ trợ |
| SupportMessageModel | supportmessages | Tin nhắn hỗ trợ |
| SupportSettingsModel | supportsettings | Cấu hình support |
| SettingsModel | settings | Cấu hình ứng dụng |

---

## WebSocket Events

Server dùng **Socket.io**, kết nối qua cùng port với REST API.

### Auth khi connect

Gửi access token qua 1 trong 3 cách:
1. Cookie `accessToken`
2. `socket.handshake.auth.accessToken`
3. Header `Authorization: Bearer <token>`

### Events

| Event | Chiều | Mô tả |
|-------|-------|--------|
| `support:join` | Client → Server | Tham gia room hội thoại support |
| `support:message` | Server → Client | Nhận tin nhắn mới |
| `notification` | Server → Client | Nhận thông báo real-time |

Mỗi user được join vào room riêng `user:<userId>` sau khi xác thực.

---

## Authentication & Authorization

### Luồng xác thực

```
1. POST /api/auth/login
   → Trả về: accessToken (cookie) + refreshToken (cookie)

2. Mọi request cần auth:
   → Gửi cookie accessToken TỰ ĐỘNG (credentials: 'include')
   → Hoặc Header: Authorization: Bearer <accessToken>

3. Khi accessToken hết hạn:
   → POST /api/auth/refresh (dùng refreshToken cookie)
   → Nhận accessToken mới
```

### Roles

| Role | Quyền |
|------|-------|
| `ADMIN` | Toàn quyền |
| `STAFF` | Quản lý đơn hàng, hỗ trợ khách |
| `CUSTOMER` | Đặt đơn, chat, review |

---

## Docker

### Build image

```bash
docker build -t foodiedash-be .
```

### Chạy container

```bash
docker run -p 4000:4000 \
  --env-file .env \
  foodiedash-be
```

### Notes

- Base image: `node:20-alpine`
- File `global-bundle.pem` được copy vào `/app/global-bundle.pem` để kết nối DocumentDB qua TLS
- Dùng `ts-node --transpile-only` để chạy trực tiếp TypeScript (không compile ra JS)
- Không có `HEALTHCHECK` trong Dockerfile — health check được cấu hình tại ALB Target Group

---

## Deploy lên AWS ECS

### Thông tin infrastructure

| Resource | Value |
|----------|-------|
| Account ID | 975050167301 |
| Region | ap-southeast-1 |
| ECR | `975050167301.dkr.ecr.ap-southeast-1.amazonaws.com/foodiedash-be` |
| ECS Cluster | `foodiedash-cluster` |
| Task Definition | `foodiedash-be-task` |
| Container port | 4000 |
| Health check | `GET /api/health` |

### Push image lên ECR

```bash
# Login ECR
aws ecr get-login-password --region ap-southeast-1 \
  | docker login --username AWS \
    --password-stdin 975050167301.dkr.ecr.ap-southeast-1.amazonaws.com

# Build & tag
docker build -t foodiedash-be .
docker tag foodiedash-be:latest \
  975050167301.dkr.ecr.ap-southeast-1.amazonaws.com/foodiedash-be:latest

# Push
docker push 975050167301.dkr.ecr.ap-southeast-1.amazonaws.com/foodiedash-be:latest
```

### Update service (deploy lại)

```bash
aws ecs update-service \
  --cluster foodiedash-cluster \
  --service foodiedash-be-service \
  --force-new-deployment \
  --region ap-southeast-1
```

### Biến môi trường trong ECS

Tất cả env vars được lưu tại **AWS Secrets Manager** (`/foodiedash/app`) và inject vào container lúc runtime.

> **Quan trọng:** Đảm bảo `PORT=4000` khớp với container port mapping trong Task Definition.

---

## Scripts

```bash
npm run dev              # Dev server với hot-reload (ts-node-dev)
npm run start            # Production server (ts-node)
npm run build            # Build TypeScript → dist/
npm run test             # Chạy test với Jest
npm run seed:products    # Seed sản phẩm mẫu
npm run seed:vouchers    # Seed vouchers mẫu
npm run seed:users       # Seed users mẫu
npm run seed:orders      # Seed đơn hàng mẫu
```
