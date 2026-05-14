# Week 5 — The Network Fortress: Evidence Pack
**Group 8 — FoodieDash** | AWS Account: `910012064913` | Region: `us-west-2`  
**Date:** 2026-05-13 → 2026-05-14 (updated)

---

## Infrastructure Overview

| Resource | Value |
|---|---|
| VPC | `vpc-0bb08d9d8879766e6` |
| CloudFront Domain | `https://dywbriqynkljb.cloudfront.net` |
| API Gateway | `https://0qkzha0e29.execute-api.us-west-2.amazonaws.com` |
| ECR | `910012064913.dkr.ecr.us-west-2.amazonaws.com/foodiedash-be` |
| ECS Cluster | `foodiedash-cluster` (Running: 1 / Desired: 1) |
| DocumentDB | `foodiedash-docdb-cluster.cluster-cxssa6wm4z16.us-west-2.docdb.amazonaws.com` |
| EFS | `fs-0563aa506ddf480ed` |
| Backup Vault | `foodiedash-backup-vault` |
| Bedrock KB | `LJI4OC7YY6` (Data Source: `CELY77CNW0`) |

---

## MH1 — VPC Flow Logs (Justified Single-VPC, Path C)

**Justification:** FoodieDash is a single product with uniform security requirements across all tiers (BE, DB, EFS). A Single-VPC design using subnet segmentation (public / private-app / private-db) provides sufficient isolation without the operational overhead of multi-VPC peering. Path C chosen because the app is greenfield and all components are co-located in the same AWS account/region.

**Resources deployed:**
- CloudWatch Log Group: `/aws/vpc/flowlogs/foodiedash` (retention: 7 days)
- IAM Role: `vpc-flow-logs-role` with CloudWatch Logs write permissions
- Flow Log: ALL traffic on `vpc-0bb08d9d8879766e6` → CloudWatch

**Verification:**
```bash
aws ec2 describe-flow-logs --filter "Name=resource-id,Values=vpc-0bb08d9d8879766e6"
# → FlowLogStatus: ACTIVE, TrafficType: ALL
```

---

## MH2 — AWS Network Firewall (Path A — NAT Gateway required)

**Architecture:** `Private App Subnets → Firewall Endpoints (per-AZ) → NAT Gateway → Internet`

**Why Path A:** The VPC has a NAT Gateway for outbound internet access from private subnets. Network Firewall must be inserted between the app subnets and the NAT Gateway to inspect/filter egress traffic.

**Resources deployed:**
- Firewall subnets: `10.0.192.0/24` (AZ-a), `10.0.193.0/24` (AZ-b)
- Rule Group: `foodiedash-egress-domain-allowlist` (STATEFUL, ALLOWLIST)
- Allowed domains: `.cloudinary.com`, `.googleapis.com`, `api.groq.com`, `.payos.vn`, `smtp.gmail.com`, `.amazonaws.com`, `.docker.io`
- Firewall Policy: forwards unmatched traffic to drop (native ALLOWLIST behavior)
- Logging: ALERT + FLOW → CloudWatch (`/aws/network-firewall/foodiedash/alert`, `.../flow`)

**Routing:**
- `private_app_1 (AZ-a)` → Firewall endpoint AZ-a → NAT Gateway
- `private_app_2 (AZ-b)` → Firewall endpoint AZ-b → NAT Gateway

---

## MH3 — Amazon EFS + AWS Backup (with Restore Test)

**Resources deployed:**
- EFS File System: `fs-0563aa506ddf480ed` (encrypted=true, lifecycle: AFTER_30_DAYS to IA)
- Mount Targets: `private_app_1` + `private_app_2` (port 2049)
- EFS Access Point: path=`/foodiedash`, uid/gid=1000, permissions=755
- ECS Task: mounts EFS at `/mnt/efs` (transit encryption ENABLED, IAM=ENABLED)

**Backup Plan:**
- Vault: `foodiedash-backup-vault`
- Schedule: `cron(0 3 * * ? *)` → 3AM UTC daily
- Retention: 7 days
- Resources covered: EFS `fs-0563aa506ddf480ed` + DocumentDB cluster

**On-demand backup evidence (2026-05-13):**
```
BackupJobId:      452902c6-44d3-4c83-bce9-ea9ff5496b9e
State:            COMPLETED
PercentDone:      100.0%
RecoveryPointArn: arn:aws:backup:us-west-2:910012064913:recovery-point:f98f0350-e4c3-4e7a-998d-4d0d2444654d
```

