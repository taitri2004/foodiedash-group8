# ─────────────────────────────────────────────
# MH2: AWS Network Firewall (Path A — bắt buộc vì có NAT Gateway)
# Traffic flow: private_app → firewall endpoint → NAT → internet
# ─────────────────────────────────────────────

# Firewall Subnets (dedicated subnet, mỗi AZ 1 cái)
resource "aws_subnet" "firewall_1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.192.0/24"
  availability_zone = "${var.aws_region}a"
  tags = { Name = "foodiedash-subnet-firewall-us-west-2a" }
}

resource "aws_subnet" "firewall_2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.193.0/24"
  availability_zone = "${var.aws_region}b"
  tags = { Name = "foodiedash-subnet-firewall-us-west-2b" }
}

# ── Firewall Rule Group: Domain-based Egress Allowlist ──
resource "aws_networkfirewall_rule_group" "egress_allowlist" {
  name     = "foodiedash-egress-domain-allowlist"
  type     = "STATEFUL"
  capacity = 100

  rule_group {
    stateful_rule_options {
      rule_order = "STRICT_ORDER"
    }

    rules_source {
      rules_source_list {
        generated_rules_type = "ALLOWLIST"
        target_types         = ["HTTP_HOST", "TLS_SNI"]
        targets = [
          # Cloudinary (image upload/serve)
          ".cloudinary.com",
          "api.cloudinary.com",
          # Google services (Gemini API, Gmail SMTP)
          ".googleapis.com",
          ".google.com",
          "smtp.gmail.com",
          # Groq AI
          "api.groq.com",
          # PayOS payment
          ".payos.vn",
          "api-merchant.payos.vn",
          # AWS services (ECR pull, Secrets Manager, Bedrock, S3)
          ".amazonaws.com",
          ".aws.com",
          ".awsstatic.com",
          # Docker Hub (backup image pull)
          "registry-1.docker.io",
          ".docker.io",
          ".docker.com",
        ]
      }
    }
  }

  tags = { Name = "foodiedash-egress-allowlist" }
}

# ── Firewall Policy ──
resource "aws_networkfirewall_firewall_policy" "main" {
  name = "foodiedash-firewall-policy"

  firewall_policy {
    stateless_default_actions          = ["aws:forward_to_sfe"]
    stateless_fragment_default_actions = ["aws:forward_to_sfe"]

    stateful_default_actions = ["aws:drop_established"]
    stateful_engine_options {
      rule_order = "STRICT_ORDER"
    }

    stateful_rule_group_reference {
      resource_arn = aws_networkfirewall_rule_group.egress_allowlist.arn
      priority     = 1
    }
  }

  tags = { Name = "foodiedash-firewall-policy" }
}

# ── Network Firewall (spans 2 AZs) ──
resource "aws_networkfirewall_firewall" "main" {
  name                = "foodiedash-network-firewall"
  firewall_policy_arn = aws_networkfirewall_firewall_policy.main.arn
  vpc_id              = aws_vpc.main.id

  subnet_mapping {
    subnet_id = aws_subnet.firewall_1.id
  }

  subnet_mapping {
    subnet_id = aws_subnet.firewall_2.id
  }

  tags = { Name = "foodiedash-network-firewall" }
}

# ── Firewall Logging → CloudWatch ──
resource "aws_cloudwatch_log_group" "firewall_alert" {
  name              = "/aws/network-firewall/foodiedash/alert"
  retention_in_days = 7
  tags = { Name = "foodiedash-firewall-alert-logs" }
}

resource "aws_cloudwatch_log_group" "firewall_flow" {
  name              = "/aws/network-firewall/foodiedash/flow"
  retention_in_days = 7
  tags = { Name = "foodiedash-firewall-flow-logs" }
}

resource "aws_networkfirewall_logging_configuration" "main" {
  firewall_arn = aws_networkfirewall_firewall.main.arn

  logging_configuration {
    log_destination_config {
      log_type             = "ALERT"
      log_destination_type = "CloudWatchLogs"
      log_destination = {
        logGroup = aws_cloudwatch_log_group.firewall_alert.name
      }
    }
    log_destination_config {
      log_type             = "FLOW"
      log_destination_type = "CloudWatchLogs"
      log_destination = {
        logGroup = aws_cloudwatch_log_group.firewall_flow.name
      }
    }
  }
}

# ── Extract firewall endpoint IDs per AZ ──
locals {
  # sync_states là set, mỗi phần tử ứng với 1 AZ/subnet
  fw_sync_map = {
    for state in tolist(aws_networkfirewall_firewall.main.firewall_status[0].sync_states) :
    state.availability_zone => tolist(state.attachment)[0].endpoint_id
  }
  fw_endpoint_az_a = local.fw_sync_map["${var.aws_region}a"]
  fw_endpoint_az_b = local.fw_sync_map["${var.aws_region}b"]
}

# ── Route Table: Firewall subnets → NAT Gateway ──
resource "aws_route_table" "firewall" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = { Name = "foodiedash-rt-firewall" }
}

resource "aws_route_table_association" "firewall_1" {
  subnet_id      = aws_subnet.firewall_1.id
  route_table_id = aws_route_table.firewall.id
}

resource "aws_route_table_association" "firewall_2" {
  subnet_id      = aws_subnet.firewall_2.id
  route_table_id = aws_route_table.firewall.id
}

# ── Route Tables: Private App subnets → Firewall Endpoint (per AZ) ──
resource "aws_route_table" "private_app_az_a" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block      = "0.0.0.0/0"
    vpc_endpoint_id = local.fw_endpoint_az_a
  }

  tags = { Name = "foodiedash-rt-private-app-az-a" }
}

resource "aws_route_table" "private_app_az_b" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block      = "0.0.0.0/0"
    vpc_endpoint_id = local.fw_endpoint_az_b
  }

  tags = { Name = "foodiedash-rt-private-app-az-b" }
}

# ── Subnet Associations: App tier → per-AZ firewall route tables ──
resource "aws_route_table_association" "private_app_1" {
  subnet_id      = aws_subnet.private_app_1.id
  route_table_id = aws_route_table.private_app_az_a.id
}

resource "aws_route_table_association" "private_app_2" {
  subnet_id      = aws_subnet.private_app_2.id
  route_table_id = aws_route_table.private_app_az_b.id
}
