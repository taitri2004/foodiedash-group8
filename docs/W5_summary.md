# Week 5 — The Network Fortress: Tổng Kết
**Group 8 — FoodieDash** | Account: `910012064913` | Region: `us-west-2` | Ngày: 2026-05-13 → 2026-05-14

---

## 1. TỔNG QUAN INFRASTRUCTURE ĐÃ DEPLOY

| Thành phần | Giá trị |
|---|---|
| VPC | `vpc-0bb08d9d8879766e6` |
| CloudFront (FE) | `https://dywbriqynkljb.cloudfront.net` |
| API Gateway | `https://0qkzha0e29.execute-api.us-west-2.amazonaws.com` |
| ECR | `910012064913.dkr.ecr.us-west-2.amazonaws.com/foodiedash-be` |
| ECS | `foodiedash-cluster` — Running: **1/1** ✅ |
| DocumentDB | `foodiedash-docdb-cluster.cluster-cxssa6wm4z16.us-west-2.docdb.amazonaws.com` |
| EFS | `fs-0563aa506ddf480ed` |
| Bedrock KB | `LJI4OC7YY6` (Data Source: `CELY77CNW0`) |

---

## 2. NHỮNG GÌ ĐÃ LÀM ✅

### 2.1 Chuẩn bị tài khoản mới (910012064913)
- Chuyển toàn bộ Terraform config từ account cũ (490178243777) sang account mới
- Cập nhật `terraform.tfvars` với đầy đủ credentials thật: Cloudinary, Gemini, Groq, PayOS, Google SMTP, JWT secrets
- Chạy `terraform apply` tổng cộng **3 lần** (init → full deploy → secrets update → KB IDs)

### 2.2 MH1 — VPC Flow Logs ✅
**Lựa chọn:** Single-VPC (Path C — Justified)

**Lý do chọn Single-VPC:**
- FoodieDash là 1 product duy nhất, tất cả tier (BE / DB / EFS) có cùng yêu cầu bảo mật → không cần isolation qua VPC peering
- Greenfield app, toàn bộ component trong cùng account/region
- Multi-VPC chỉ cần khi: nhiều team độc lập, compliance khác nhau giữa các môi trường, hoặc blast radius cần cách ly hoàn toàn

**Resources đã tạo:**
```
CloudWatch Log Group : /aws/vpc/flowlogs/foodiedash  (retention 7 ngày)
IAM Role             : vpc-flow-logs-role
Flow Log             : vpc-0bb08d9d8879766e6, TrafficType=ALL → CloudWatch
```

### 2.3 MH2 — AWS Network Firewall ✅
**Lựa chọn:** Path A (bắt buộc vì có NAT Gateway)

**Lý do chọn Path A:**
- VPC đang dùng NAT Gateway cho egress → Firewall phải nằm **giữa** private subnets và NAT để inspect traffic
- Path B (dùng Gateway Load Balancer) phức tạp hơn và không cần thiết cho use case này

**Traffic flow:**
```
ECS Container (private_app) → Firewall Endpoint (per-AZ) → NAT Gateway → Internet
```

**Egress allowlist (chỉ cho phép domain cần thiết):**
| Domain | Mục đích |
|---|---|
| `.cloudinary.com` | Upload/serve ảnh |
| `.googleapis.com`, `.google.com` | Gemini API, Gmail SMTP |
| `api.groq.com` | Groq AI |
| `.payos.vn` | Thanh toán |
| `.amazonaws.com` | ECR, Secrets Manager, Bedrock, S3 |
| `registry-1.docker.io`, `.docker.io` | Docker image pull |

**Resources đã tạo:**
```
Firewall subnets   : 10.0.192.0/24 (AZ-a), 10.0.193.0/24 (AZ-b)
Rule Group         : foodiedash-egress-domain-allowlist (STATEFUL, ALLOWLIST)
Firewall Policy    : stateless forward → SFE, unmatched HTTP/HTTPS → DROP (native)
Network Firewall   : foodiedash-network-firewall (2 AZs)
CloudWatch logs    : /aws/network-firewall/foodiedash/alert + /flow
```

**Lưu ý kỹ thuật quan trọng:**
- ALLOWLIST rule group với `DEFAULT_ACTION_ORDER` tự động DROP traffic không match → KHÔNG cần `stateful_default_actions` trong policy
- Thêm `stateful_engine_options { rule_order = "STRICT_ORDER" }` sẽ gây lỗi vì rule group đã tạo với DEFAULT_ACTION_ORDER

### 2.4 MH3 — Amazon EFS + AWS Backup + Restore Test ✅

**EFS:**
```
File System ID : fs-0563aa506ddf480ed
Encrypted      : true (KMS key: 48c2a546-1e0d-4975-aaba-283347cad5e2)
Lifecycle      : AFTER_30_DAYS → Infrequent Access
Mount path     : /mnt/efs (trong ECS container)
Transit Encrypt: ENABLED, IAM auth: ENABLED
```

**Backup Plan:**
```
Vault     : foodiedash-backup-vault
Schedule  : cron(0 3 * * ? *) — 3AM UTC hàng ngày
Retention : 7 ngày
Covers    : EFS fs-0563aa506ddf480ed + DocumentDB cluster
```