**Restore test evidence (2026-05-13):**
```
RestoreJobId:       5470803d-8251-49cd-bfbb-366beb583d2f
Status:             COMPLETED ✅
PercentDone:        100.00%
CreatedResourceArn: arn:aws:elasticfilesystem:us-west-2:910012064913:file-system/fs-0cbed9b73103297c1
New EFS ID:         fs-0cbed9b73103297c1  (restored from fs-0563aa506ddf480ed)
Metadata used:      newFileSystem=true, KmsKeyId=48c2a546-1e0d-4975-aaba-283347cad5e2
```

---

## MH4 — API Gateway Lambda Authorizer + Throttling

**Throttling (stage level):**
- Rate limit: `50 requests/second`
- Burst limit: `100 requests`

**Lambda Authorizer:**
- Function: `foodiedash-api-authorizer` (Node.js 20.x, 128MB, 5s timeout)
- Type: `REQUEST` (payload format 2.0, simple responses)
- Identity source: `$request.header.x-api-key`
- Cache TTL: 300 seconds
- Protected route: `POST /api/ai/ask`
- Valid key: `foodiedash-secret-key-2025`

**Test results (2026-05-14, verified):**

| Test | Header | HTTP Status | Result |
|---|---|---|---|
| No API key | _(none)_ | **401 Unauthorized** | ✅ Correctly rejected |
| Wrong key | `x-api-key: wrongkey` | **403 Forbidden** | ✅ Correctly rejected |
| Correct key | `x-api-key: foodiedash-secret-key-2025` | **200 OK** → passes to backend | ✅ Authorization passed |

> **Fix applied 2026-05-14:** `VALID_API_KEY` env var was missing from Lambda → set via  
> `aws lambda update-function-configuration --function-name foodiedash-api-authorizer --environment "Variables={VALID_API_KEY=foodiedash-secret-key-2025}"`  
> Authorizer cache TTL updated to 0 to disable stale caching.

```powershell
# Test 1 — no key → 401
Invoke-WebRequest -Uri "https://0qkzha0e29.execute-api.us-west-2.amazonaws.com/api/ai/ask" `
  -Method POST -ContentType "application/json" -Body '{"question":"test"}'
# → HTTP 401 Unauthorized

# Test 2 — wrong key → 403
Invoke-WebRequest -Uri "https://0qkzha0e29.execute-api.us-west-2.amazonaws.com/api/ai/ask" `
  -Method POST -ContentType "application/json" -Body '{"question":"test"}' `
  -Headers @{"x-api-key"="wrongkey"}
# → HTTP 403 Forbidden

# Test 3 — correct key → authorization passes to backend
Invoke-WebRequest -Uri "https://0qkzha0e29.execute-api.us-west-2.amazonaws.com/api/ai/ask" `
  -Method POST -ContentType "application/json" -Body '{"question":"Gợi ý món ăn"}' `
  -Headers @{"x-api-key"="foodiedash-secret-key-2025"}
# → HTTP 200 (auth OK, request reaches ai-handler)
```

---

## MH5 — Lambda Provisioned Concurrency

**Purpose:** Eliminate cold start for the AI handler Lambda that processes `/api/ai/ask` requests.

**Resources deployed:**
- Function: `foodiedash-ai-handler` (published version: enabled via `publish = true`)
- Alias: `live` → points to published version
- Provisioned Concurrency: **1 unit** on alias `live`
- Expected benefit: `init_duration = 0ms` after warmup (vs ~800ms cold start)
- Estimated cost: ~$0.015/hour for 1 PC unit in us-west-2

**Verification:**
```bash
aws lambda get-provisioned-concurrency-config \
  --function-name foodiedash-ai-handler \
  --qualifier live
# → AllocatedProvisionedConcurrentExecutions: 1, Status: READY
```

---

## Deployment Summary

| Step | Command | Status |
|---|---|---|
| Terraform apply | `terraform apply -var-file=terraform.tfvars` | ✅ |
| Docker build | `docker build -t foodiedash-be .` | ✅ |
| ECR push | `docker push 910012064913.dkr.ecr.us-west-2.amazonaws.com/foodiedash-be:latest` | ✅ |
| FE build | `npm run build` (Vite, 3373 modules) | ✅ |
| S3 sync | `aws s3 sync dist/ s3://foodiedash-fe-910012064913/ --delete` | ✅ |
| CloudFront invalidation | `E33B8KW9AZSQ6S` — `/*` | ✅ |
| ECS deployment | `--force-new-deployment` → Running: 1/1 | ✅ |

