variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "account_id" {
  description = "AWS Account ID"
  type        = string
  default     = "910012064913"
}

variable "app_secrets" {
  description = "Application secrets"
  type        = map(string)
  sensitive   = true
  default = {
    PORT                   = "4000"
    NODE_ENV               = "production"
    MONGODB_URI            = "REPLACE_ME"
    AUTH_JWT_SECRET        = "REPLACE_ME"
    AUTH_JWT_REFRESH_SECRET = "REPLACE_ME"
    CLOUDINARY_CLOUD_NAME  = "REPLACE_ME"
    CLOUDINARY_API_KEY     = "REPLACE_ME"
    CLOUDINARY_API_SECRET  = "REPLACE_ME"
    GEMINI_API_KEY         = "REPLACE_ME"
    GROQ_API_KEY           = "REPLACE_ME"
    APP_ORIGIN             = "REPLACE_ME"
    PAYOS_CLIENT_ID        = "REPLACE_ME"
    PAYOS_API_KEY          = "REPLACE_ME"
    PAYOS_CHECKSUM_KEY     = "REPLACE_ME"
    S3_BUCKET_MEDIA        = "foodiedash-s3-media"
    GOOGLE_APP_USER        = "REPLACE_ME"
    GOOGLE_APP_PASSWORD    = "REPLACE_ME"
  }
}

variable "docdb_master_password" {
  description = "DocumentDB master password"
  type        = string
  sensitive   = true
  default     = "REPLACE_ME"
}

variable "cloudfront_domain" {
  description = "CloudFront domain (fill after first deploy)"
  type        = string
  default     = "REPLACE_WITH_CF_DOMAIN"
}

variable "kb_id" {
  description = "Bedrock Knowledge Base ID (fill after creating KB manually)"
  type        = string
  default     = "REPLACE_WITH_KB_ID"
}

variable "ds_id" {
  description = "Bedrock Data Source ID"
  type        = string
  default     = "REPLACE_WITH_DS_ID"
}

variable "ecr_image_tag" {
  description = "ECR image tag to deploy"
  type        = string
  default     = "latest"
}