**On-demand backup (chạy ngày 2026-05-13):**
```
BackupJobId      : 452902c6-44d3-4c83-bce9-ea9ff5496b9e
State            : COMPLETED (100%)
RecoveryPointArn : arn:aws:backup:us-west-2:910012064913:recovery-point:f98f0350-e4c3-4e7a-998d-4d0d2444654d
```

**Restore test (chạy ngày 2026-05-13):**
```
RestoreJobId       : 5470803d-8251-49cd-bfbb-366beb583d2f
Status             : COMPLETED (100%) ✅
CreatedResourceArn : arn:aws:elasticfilesystem:us-west-2:910012064913:file-system/fs-0cbed9b73103297c1
New EFS ID         : fs-0cbed9b73103297c1 (restored từ fs-0563aa506ddf480ed)
```
> ⚠️ EFS restore cần 3 keys bắt buộc: `file-system-id` + `newFileSystem=true` + `KmsKeyId` (lấy từ `get-recovery-point-restore-metadata`)

### 2.5 MH4 — API Gateway Lambda Authorizer + Throttling ✅

**Throttling (stage `$default`):**
```
Rate limit  : 50 requests/giây
Burst limit : 100 requests
```

**Lambda Authorizer:**
```
Function       : foodiedash-api-authorizer (Node.js 20.x, 128MB, 5s)
Type           : REQUEST (payload format 2.0, simple responses)
Identity source: $request.header.x-api-key
TTL cache      : 300 giây
Protected route: POST /api/ai/ask
Valid API key  : foodiedash-secret-key-2025
```

**Kết quả test (2026-05-13):**

| Test case | x-api-key header | HTTP Status | Kết quả |
|---|---|---|---|
| Không có key | _(không gửi)_ | **401 Unauthorized** | ✅ API GW từ chối (identity source missing) |
| Sai key | `wrong-key` | **403 Forbidden** | ✅ Lambda trả `isAuthorized: false` |
| Đúng key | `foodiedash-secret-key-2025` | **200** | ✅ Auth passed, AI response returned |

### 2.6 MH5 — Lambda Provisioned Concurrency ✅

**Mục tiêu:** Loại bỏ cold start cho `foodiedash-ai-handler` (init_duration ~800ms → 0ms)

```
Function   : foodiedash-ai-handler (publish=true → tạo numbered version)
Alias      : live → trỏ vào version được publish
PC config  : 1 provisioned concurrent execution trên alias "live"
Chi phí    : ~$0.015/hour (us-west-2)
```

> ⚠️ Cần `publish = true` trên function trước → tạo alias → gắn PC vào alias (không phải $LATEST)

### 2.7 Deploy Pipeline ✅

| Bước | Lệnh | Kết quả |
|---|---|---|
| Docker build | `docker build -t foodiedash-be .` | ✅ Cached, 0.3s |
| ECR push | `docker push ...foodiedash-be:latest` | ✅ All layers pushed |
| FE build | `npm run build` (Vite) | ✅ 3373 modules, 2.42s |
| S3 sync | `aws s3 sync dist/ s3://foodiedash-fe-910012064913/` | ✅ 14 files |
| CloudFront | Invalidation `/*` trên `E33B8KW9AZSQ6S` | ✅ |
| ECS | `--force-new-deployment` | ✅ Running 1/1 |
| Bedrock KB | `LJI4OC7YY6` wired vào Lambda env vars | ✅ |

---

## 3. DMS MIGRATION — MongoDB Atlas → DocumentDB (2026-05-14) ✅

### 3.1 Kết quả migration

**Source:** Atlas `ac-ckiqwh3-shard-00-00.p5g94vc.mongodb.net:27017`  
**Target:** DocumentDB `foodiedash-docdb-cluster`, database `foa`  
**Task:** `foodiedash-migrate-task` — Full Load, Provisioned mode

**16/17 collections migrated thành công:**

| Collection | Rows | Status |
|---|---|---|
| users, orders, notifications, reviews | nhiều | ✅ |
| products | 25 | ✅ API đang serve |
| paymentrequests | 0 | ⚠️ Collection rỗng trong Atlas |

### 3.2 Các lỗi đã fix trong quá trình DMS

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `Failed to resolve 'foa.p5g94vc.mongodb.net'` | Hostname SRV không có A record | Dùng shard hostname: `ac-ckiqwh3-shard-00-00.p5g94vc.mongodb.net` |
| API trả về `data: []` | MONGODB_URI thiếu `/foa` database name | Thêm `/foa` vào URI |
| ECS task fail `invalid character` | Secret ghi với UTF-8 BOM | Dùng `[System.IO.File]::WriteAllText(..., UTF8Encoding(false))` |
| `MongoServerError: Unsupported mechanism [-301]` | App dùng SCRAM-SHA-256, DocDB chỉ support SCRAM-SHA-1 | Thêm `&authMechanism=SCRAM-SHA-1` vào URI |

### 3.3 MONGODB_URI cuối cùng

```
mongodb://foodiedashAdmin:FoodieDash2026W5@foodiedash-docdb-cluster.cluster-cxssa6wm4z16.us-west-2.docdb.amazonaws.com:27017/foa?tls=true&tlsCAFile=/app/global-bundle.pem&replicaSet=rs0&retryWrites=false&authMechanism=SCRAM-SHA-1
```

---

