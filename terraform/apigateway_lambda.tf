# ─────────────────────────────────────────────
# PHASE 7: API Gateway + VPC Link
# ─────────────────────────────────────────────

resource "aws_apigatewayv2_vpc_link" "main" {
  name               = "foodiedash-vpclink"
  security_group_ids = [aws_security_group.vpclink.id]
  subnet_ids         = [aws_subnet.private_app_1.id, aws_subnet.private_app_2.id]
  tags = { Name = "foodiedash-vpclink" }
}

resource "aws_apigatewayv2_api" "main" {
  name          = "foodiedash-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins     = ["https://${var.cloudfront_domain}"]
    allow_methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers     = ["Content-Type", "Authorization", "X-Requested-With", "Accept", "x-api-key"]
    allow_credentials = true
    max_age           = 300
  }

  tags = { Name = "foodiedash-api" }
}

resource "aws_apigatewayv2_integration" "alb" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "HTTP_PROXY"
  integration_method = "ANY"
  integration_uri    = aws_lb_listener.http.arn
  connection_type    = "VPC_LINK"
  connection_id      = aws_apigatewayv2_vpc_link.main.id
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "ANY /api/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.alb.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  # MH4: Throttling tại stage level
  default_route_settings {
    throttling_rate_limit  = 50   # requests/giây
    throttling_burst_limit = 100  # burst tối đa
  }
}

# ─────────────────────────────────────────────
# MH4: Lambda Authorizer cho /api/ai/ask
# HTTP API dùng Lambda Authorizer (type REQUEST)
# Header: x-api-key phải match giá trị cấu hình
# ─────────────────────────────────────────────

# IAM Role cho Authorizer Lambda
resource "aws_iam_role" "authorizer" {
  name = "foodiedash-authorizer-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "authorizer_basic" {
  role       = aws_iam_role.authorizer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Authorizer Lambda function (inline code — kiểm tra x-api-key header)
resource "aws_lambda_function" "authorizer" {
  function_name = "foodiedash-api-authorizer"
  role          = aws_iam_role.authorizer.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 5
  memory_size   = 128

  filename         = "${path.module}/lambda/authorizer.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda/authorizer.zip")

  environment {
    variables = {
      VALID_API_KEY = "foodiedash-w5-api-key-2026"
    }
  }

  tags = { Name = "foodiedash-api-authorizer" }
}

resource "aws_lambda_permission" "authorizer_apigw" {
  statement_id  = "AllowAPIGatewayInvokeAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# API Gateway Authorizer (HTTP API — type REQUEST, payload 2.0)
resource "aws_apigatewayv2_authorizer" "api_key" {
  api_id                            = aws_apigatewayv2_api.main.id
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = aws_lambda_function.authorizer.invoke_arn
  identity_sources                  = ["$request.header.x-api-key"]
  name                              = "foodiedash-api-key-authorizer"
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true
  authorizer_result_ttl_in_seconds  = 300
}

# Gắn authorizer vào route POST /api/ai/ask
resource "aws_apigatewayv2_route" "ai_ask_authorized" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /api/ai/ask"
  target             = "integrations/${aws_apigatewayv2_integration.ai_lambda.id}"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.api_key.id
}

# Output API key để dùng trong curl test
output "api_key_value" {
  description = "x-api-key header value for authenticated requests"
  value       = "foodiedash-w5-api-key-2026"
  sensitive   = false
}

# ─────────────────────────────────────────────
# PHASE 10: Lambda AI Handler
# ─────────────────────────────────────────────

resource "aws_iam_role" "ai_handler" {
  name = "foodiedash-ai-handler-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ai_handler_basic" {
  role       = aws_iam_role.ai_handler.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "ai_handler_bedrock" {
  name = "BedrockAccess"
  role = aws_iam_role.ai_handler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "bedrock:RetrieveAndGenerate",
        "bedrock:Retrieve",
        "bedrock:InvokeModel",
        "bedrock:GetInferenceProfile",
        "bedrock:InvokeModelWithResponseStream"
      ]
      Resource = "*"
    }]
  })
}

