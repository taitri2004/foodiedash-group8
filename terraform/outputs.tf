output "api_gateway_url" {
  description = "API Gateway endpoint URL"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain (use this as APP_ORIGIN)"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for invalidation)"
  value       = aws_cloudfront_distribution.main.id
}

output "ecr_repository_url" {
  description = "ECR repository URL for pushing images"
  value       = aws_ecr_repository.foodiedash_be.repository_url
}

output "docdb_endpoint" {
  description = "DocumentDB cluster endpoint (writer)"
  value       = aws_docdb_cluster.main.endpoint
}

output "docdb_reader_endpoint" {
  description = "DocumentDB reader endpoint"
  value       = aws_docdb_cluster.main.reader_endpoint
}

output "fe_bucket_name" {
  description = "S3 FE bucket name"
  value       = aws_s3_bucket.fe.bucket
}

output "media_bucket_name" {
  description = "S3 Media bucket name"
  value       = aws_s3_bucket.media.bucket
}

output "kb_bucket_name" {
  description = "S3 Knowledge Base bucket name"
  value       = aws_s3_bucket.kb.bucket
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "next_steps" {
  description = "Post-deploy checklist"
  value       = <<-EOT
    ✅ Infrastructure deployed! Next steps:
    1. Copy CloudFront domain → update APP_ORIGIN in Secrets Manager
    2. Push Docker image to ECR: ${aws_ecr_repository.foodiedash_be.repository_url}
    3. Build FE → sync to S3: ${aws_s3_bucket.fe.bucket}
    4. Create Bedrock Knowledge Base manually → update kb_id variable
    5. Upload KB files to: ${aws_s3_bucket.kb.bucket}
    6. Run DMS migration Atlas → DocumentDB
    7. Test: ${aws_apigatewayv2_api.main.api_endpoint}/api/products
  EOT
}