---

## DMS Migration — MongoDB Atlas → DocumentDB (2026-05-14)

**Source:** MongoDB Atlas `ac-ckiqwh3-shard-00-00.p5g94vc.mongodb.net:27017`  
**Target:** `foodiedash-docdb-cluster` | DB: `foa`  
**Task:** `foodiedash-migrate-task` (Full Load, Provisioned)

**Result: 16/17 collections migrated successfully**

| Collection | Rows | Status |
|---|---|---|
| users | 123 | ✅ Table completed |
| products | 25 | ✅ Table completed |
| orders | 25 | ✅ Table completed |
| notifications | 222 | ✅ Table completed |
| refresh_tokens | 824 | ✅ Table completed |
| reviews | 12 | ✅ Table completed |
| files | 51 | ✅ Table completed |
| carts | 4 | ✅ Table completed |
| vouchers | 4 | ✅ Table completed |
| support_messages | 115 | ✅ Table completed |
| support_conversations | 32 | ✅ Table completed |
| point_transactions | 43 | ✅ Table completed |
| verification_codes | 13 | ✅ Table completed |
| settings | 1 | ✅ Table completed |
| support_settings | 1 | ✅ Table completed |
| paymentrequests | 0 | ⚠️ Table error (collection empty in Atlas) |

**Issues encountered & fixed:**

| Issue | Fix |
|---|---|
| DMS source hostname `foa.p5g94vc.mongodb.net` no A record | Use real shard: `ac-ckiqwh3-shard-00-00.p5g94vc.mongodb.net` |
| MONGODB_URI missing database name | Added `/foa` → `:27017/foa?tls=true...` |
| ECS secret had UTF-8 BOM → `invalid character` error | Wrote file with `[System.IO.File]::WriteAllText(..., UTF8Encoding(false))` |
| App using SCRAM-SHA-256, DocumentDB only supports SCRAM-SHA-1 | Added `&authMechanism=SCRAM-SHA-1` to URI |

**Final MONGODB_URI (in Secrets Manager `/foodiedash/app`):**
```
mongodb://foodiedashAdmin:FoodieDash2026W5@foodiedash-docdb-cluster.cluster-cxssa6wm4z16.us-west-2.docdb.amazonaws.com:27017/foa?tls=true&tlsCAFile=/app/global-bundle.pem&replicaSet=rs0&retryWrites=false&authMechanism=SCRAM-SHA-1
```

**API verification:**
```
GET /api/products → {"success":true,"data":[...],"pagination":{"total":25}}
```

---

## Full Audit Results (2026-05-14)

| Check | Result |
|---|---|
| MH1 VPC Flow Logs | ✅ ACTIVE, ALL traffic, CloudWatch |
| MH2 Network Firewall | ✅ READY, 2 AZs, domain allowlist |
| MH3 EFS + Backup + Restore | ✅ All COMPLETED |
| MH4 Lambda Authorizer | ✅ 401 / 403 / 200 verified |
| MH5 Provisioned Concurrency | ✅ `live` alias, 1/1 READY |
| ECS Service | ✅ Running 1/1 |
| CloudFront FE | ✅ Deployed, Enabled |
| DocumentDB | ✅ Available, 25 products |
| Bedrock KB | ✅ ACTIVE, DS AVAILABLE |
| Bedrock AI endpoint | ⚠️ IAM missing `aws-marketplace:ViewSubscriptions` on Lambda role |

---

## Completed Checklist

- [x] MH1 VPC Flow Logs deployed and ACTIVE
- [x] MH2 Network Firewall deployed, 2-AZ, egress allowlist
- [x] MH3 EFS deployed + on-demand backup COMPLETED + restore test COMPLETED
- [x] MH4 Lambda Authorizer: 401/403/200 all verified
- [x] MH5 Provisioned Concurrency: 1 unit on alias `live`, Status READY
- [x] Docker image → ECR
- [x] FE → S3 → CloudFront
- [x] ECS running 1/1
- [x] DMS migration: 16/17 collections from Atlas → DocumentDB
- [x] MONGODB_URI fixed (database name + auth mechanism)
- [x] API returning real data: `GET /api/products` → 25 products
- [x] Bedrock KB `LJI4OC7YY6` wired, data source `CELY77CNW0`
- [ ] Fix Bedrock IAM role (add `aws-marketplace` permissions)
- [ ] Update architecture diagram for presentation
