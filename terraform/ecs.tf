# ─────────────────────────────────────────────
# PHASE 3: ECR
# ─────────────────────────────────────────────

resource "aws_ecr_repository" "foodiedash_be" {
  name                 = "foodiedash-be"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "foodiedash-be" }
}

resource "aws_ecr_lifecycle_policy" "foodiedash_be" {
  repository = aws_ecr_repository.foodiedash_be.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus   = "tagged"
          tagPrefixList = ["v"]
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images after 10 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}

# ─────────────────────────────────────────────
# PHASE 4: Secrets Manager
# ─────────────────────────────────────────────

resource "aws_secretsmanager_secret" "app" {
  name        = "/foodiedash/app"
  description = "FoodieDash application secrets"
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode(var.app_secrets)
}

# ─────────────────────────────────────────────
# PHASE 5: IAM Roles
# ─────────────────────────────────────────────

resource "aws_iam_role" "ecs_execution" {
  name = "foodiedash-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_policy" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "AllowSecretsAccess"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_secretsmanager_secret.app.arn
    }]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "foodiedash-fargate-be-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "S3MediaAccess"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::foodiedash-s3-media/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "arn:aws:s3:::foodiedash-logs/*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${var.account_id}:log-group:/ecs/foodiedash-*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel"
        ]
        Resource = "*"
      },
      # MH3: EFS access
      {
        Effect = "Allow"
        Action = [
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientWrite",
          "elasticfilesystem:ClientRootAccess"
        ]
        Resource = "*"
      }
    ]
  })
}

# ─────────────────────────────────────────────
# PHASE 6: ECS Cluster + Task + ALB + Service
# ─────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "foodiedash-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Name = "foodiedash-cluster" }
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/foodiedash-be"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "app" {
  family                   = "foodiedash-be"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  # MH3: EFS volume mount
  volume {
    name = "foodiedash-efs-volume"

    efs_volume_configuration {
      file_system_id          = aws_efs_file_system.app.id
      transit_encryption      = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.app.id
        iam             = "ENABLED"
      }
    }
  }

  container_definitions = jsonencode([
    {
      name  = "foodiedash-be"
      image = "${aws_ecr_repository.foodiedash_be.repository_url}:${var.ecr_image_tag}"
      portMappings = [{
        containerPort = 4000
        protocol      = "tcp"
      }]
      essential = true
      # MH3: Mount EFS vào /mnt/efs trong container
      mountPoints = [{
        sourceVolume  = "foodiedash-efs-volume"
        containerPath = "/mnt/efs"
        readOnly      = false
      }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/foodiedash-be"
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
          "awslogs-create-group"  = "true"
        }
      }
      secrets = [
        { name = "PORT",                    valueFrom = "${aws_secretsmanager_secret.app.arn}:PORT::" },
        { name = "NODE_ENV",                valueFrom = "${aws_secretsmanager_secret.app.arn}:NODE_ENV::" },
        { name = "MONGODB_URI",             valueFrom = "${aws_secretsmanager_secret.app.arn}:MONGODB_URI::" },
        { name = "AUTH_JWT_SECRET",         valueFrom = "${aws_secretsmanager_secret.app.arn}:AUTH_JWT_SECRET::" },
        { name = "AUTH_JWT_REFRESH_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:AUTH_JWT_REFRESH_SECRET::" },
        { name = "CLOUDINARY_CLOUD_NAME",   valueFrom = "${aws_secretsmanager_secret.app.arn}:CLOUDINARY_CLOUD_NAME::" },
        { name = "CLOUDINARY_API_KEY",      valueFrom = "${aws_secretsmanager_secret.app.arn}:CLOUDINARY_API_KEY::" },
        { name = "CLOUDINARY_API_SECRET",   valueFrom = "${aws_secretsmanager_secret.app.arn}:CLOUDINARY_API_SECRET::" },
        { name = "GEMINI_API_KEY",          valueFrom = "${aws_secretsmanager_secret.app.arn}:GEMINI_API_KEY::" },
        { name = "GROQ_API_KEY",            valueFrom = "${aws_secretsmanager_secret.app.arn}:GROQ_API_KEY::" },
        { name = "APP_ORIGIN",              valueFrom = "${aws_secretsmanager_secret.app.arn}:APP_ORIGIN::" },
        { name = "PAYOS_CLIENT_ID",         valueFrom = "${aws_secretsmanager_secret.app.arn}:PAYOS_CLIENT_ID::" },
        { name = "PAYOS_API_KEY",           valueFrom = "${aws_secretsmanager_secret.app.arn}:PAYOS_API_KEY::" },
        { name = "PAYOS_CHECKSUM_KEY",      valueFrom = "${aws_secretsmanager_secret.app.arn}:PAYOS_CHECKSUM_KEY::" },
        { name = "S3_BUCKET_MEDIA",         valueFrom = "${aws_secretsmanager_secret.app.arn}:S3_BUCKET_MEDIA::" },
        { name = "GOOGLE_APP_USER",         valueFrom = "${aws_secretsmanager_secret.app.arn}:GOOGLE_APP_USER::" },
        { name = "GOOGLE_APP_PASSWORD",     valueFrom = "${aws_secretsmanager_secret.app.arn}:GOOGLE_APP_PASSWORD::" },
      ]
    }
  ])
}

resource "aws_lb" "internal" {
  name               = "foodiedash-internal-alb"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.private_app_1.id, aws_subnet.private_app_2.id]

  tags = { Name = "foodiedash-internal-alb" }
}

resource "aws_lb_target_group" "app" {
  name        = "foodiedash-tg"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.internal.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

resource "aws_ecs_service" "app" {
  name            = "foodiedash-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  enable_execute_command = true

  network_configuration {
    subnets          = [aws_subnet.private_app_1.id, aws_subnet.private_app_2.id]
    security_groups  = [aws_security_group.fargate.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "foodiedash-be"
    container_port   = 4000
  }

  depends_on = [aws_lb_listener.http]
}
