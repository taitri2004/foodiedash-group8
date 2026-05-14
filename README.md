# FoodieDash — Group 8 Monorepo

Full-stack food delivery platform deployed on AWS (Week 5 — The Network Fortress).

## Structure

```
Group8/
├── XOPS_BE/          # Node.js / TypeScript backend (Express + ts-node)
├── XOPS_FE/          # React + Vite frontend
├── terraform/        # AWS infrastructure as code (Terraform)
└── docs/             # Architecture diagrams, evidence, weekly summaries
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript |
| Backend | Node.js, Express, TypeScript, ts-node |
| Database | AWS DocumentDB (MongoDB-compatible) |
| File Storage | AWS EFS (mounted to ECS), S3 (media) |
| Compute | AWS ECS Fargate |
| CDN | AWS CloudFront + S3 (static FE) |
| API | AWS API Gateway HTTP API v2 |
| AI / RAG | AWS Bedrock (Claude Haiku 4.5) + Knowledge Base |
| IaC | Terraform |
| Container Registry | AWS ECR |

## AWS Architecture (Week 5)

- **VPC** with public/private subnets across 2 AZs
- **Network Firewall** (MH2) — domain allowlist egress, 2-AZ
- **VPC Flow Logs** (MH1) — ALL traffic → CloudWatch
- **EFS + AWS Backup** (MH3) — daily backup plan + restore test
- **Lambda Authorizer** (MH4) — `x-api-key` header, 401/403/pass
- **Provisioned Concurrency** (MH5) — `live` alias, 1 PC unit
- **Bedrock RAG** — Knowledge Base `LJI4OC7YY6`, Claude Haiku 4.5

## Quick Start (Local Dev)

### Backend

```bash
cd XOPS_BE
cp .env.example .env      # fill in your values
npm install
npm run dev
```

### Frontend

```bash
cd XOPS_FE
cp .env.example .env      # fill in your values
npm install
npm run dev
```

### Infrastructure

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # fill in real values
terraform init
terraform plan
terraform apply
```

> **Note:** `terraform.tfvars` is gitignored — never commit real secrets.

## Lambda Functions

| Function | Trigger | Purpose |
|---|---|---|
| `foodiedash-api-authorizer` | API Gateway | Validates `x-api-key` header, returns 401/403 |
| `foodiedash-ai-handler` | API Gateway `/ai/ask` | RAG query to Bedrock Knowledge Base |
| `foodiedash-sync-kb` | EventBridge (daily) | Fetches menu data → S3 → triggers KB ingestion |

## Docs

- [`docs/W5_summary.md`](docs/W5_summary.md) — Week 5 deploy summary + console verification guide
- [`docs/W5_evidence.md`](docs/W5_evidence.md) — Evidence log (ARNs, job IDs, test results)