## 4. CÁC VẤN ĐỀ ĐÃ GẶP VÀ CÁCH SỬA

| Vấn đề | Nguyên nhân | Cách sửa |
|---|---|---|
| DocDB password lỗi | Password `FoodieDash@2026!` chứa ký tự `@` không hợp lệ | Đổi thành `FoodieDash2026W5` |
| Network Firewall policy lỗi `StatefulDefaultActions` | ALLOWLIST rule group dùng DEFAULT_ACTION_ORDER, không tương thích với STRICT_ORDER | Xóa `stateful_engine_options` và `stateful_default_actions` khỏi policy |
| Lambda duplicate function name | `ai_handler_versioned` trùng tên với `ai_handler` | Xóa function riêng, thêm `publish = true` trực tiếp vào `ai_handler` |
| Terraform chưa cài | Không có quyền admin để `choco install` | Download binary trực tiếp vào `C:\Users\ADMIN\terraform-bin\` |
| EFS restore thiếu key | `get-recovery-point-restore-metadata` trả về `file-system-id` nhưng còn cần `KmsKeyId` | Lấy KMS key từ `aws efs describe-file-systems` rồi thêm vào metadata |
| PowerShell pipe `\|` mất env vars | `aws ... \| docker login` không truyền AWS_SESSION_TOKEN sang process mới | Dùng `$token = aws ecr get-login-password` rồi `docker login --password $token` |
| `TF_CLI_ARGS` gây lỗi "Too many arguments" | Env var được set trong PowerShell session trước vẫn còn | Dùng Bash với `export` thay vì PowerShell cho terraform |
| DMS Atlas SRV hostname fail | `foa.p5g94vc.mongodb.net` là SRV alias, không có A record | Dùng `ac-ckiqwh3-shard-00-00.p5g94vc.mongodb.net` |
| API trả về `data: []` sau DMS | MONGODB_URI thiếu tên database `/foa` | Thêm `/foa` vào URI trước `?` |
| ECS fail `invalid character` khi update secret | PowerShell `Out-File -Encoding utf8` thêm BOM | Dùng `[System.IO.File]::WriteAllText(path, json, UTF8Encoding(false))` |
| `MongoServerError: Unsupported mechanism` | MongoDB driver dùng SCRAM-SHA-256, DocumentDB chỉ support SCRAM-SHA-1 | Thêm `&authMechanism=SCRAM-SHA-1` vào URI |
| Authorizer luôn trả 403 | `VALID_API_KEY` env var chưa được set trong Lambda | Set qua `aws lambda update-function-configuration --environment` |

---

## 5. CẤU TRÚC FILE TERRAFORM

```
files_tf_deploy/
├── main.tf                  # Provider config
├── variables.tf             # Khai báo variables
├── terraform.tfvars         # Giá trị thật (KHÔNG commit lên git)
├── vpc.tf                   # VPC + subnets + MH1 Flow Logs
├── network_firewall.tf      # MH2 Network Firewall (NEW)
├── efs_backup.tf            # MH3 EFS + AWS Backup (NEW)
├── security_groups.tf       # Security groups
├── docdb.tf                 # DocumentDB cluster
├── ecs.tf                   # ECS Fargate + task definition (updated: EFS mount)
├── apigateway_lambda.tf     # MH4 Lambda Authorizer + MH5 PC (updated)
├── s3_cloudfront.tf         # S3 + CloudFront
├── secrets.tf               # Secrets Manager
├── outputs.tf               # Terraform outputs
└── lambda/
    ├── authorizer/
    │   └── index.js         # Lambda Authorizer code
    ├── ai_handler/
    │   └── index.js         # AI handler (Bedrock RAG)
    └── sync_kb/
        └── index.js         # KB sync từ API → S3 → Bedrock
```

---

## 6. QUICK REFERENCE — LỆNH HAY DÙNG

```powershell
# Set AWS credentials (lấy mới từ Console mỗi ~4 tiếng)
$env:AWS_DEFAULT_REGION = "us-west-2"
$env:AWS_ACCESS_KEY_ID = "<KEY_ID>"
$env:AWS_SECRET_ACCESS_KEY = "<SECRET>"
$env:AWS_SESSION_TOKEN = "<TOKEN>"

# Terraform apply
cd C:\Users\ADMIN\Downloads\files_tf_deploy
# Dùng Bash (tránh lỗi TF_CLI_ARGS của PowerShell):
# export AWS_... && terraform apply -var-file=terraform.tfvars -auto-approve

# Check ECS
aws ecs describe-services --cluster foodiedash-cluster --services foodiedash-service `
  --query 'services[0].{Running:runningCount,Desired:desiredCount,Event:events[0].message}'

# Check ECS logs
aws logs tail /ecs/foodiedash --follow

# Test API Gateway
curl https://0qkzha0e29.execute-api.us-west-2.amazonaws.com/api/products

# Test MH4 Authorizer
curl -X POST https://0qkzha0e29.execute-api.us-west-2.amazonaws.com/api/ai/ask \
  -H "Content-Type: application/json" \
  -H "x-api-key: foodiedash-secret-key-2025" \
  -d '{"question":"Gợi ý món ăn cho tôi"}'

# Trigger sync_kb thủ công
aws lambda invoke --function-name foodiedash-sync-kb --payload '{}' /tmp/out.json
cat /tmp/out.json

# Check Provisioned Concurrency
aws lambda get-provisioned-concurrency-config \
  --function-name foodiedash-ai-handler --qualifier live

# Force new ECS deployment
aws ecs update-service --cluster foodiedash-cluster --service foodiedash-service --force-new-deployment
```

