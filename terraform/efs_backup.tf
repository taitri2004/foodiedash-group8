# ─────────────────────────────────────────────
# MH3: EFS File Storage + AWS Backup Plan
# ─────────────────────────────────────────────

# ── Security Group cho EFS Mount Targets ──
# Chỉ cho phép từ Fargate tasks (không phải 0.0.0.0/0)
resource "aws_security_group" "efs" {
  name        = "foodiedash-sg-efs"
  description = "EFS mount target - only allow from Fargate SG"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [aws_security_group.fargate.id]
    description     = "NFS from Fargate tasks only"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "foodiedash-sg-efs" }
}

# ── EFS File System ──
resource "aws_efs_file_system" "app" {
  encrypted = true # encryption at rest (chỉ bật được lúc tạo!)

  lifecycle_policy {
    transition_to_ia = "AFTER_30_DAYS" # chuyển file ít dùng sang IA tự động
  }

  tags = { Name = "foodiedash-efs" }
}

# ── Mount Targets (1 per AZ trong private_app subnets) ──
resource "aws_efs_mount_target" "app_az_a" {
  file_system_id  = aws_efs_file_system.app.id
  subnet_id       = aws_subnet.private_app_1.id
  security_groups = [aws_security_group.efs.id]
}

resource "aws_efs_mount_target" "app_az_b" {
  file_system_id  = aws_efs_file_system.app.id
  subnet_id       = aws_subnet.private_app_2.id
  security_groups = [aws_security_group.efs.id]
}

# ── EFS Access Point (cho ECS Fargate mount với POSIX user) ──
resource "aws_efs_access_point" "app" {
  file_system_id = aws_efs_file_system.app.id

  posix_user {
    uid = 1000
    gid = 1000
  }

  root_directory {
    path = "/foodiedash"
    creation_info {
      owner_uid   = 1000
      owner_gid   = 1000
      permissions = "755"
    }
  }

  tags = { Name = "foodiedash-efs-ap" }
}

# ─────────────────────────────────────────────
# AWS BACKUP PLAN
# Bao phủ: EFS + DocumentDB + EBS (nếu có)
# ─────────────────────────────────────────────

# ── Backup Vault ──
resource "aws_backup_vault" "main" {
  name = "foodiedash-backup-vault"
  tags = { Name = "foodiedash-backup-vault" }
}

# ── IAM Role cho AWS Backup ──
resource "aws_iam_role" "backup" {
  name = "foodiedash-backup-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "backup.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "backup_policy" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_iam_role_policy_attachment" "backup_restore_policy" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

# ── Backup Plan (daily, 7 ngày retention) ──
resource "aws_backup_plan" "main" {
  name = "foodiedash-backup-plan"

  rule {
    rule_name         = "daily-backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 3 * * ? *)" # 3AM UTC = 10AM Vietnam

    start_window      = 60   # minutes
    completion_window = 180  # minutes

    lifecycle {
      delete_after = 7 # giữ 7 ngày
    }
  }

  tags = { Name = "foodiedash-backup-plan" }
}

# ── Backup Selection: tag-based bao phủ EFS + DocumentDB ──
resource "aws_backup_selection" "main" {
  name         = "foodiedash-backup-selection"
  plan_id      = aws_backup_plan.main.id
  iam_role_arn = aws_iam_role.backup.arn

  # Backup theo ARN cụ thể (đảm bảo bắt đúng resources)
  resources = [
    aws_efs_file_system.app.arn,
    aws_docdb_cluster.main.arn,
  ]
}

# ── Output EFS info ──
output "efs_id" {
  description = "EFS File System ID"
  value       = aws_efs_file_system.app.id
}

output "efs_dns" {
  description = "EFS DNS name for mounting"
  value       = aws_efs_file_system.app.dns_name
}

output "backup_vault_name" {
  description = "AWS Backup vault name"
  value       = aws_backup_vault.main.name
}
