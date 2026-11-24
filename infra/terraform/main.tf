data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  prefix     = "${var.project}-${var.environment}"
  app_host   = var.domain_name
  media_host = "media.${var.domain_name}"
  # Names inside the delegated Route 53 zone that Cloudflare's CNAMEs point at (see dns.tf).
  app_origin_host   = var.delegated_zone_name
  media_origin_host = "media.${var.delegated_zone_name}"
  azs        = slice(data.aws_availability_zones.available.names, 0, 2)
  account_id = data.aws_caller_identity.current.account_id

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