---

## 7. CHECKLIST TRƯỚC KHI PRESENT FRIDAY

- [x] MH1 VPC Flow Logs — ACTIVE
- [x] MH2 Network Firewall — deployed, egress allowlist active
- [x] MH3 EFS deployed + Backup COMPLETED + Restore COMPLETED
- [x] MH4 Lambda Authorizer — 401/403 verified ✅
- [x] MH5 Provisioned Concurrency — 1 unit on alias `live`
- [x] Docker image → ECR ✅
- [x] FE → S3 → CloudFront ✅
- [x] ECS running 1/1 ✅
- [x] Bedrock KB `LJI4OC7YY6` wired vào Lambda ✅
- [x] **DMS migration: 16/17 collections Atlas → DocumentDB** ✅ (25 products, 123 users, ...)
- [x] **MONGODB_URI fixed** (thêm `/foa` + `authMechanism=SCRAM-SHA-1`) ✅
- [x] **API trả real data: `GET /api/products` → 25 products** ✅
- [x] **MH4 test đầy đủ: 401 / 403 / 200 verified** ✅
- [ ] Fix Bedrock Lambda IAM role (thêm `aws-marketplace` permissions)
- [ ] Trigger sync_kb Lambda → sync menu data vào KB
- [ ] Re-test `/api/ai/ask` sau khi KB có data
- [ ] Xóa restored EFS `fs-0cbed9b73103297c1` sau khi chụp screenshot (tiết kiệm chi phí)
- [ ] Cập nhật architecture diagram
- [ ] Verify `https://dywbriqynkljb.cloudfront.net` load đúng FE

---

## 8. HƯỚNG DẪN TỰ KIỂM TRA TRÊN AWS CONSOLE

> Mở Console tại: **https://console.aws.amazon.com** → đăng nhập account `910012064913` → chọn region **US West (Oregon) us-west-2** ở góc trên phải.

---

### 8.1 Kiểm tra MH1 — VPC Flow Logs

**Bước 1:** Vào **VPC** → thanh tìm kiếm trên cùng gõ `VPC` → chọn dịch vụ VPC.

**Bước 2:** Menu trái → **Your VPCs** → tìm VPC tên `foodiedash-vpc` (ID: `vpc-0bb08d9d8879766e6`) → click vào.

**Bước 3:** Ở panel dưới → tab **Flow logs** → phải thấy 1 flow log với:
```
✅ Status       : Active
✅ Filter       : All  (không phải Accept hoặc Reject)
✅ Destination  : CloudWatch Logs
✅ Log group    : /aws/vpc/flowlogs/foodiedash
```
> ❌ Sai nếu: Status = "Error", Filter = "Accept only", hoặc không có flow log nào.

**Bước 4 (xem log thực tế):** Vào **CloudWatch** → **Log groups** → tìm `/aws/vpc/flowlogs/foodiedash` → click vào → **Log streams** → click vào 1 stream bất kỳ → phải thấy các dòng log dạng:
```
2 910012064913 eni-xxx 10.0.x.x 10.0.x.x 443 ... ACCEPT OK
```
> ✅ Đúng nếu thấy log entries có `ACCEPT` hoặc `REJECT`. Nếu chưa có log stream = chưa có traffic qua VPC (bình thường nếu ECS chưa chạy).

---

### 8.2 Kiểm tra MH2 — AWS Network Firewall

**Bước 1:** Thanh tìm kiếm gõ `Network Firewall` → chọn **VPC** → menu trái phần **Network Firewall** → **Firewalls**.

**Bước 2:** Tìm `foodiedash-network-firewall` → click vào → kiểm tra:
```
✅ Status          : Available  (màu xanh lá)
✅ VPC             : vpc-0bb08d9d8879766e6
✅ Availability Zones: us-west-2a VÀ us-west-2b (phải có cả 2)
```
> ❌ Sai nếu Status = "Provisioning" quá 15 phút hoặc "Failed".

**Bước 3:** Tab **Firewall policy** → click tên policy `foodiedash-firewall-policy` → phần **Stateful rule groups** → phải thấy:
```
✅ foodiedash-egress-domain-allowlist  (Type: Stateful)
```

**Bước 4:** Click vào rule group `foodiedash-egress-domain-allowlist` → tab **Rules** → phải thấy danh sách domain:
```
✅ .cloudinary.com
✅ .googleapis.com
✅ api.groq.com
✅ .amazonaws.com
✅ .payos.vn
✅ smtp.gmail.com
... (tổng ~10 domain)
```
> ✅ Đúng nếu Generated rules type = **ALLOWLIST**.

**Bước 5 (xem log firewall):** **CloudWatch** → **Log groups** → tìm `/aws/network-firewall/foodiedash/alert` → nếu có traffic bị chặn sẽ thấy log entries ở đây. Log group tồn tại là đủ để chứng minh logging đã setup.