resource "aws_lambda_function" "ai_handler" {
  function_name = "foodiedash-ai-handler"
  role          = aws_iam_role.ai_handler.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 128
  filename      = "${path.module}/lambda/ai_handler.zip"
  publish       = true # MH5: cần publish version để dùng Provisioned Concurrency

  environment {
    variables = {
      KNOWLEDGE_BASE_ID = var.kb_id
      AWS_ACCOUNT_ID    = var.account_id
    }
  }

  tags = { Name = "foodiedash-ai-handler" }
}

resource "aws_lambda_permission" "apigw_ai" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ai_handler.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "ai_lambda" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.ai_handler.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

# POST /api/ai/ask — định nghĩa trong phần MH4 bên dưới (có authorizer)
# OPTIONS /api/ai/ask — CORS preflight, không cần auth
resource "aws_apigatewayv2_route" "ai_ask_options" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "OPTIONS /api/ai/ask"
  target    = "integrations/${aws_apigatewayv2_integration.ai_lambda.id}"
}

# ─────────────────────────────────────────────
# Lambda Sync KB
# ─────────────────────────────────────────────

resource "aws_iam_role" "sync_kb" {
  name = "foodiedash-sync-kb-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "sync_kb_basic" {
  role       = aws_iam_role.sync_kb.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "sync_kb_policy" {
  name = "SyncKbPolicy"
  role = aws_iam_role.sync_kb.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.kb.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock:StartIngestionJob"]
        Resource = "arn:aws:bedrock:${var.aws_region}:${var.account_id}:knowledge-base/*"
      }
    ]
  })
}

resource "aws_lambda_function" "sync_kb" {
  function_name = "foodiedash-sync-kb"
  role          = aws_iam_role.sync_kb.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 60
  filename      = "${path.module}/lambda/sync_kb.zip"

  environment {
    variables = {
      KNOWLEDGE_BASE_ID = var.kb_id
      DATA_SOURCE_ID    = var.ds_id
      API_URL           = aws_apigatewayv2_api.main.api_endpoint
    }
  }

  tags = { Name = "foodiedash-sync-kb" }
}

# EventBridge Rule - Daily sync at 2AM Vietnam (7PM UTC)
resource "aws_cloudwatch_event_rule" "daily_sync" {
  name                = "foodiedash-kb-daily-sync"
  description         = "Trigger KB sync daily at 2AM Vietnam time"
  schedule_expression = "cron(0 19 * * ? *)"
}

resource "aws_cloudwatch_event_target" "sync_kb" {
  rule      = aws_cloudwatch_event_rule.daily_sync.name
  target_id = "SyncKbLambda"
  arn       = aws_lambda_function.sync_kb.arn
}

resource "aws_lambda_permission" "eventbridge_sync" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sync_kb.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_sync.arn
}

# ─────────────────────────────────────────────
# MH5: Lambda Scaling Pattern — Provisioned Concurrency
# Apply lên ai_handler (function thật, đứng sau API Gateway MH4)
# Mục tiêu: loại bỏ cold start, init_duration = 0ms sau khi bật
# ─────────────────────────────────────────────

# Alias trỏ vào version được publish bởi ai_handler (publish = true ở trên)
resource "aws_lambda_alias" "ai_handler_live" {
  name             = "live"
  function_name    = aws_lambda_function.ai_handler.function_name
  function_version = aws_lambda_function.ai_handler.version
}

# Provisioned Concurrency = 1 (pre-warm, loại bỏ cold start)
# Chi phí ước tính: ~$0.015/hour cho 1 PC unit ở us-west-2
resource "aws_lambda_provisioned_concurrency_config" "ai_handler" {
  function_name                  = aws_lambda_function.ai_handler.function_name
  qualifier                      = aws_lambda_alias.ai_handler_live.name
  provisioned_concurrent_executions = 1
}
