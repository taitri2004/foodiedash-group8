# ─────────────────────────────────────────────
# PHASE 8: S3 Buckets + CloudFront
# ─────────────────────────────────────────────

# FE Bucket
resource "aws_s3_bucket" "fe" {
  bucket        = "foodiedash-fe-${var.account_id}"
  force_destroy = true
  tags = { Name = "foodiedash-fe" }
}

resource "aws_s3_bucket_public_access_block" "fe" {
  bucket                  = aws_s3_bucket.fe.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Media Bucket
resource "aws_s3_bucket" "media" {
  bucket = "foodiedash-s3-media"
  tags = { Name = "foodiedash-s3-media" }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "DELETE", "HEAD"]
    allowed_origins = ["https://${var.cloudfront_domain}"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Logs Bucket
resource "aws_s3_bucket" "logs" {
  bucket        = "foodiedash-logs"
  force_destroy = true
  tags = { Name = "foodiedash-logs" }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    filter {} # apply to all objects

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
  }
}

# Knowledge Base Bucket
resource "aws_s3_bucket" "kb" {
  bucket = "foodie-knowledgebase"
  tags = { Name = "foodie-knowledgebase" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "kb" {
  bucket = aws_s3_bucket.kb.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "kb" {
  bucket                  = aws_s3_bucket.kb.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront OAI
resource "aws_cloudfront_origin_access_identity" "fe" {
  comment = "OAI for FoodieDash FE bucket"
}

# FE bucket policy for CloudFront OAI
resource "aws_s3_bucket_policy" "fe" {
  bucket = aws_s3_bucket.fe.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = aws_cloudfront_origin_access_identity.fe.iam_arn }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.fe.arn}/*"
    }]
  })
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "FoodieDash FE CDN"

  # FE Origin (S3)
  origin {
    domain_name = aws_s3_bucket.fe.bucket_regional_domain_name
    origin_id   = "fe-s3-origin"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.fe.cloudfront_access_identity_path
    }
  }

  # Media Origin (S3)
  origin {
    domain_name = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id   = "media-s3-origin"

    s3_origin_config {
      origin_access_identity = ""
    }
  }

  # Default behavior (FE)
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "fe-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  # Avatars behavior (Media S3)
  ordered_cache_behavior {
    path_pattern           = "/avatars/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "media-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  # Products behavior (Media S3)
  ordered_cache_behavior {
    path_pattern           = "/products/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "media-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  # SPA fallback
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = { Name = "foodiedash-cdn" }
}
