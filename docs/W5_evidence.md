# Week 5 — The Network Fortress: Evidence Pack
**Group 8 — FoodieDash** | AWS Account: `910012064913` | Region: `us-west-2`  
**Date:** 2026-05-13

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
- Valid key: `foodiedash-w5-api-key-2026`

**Test results (2026-05-13):**

| Test | Header | HTTP Status | Result |
|---|---|---|---|
| No API key | _(none)_ | **401 Unauthorized** | ✅ Correctly rejected |
| Wrong key | `x-api-key: wrong-key` | **403 Forbidden** | ✅ Correctly rejected |
| Correct key | `x-api-key: foodiedash-w5-api-key-2026` | **500** (auth passed, KB not set) | ✅ Authorization passed |

```powershell
# Test 1 — no key → 401
Invoke-WebRequest -Uri "https://0qkzha0e29.execute-api.us-west-2.amazonaws.com/api/ai/ask" `
  -Method POST -ContentType "application/json" -Body '{"question":"test"}'
# → HTTP 401 Unauthorized

# Test 2 — wrong key → 403
Invoke-WebRequest -Uri "https://0qkzha0e29.execute-api.us-west-2.amazonaws.com/api/ai/ask" `
  -Method POST -ContentType "application/json" -Body '{"question":"test"}' `
  -Headers @{"x-api-key"="wrong-key"}
# → HTTP 403 Forbidden

# Test 3 — correct key → authorization passes
Invoke-WebRequest -Uri "https://0qkzha0e29.execute-api.us-west-2.amazonaws.com/api/ai/ask" `
  -Method POST -ContentType "application/json" -Body '{"question":"xin chao"}' `
  -Headers @{"x-api-key"="foodiedash-w5-api-key-2026"}
# → HTTP 500 (auth OK, Lambda reaches Bedrock but KB not configured yet)
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

## TODO (before Friday presentation)

- [x] Create Bedrock Knowledge Base → `kb_id = LJI4OC7YY6`, `ds_id = 910012064913` → terraform apply lần 3
- [ ] Upload menu/product data to `foodie-knowledgebase` S3 bucket (sync_kb Lambda sẽ tự làm khi được trigger)
- [ ] Run DMS migration MongoDB Atlas → DocumentDB (or seed data via script)
- [ ] Verify CloudFront → `https://dywbriqynkljb.cloudfront.net` loads FE
- [ ] Verify API health: `GET /api/products` returns data
- [ ] Update architecture diagram for W5 presentation