**Bước 6 (kiểm tra routing):** **VPC** → **Route Tables** → lọc theo VPC `vpc-0bb08d9d8879766e6` → phải thấy các route table:
```
✅ foodiedash-rt-private-app-az-a  → route 0.0.0.0/0 → vpce-xxx (Gateway Load Balancer Endpoint)
✅ foodiedash-rt-private-app-az-b  → route 0.0.0.0/0 → vpce-xxx (Gateway Load Balancer Endpoint)
✅ foodiedash-rt-firewall          → route 0.0.0.0/0 → nat-xxx (NAT Gateway)
```
> ✅ Đúng nếu private app subnets trỏ đến **vpce** (firewall endpoint), không trỏ thẳng đến NAT.

---

### 8.3 Kiểm tra MH3 — EFS + AWS Backup

**Kiểm tra EFS:**

**Bước 1:** Thanh tìm kiếm gõ `EFS` → **Elastic File System**.

**Bước 2:** Tìm file system `fs-0563aa506ddf480ed` (tên tag: `foodiedash-efs`) → click vào → kiểm tra:
```
✅ State               : Available
✅ Encrypted           : Enabled
✅ Lifecycle policy    : Transition into IA after 30 days of not being accessed
```

**Bước 3:** Tab **Network** → phải thấy 2 mount targets:
```
✅ us-west-2a  |  Life cycle state: Available  |  Subnet: private-app-1
✅ us-west-2b  |  Life cycle state: Available  |  Subnet: private-app-2
```
> ❌ Sai nếu chỉ có 1 AZ hoặc State = "Creating".

**Bước 4:** Tab **Access points** → phải thấy 1 access point với:
```
✅ Root directory path : /foodiedash
✅ POSIX user UID      : 1000
✅ POSIX user GID      : 1000
```

**Kiểm tra AWS Backup:**

**Bước 5:** Thanh tìm kiếm gõ `AWS Backup` → **AWS Backup**.

**Bước 6:** Menu trái → **Backup vaults** → click `foodiedash-backup-vault` → tab **Recovery points** → phải thấy ít nhất 1 recovery point:
```
✅ Resource type  : EFS
✅ Status         : Completed
✅ Creation date  : 2026-05-13 (hoặc ngày gần nhất)
```

**Bước 7:** Menu trái → **Backup plans** → click `foodiedash-backup-plan` → phần **Backup rules**:
```
✅ Schedule       : cron(0 3 * * ? *)  =  3:00 AM UTC hàng ngày
✅ Lifecycle      : Delete after 7 days
✅ Backup vault   : foodiedash-backup-vault
```

**Bước 8:** Menu trái → **Backup jobs** → tab **Restore jobs** → tìm job ID `5470803d-8251-49cd-bfbb-366beb583d2f`:
```
✅ Status              : Completed
✅ Resource type        : EFS
✅ Restored resource    : fs-0cbed9b73103297c1  (EFS mới được tạo từ backup)
```
> ✅ Đây là bằng chứng restore test thành công.

---

### 8.4 Kiểm tra MH4 — API Gateway Lambda Authorizer + Throttling

**Kiểm tra Throttling:**

**Bước 1:** Thanh tìm kiếm gõ `API Gateway` → chọn API `foodiedash-api`.

**Bước 2:** Menu trái → **Stages** → click `$default` → tab **Default route settings**:
```
✅ Throttling - Rate    : 50 requests per second
✅ Throttling - Burst   : 100 requests
```
> ❌ Sai nếu các ô này trống hoặc = 0.

**Kiểm tra Lambda Authorizer:**

**Bước 3:** Vẫn trong API `foodiedash-api` → menu trái → **Authorizers** → phải thấy:
```
✅ Name            : foodiedash-api-key-authorizer
✅ Type            : Lambda
✅ Identity source : $request.header.x-api-key
✅ Auth caching    : 300 seconds
```

**Bước 4:** Menu trái → **Routes** → click `POST /api/ai/ask`:
```
✅ Authorization  : foodiedash-api-key-authorizer  (không phải NONE)
```
So sánh với route `ANY /api/{proxy+}`:
```
✅ Authorization  : NONE  (route thường không cần auth)
```

**Kiểm tra Lambda function:**

**Bước 5:** Thanh tìm kiếm gõ `Lambda` → tìm function `foodiedash-api-authorizer` → tab **Configuration** → **Environment variables**:
```
✅ VALID_API_KEY = foodiedash-secret-key-2025
```

**Bước 6 (test trực tiếp từ Console):** Trong Lambda `foodiedash-api-authorizer` → tab **Test** → tạo test event:
```json
{
  "headers": {
    "x-api-key": "foodiedash-secret-key-2025"
  },
  "requestContext": {
    "http": { "method": "POST" }
  }
}
```
→ Click **Test** → kết quả phải là:
```json
{ "isAuthorized": true }
```
Đổi key thành `wrong-key` → kết quả phải là:
```json
{ "isAuthorized": false }
```

---

### 8.5 Kiểm tra MH5 — Provisioned Concurrency

**Bước 1:** **Lambda** → tìm function `foodiedash-ai-handler`.

**Bước 2:** Tab **Configuration** → **Concurrency**:
```
✅ Provisioned concurrency configurations:
   Qualifier : live  (type: Alias)
   Requested : 1
   Allocated : 1
   Status    : Ready  (màu xanh)
```
> ❌ Sai nếu Status = "In Progress" (đang allocate) hoặc không có entry nào.
> ❌ Sai nếu Qualifier là số version thay vì alias tên `live`.

**Bước 3:** Tab **Aliases** → phải thấy alias `live`:
```
✅ Name            : live
✅ Function version: $LATEST hoặc số version (vd: 1, 2, 3...)
```
> ❌ Sai nếu không có alias `live`.

**Bước 4 (verify cold start bị loại bỏ):** Tab **Monitor** → **View CloudWatch metrics** → metric `InitDuration` → nếu đã có invocation với PC, giá trị sẽ bằng 0ms hoặc không xuất hiện (không có cold start).

---

### 8.6 Kiểm tra ECS + Docker Image

**Bước 1:** Thanh tìm kiếm gõ `ECS` → **Elastic Container Service** → **Clusters** → `foodiedash-cluster`.

**Bước 2:** Tab **Services** → click `foodiedash-service`:
```
✅ Status          : ACTIVE
✅ Desired count   : 1
✅ Running count   : 1
✅ Pending count   : 0
```
> ❌ Sai nếu Running = 0 và Pending = 1 mãi không tăng (container đang crash).

**Bước 3:** Tab **Tasks** → click vào task đang chạy → phần **Containers** → click `foodiedash-be` → xem **Logs**:
```
✅ Không có dòng "Error" đỏ
✅ Thấy dòng: "Server running on port 4000" hoặc tương tự
✅ Thấy dòng: "Connected to DocumentDB" hoặc không có connection error
```

**Bước 4:** Tab **Task definition** → click task def hiện tại → phần **Container definitions** → **Volumes**:
```
✅ Volume name: foodiedash-efs-volume
✅ EFS File System ID: fs-0563aa506ddf480ed
✅ Transit encryption: ENABLED
✅ Mount point: /mnt/efs
```

**Bước 5:** **ECR** → **Repositories** → `foodiedash-be` → tab **Images**:
```
✅ Tag    : latest
✅ Pushed : 2026-05-13  (ngày hôm nay)
✅ Size   : > 0 MB
```

---

### 8.7 Kiểm tra CloudFront + S3 (FE)

**Bước 1:** Thanh tìm kiếm gõ `CloudFront` → **Distributions** → tìm distribution ID `E33B8KW9AZSQ6S`.

**Bước 2:** Kiểm tra:
```
✅ Status  : Enabled
✅ Last modified: 2026-05-13
✅ Domain name : dywbriqynkljb.cloudfront.net
```

**Bước 3:** Tab **Origins** → phải thấy 2 origins:
```
✅ foodiedash-fe-910012064913.s3...  (S3 FE)
✅ foodiedash-s3-media.s3...         (S3 Media)
```

**Bước 4:** Mở trình duyệt → vào `https://dywbriqynkljb.cloudfront.net`:
```
✅ Trang FoodieDash load được (không 403/404)
✅ Không có lỗi CORS trong DevTools (F12 → Console)
✅ Logo, CSS hiển thị đúng
```

**Bước 5:** **S3** → **Buckets** → `foodiedash-fe-910012064913` → **Objects**:
```
✅ index.html  tồn tại
✅ assets/     thư mục có .js và .css files
✅ Last modified: 2026-05-13
```

---

### 8.8 Kiểm tra Bedrock Knowledge Base

**Bước 1:** Thanh tìm kiếm gõ `Bedrock` → **Amazon Bedrock** → menu trái → **Knowledge bases**.

**Bước 2:** Tìm KB ID `LJI4OC7YY6` → click vào:
```
✅ Status      : Available  (màu xanh)
✅ Data sources: 1 source (S3: foodie-knowledgebase)
```

**Bước 3:** Tab **Data source** → click vào data source:
```
✅ S3 URI      : s3://foodie-knowledgebase/
✅ Status      : Ready
```

**Bước 4:** Click **Sync** (hoặc xem lần sync gần nhất) → phải thấy:
```
✅ Last sync status : Succeeded  (nếu đã sync)
✅ Documents indexed: > 0
```
> ⚠️ Nếu chưa sync = chạy Lambda `foodiedash-sync-kb` trước (xem mục 3.2).

**Bước 5 (test KB trực tiếp):** Trong trang KB → nút **Test knowledge base** → nhập câu hỏi:
```
Gợi ý món ăn ngon
```
→ Phải nhận được response từ Bedrock với nội dung liên quan đến menu FoodieDash.
> ❌ Nếu response = "I don't have information" = KB chưa có data → cần chạy sync_kb.

---

### 8.9 Kiểm tra Secrets Manager

**Bước 1:** Thanh tìm kiếm gõ `Secrets Manager` → **AWS Secrets Manager** → tìm secret `/foodiedash/app`.

**Bước 2:** Click vào secret → **Retrieve secret value**:
```
✅ MONGODB_URI          : mongodb://foodiedashAdmin:...@foodiedash-docdb-cluster...
✅ CLOUDINARY_API_KEY   : 917653762929774  (không phải REPLACE_WITH_xxx)
✅ GEMINI_API_KEY       : AIzaSyCc488...
✅ APP_ORIGIN           : https://dywbriqynkljb.cloudfront.net
✅ GROQ_API_KEY         : gsk_tFMF...
```
> ❌ Sai nếu bất kỳ giá trị nào vẫn còn là `REPLACE_WITH_xxx` hoặc rỗng.

---

### 8.10 Kiểm tra end-to-end (smoke test nhanh)

Mở trình duyệt hoặc dùng curl, thực hiện theo thứ tự:

**Test 1 — FE load:**
```
Mở: https://dywbriqynkljb.cloudfront.net
✅ Đúng: Trang FoodieDash hiện ra, không bị trắng
```

**Test 2 — API health:**
```
Mở: https://0qkzha0e29.execute-api.us-west-2.amazonaws.com/api/products
✅ Đúng: {"success":true,"data":[...],"pagination":{"total":25}} — 25 products từ DocumentDB
❌ Sai : {"message":"Internal Server Error"} 502 = ECS container chưa ready
❌ Sai : data:[] với total:0 = MONGODB_URI sai (thiếu /foa hoặc authMechanism)
```

**Test 3 — Authorizer chặn đúng:**
```
Mở Postman hoặc curl:
POST https://0qkzha0e29.execute-api.us-west-2.amazonaws.com/api/ai/ask
Body: {"question":"test"}
(Không có header x-api-key)

✅ Đúng: HTTP 401 Unauthorized
```

**Test 4 — Authorizer cho đi đúng:**
```
POST https://0qkzha0e29.execute-api.us-west-2.amazonaws.com/api/ai/ask
Header: x-api-key: foodiedash-secret-key-2025
Body: {"question":"Gợi ý món ăn"}

✅ Đúng: HTTP 200 với AI response từ Bedrock  (sau khi đã sync KB)
⚠️ Tạm chấp nhận: HTTP 500 nếu KB chưa có data
❌ Sai  : HTTP 403 = authorizer đang reject đúng key → kiểm tra lại env var VALID_API_KEY
```

---

## 9. POST-DEPLOYMENT FIXES (2026-05-15)

### 9.1 Bug: DocumentDB `_id` nested object — `/auth/me` 401 "User not found"

**Triệu chứng:** Login thành công nhưng bị logout ngay lập tức. Console trả về `401 Unauthorized / User not found` ở endpoint `GET /auth/me`.

**Root cause:**  
Seed script (DMS migration) lưu `_id` dưới dạng **nested object** `{ _id: ObjectId('...') }` thay vì `ObjectId('...')` thẳng. Mongoose `findById()` cast về ObjectId thật và query `{ _id: ObjectId('...') }` → không khớp với document có `_id` kiểu sub-document → `null` → 401. Trong khi đó `findOne({ email })` vẫn hoạt động nên login pass được, JWT được ký với `user_id: { _id: '...' }` (object) thay vì `user_id: ObjectId('...')`.

**Cách phát hiện:**  
ECS Execute Command → Node.js script diagnostic:
```bash
aws ecs execute-command --cluster foodiedash-cluster --task <taskId> \
  --container foodiedash-be --interactive --command "sh -c 'node -e \"...\"'"
# console.log(admin._id.constructor.name) → in ra "Object" thay vì "ObjectId"
```

**Fix (chạy qua ECS Exec — không thay đổi code):**  
Script Node.js (base64-encode để tránh shell escaping):
```javascript
// Với MỖI user bị lỗi:
// 1. Lưu document hiện tại (trừ _id)
// 2. Xóa document cũ
// 3. Reinsert không có _id → MongoDB tự sinh ObjectId hợp lệ
const bad = await UserModel.findOne({ email });
const data = bad.toObject();
delete data._id;
await UserModel.deleteOne({ email });
await UserModel.create(data);
```

**Kết quả:** 122/126 users bị ảnh hưởng → đã fix toàn bộ bằng batch script.

**Tài khoản test sau fix:**

| Email | Password | Role |
|---|---|---|
| admin@foodiedash.vn | Admin@123 | ADMIN |
| staff@foodiedash.vn | Staff@123 | STAFF |
| customer01@gmail.com | Customer@123 | CUSTOMER |
| tunita2003@gmail.com | @Password123 | CUSTOMER |

---

### 9.2 Bug: Socket.io CORS Error — Support Chat không kết nối được

**Triệu chứng:**  
Console browser: `Access to XMLHttpRequest... blocked by CORS policy` tại URL:
```
https://0qkzha0e29.execute-api.us-west-2.amazonaws.com/socket.io/?EIO=4&transport=polling
```

**Root cause:**  
Frontend `getSocketBaseUrl()` strip suffix `/api` khỏi `VITE_BASE_API`:
```typescript
// VITE_BASE_API = "https://0qkzha0e29.execute-api.us-west-2.amazonaws.com/api"
return apiUrl.endsWith("/api") ? apiUrl.slice(0, -4) : apiUrl;
// → Socket.io gọi đến /socket.io/... không có route trong API Gateway → 403 không có CORS header
```

**Fix:** Thêm 2 routes vào API Gateway `0qkzha0e29` trỏ về ALB integration `o366st8` (không cần thay đổi code FE/BE):
```bash
aws apigatewayv2 create-route --api-id 0qkzha0e29 \
  --route-key "ANY /socket.io"          --target "integrations/o366st8"
# → RouteId: cg94wot

aws apigatewayv2 create-route --api-id 0qkzha0e29 \
  --route-key "ANY /socket.io/{proxy+}" --target "integrations/o366st8"
# → RouteId: qfs0kce
```

Stage `$default` có `AutoDeploy: true` → live ngay không cần redeploy.

**Verify:**
```bash
curl -si "https://0qkzha0e29.execute-api.us-west-2.amazonaws.com/socket.io/?EIO=4&transport=polling" \
  -H "Origin: https://dywbriqynkljb.cloudfront.net"
# HTTP/1.1 200 OK
# access-control-allow-origin: https://dywbriqynkljb.cloudfront.net  ✅
# 0{"sid":"...","upgrades":["websocket"],...}                         ✅
```

---

### 9.3 Bug: AI Chatbot trả về "Sorry, I am unable to assist" với lời chào

**Triệu chứng:** User chat `hi`, `hello`, `cảm ơn`, ... → AI trả về *"Sorry, I am unable to assist you with this request."*

**Root cause:**  
Lambda `ai_handler` gọi thẳng Bedrock Knowledge Base (`RetrieveAndGenerateCommand`) cho mọi input. KB chỉ chứa tài liệu về thực phẩm/dinh dưỡng → lời chào không match bất kỳ document nào → Bedrock dùng fallback mặc định.

**Fix:** Thêm **greeting/small-talk detection** ở đầu Lambda — xử lý local, **không gọi Bedrock**:

File thay đổi: `terraform/lambda/ai_handler/index.js`

```javascript
const GREETING_RE = /^(hi+|he+y+|hello+|howdy|chào|xin\s*chào|alo+|...)\s*[!?.]*$/i;
const THANKS_RE   = /^(thanks?|thank\s*you|cảm\s*ơn|ok+|được\s*rồi|...)\s*[!?.]*$/i;
const HOWRU_RE    = /^(how\s*are\s*you|bạn\s*kh[oỏ]e\s*không|...)\s*[!?.]*$/i;

const getSmallTalkReply = (text) => {
  if (GREETING_RE.test(text.trim())) return GREETING_REPLY;
  if (THANKS_RE.test(text.trim()))   return THANKS_REPLY;
  if (HOWRU_RE.test(text.trim()))    return HOWRU_REPLY;
  if (text.trim().length <= 3)       return GREETING_REPLY; // "hu", "ok", ...
  return null; // → gọi Bedrock KB bình thường
};
```

**Deploy:**
```bash
# Repackage
Compress-Archive -Path index.js -DestinationPath ../ai_handler_new.zip -Force
# Upload lên Lambda
aws lambda update-function-code \
  --function-name foodiedash-ai-handler \
  --zip-file fileb://ai_handler_new.zip
aws lambda wait function-updated --function-name foodiedash-ai-handler
```

**Kết quả test:**

| Input | Trước fix | Sau fix |
|---|---|---|
| `hi` | ❌ "Sorry, I am unable to assist..." | ✅ "Xin chào! 👋 Tôi là trợ lý AI dinh dưỡng..." |
| `cảm ơn` | ❌ "Sorry, I am unable to assist..." | ✅ "Không có gì! 😊 Nếu bạn cần tư vấn thêm..." |
| `how are you` | ❌ "Sorry, I am unable to assist..." | ✅ "Cảm ơn bạn hỏi thăm! 😄..." |
| Câu hỏi về món ăn | ✅ hoạt động | ✅ vẫn hoạt động bình thường |

---

### 9.4 API Gateway Routes Summary (sau tất cả fixes)

| Route Key | Integration | Mục đích |
|---|---|---|
| `ANY /api/{proxy+}` | `o366st8` (ALB) | Toàn bộ Express API |
| `POST /api/ai/ask` | `n63npsn` (Lambda) | Bedrock AI chatbot (có authorizer) |
| `ANY /socket.io` | `o366st8` (ALB) | Socket.io base — **mới thêm** |
| `ANY /socket.io/{proxy+}` | `o366st8` (ALB) | Socket.io proxy — **mới thêm** |

---

## 10. CHECKLIST CẬP NHẬT (2026-05-15)

- [x] MH1 VPC Flow Logs — ACTIVE ✅
- [x] MH2 Network Firewall — deployed, egress allowlist active ✅
- [x] MH3 EFS + Backup COMPLETED + Restore COMPLETED ✅
- [x] MH4 Lambda Authorizer — 401/403/200 verified ✅
- [x] MH5 Provisioned Concurrency — 1 unit on alias `live` ✅
- [x] Docker image → ECR ✅
- [x] FE → S3 → CloudFront ✅
- [x] ECS running 1/1 ✅
- [x] Bedrock KB `LJI4OC7YY6` wired vào Lambda ✅
- [x] DMS migration: 16/17 collections Atlas → DocumentDB ✅
- [x] MONGODB_URI fixed (thêm `/foa` + `authMechanism=SCRAM-SHA-1`) ✅
- [x] **DocumentDB `_id` bug fixed — tất cả 122 users đã reinsert với ObjectId hợp lệ** ✅
- [x] **Socket.io CORS fixed — thêm routes `/socket.io` và `/socket.io/{proxy+}` vào API Gateway** ✅
- [x] **AI chatbot greeting handling — Lambda updated, `hi`/`cảm ơn`/... trả lời thân thiện** ✅
- [x] Support Chat (Socket.io live) kết nối thành công ✅
- [x] AI Chatbot (Bedrock KB) hoạt động đầy đủ ✅
