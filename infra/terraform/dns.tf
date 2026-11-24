# DNS split (docs/rebuild-from-zero.md §1.4):
#
#   Cloudflare (authoritative for the domain, records made by hand, never by Terraform)
#     <domain_name>          CNAME <delegated_zone_name>         (apex; Cloudflare flattens it)
#     media.<domain_name>    CNAME media.<delegated_zone_name>
#     <delegated_zone_name>  NS    the four Route 53 name servers
#     two ACM validation CNAMEs (stable per domain and account; printed by `cloudflare_records`)
#
#   Route 53 zone <delegated_zone_name> (created by hand, kept across sessions; Terraform owns
#   only the records below, which are the only DNS that changes per session)
#     <delegated_zone_name>        A alias -> load balancer
#     media.<delegated_zone_name>  A/AAAA alias -> CloudFront
#
# Browsers use the Cloudflare names, so the certificates, CloudFront alias, CORS origins,
# trusted origins and cookie domain all use <domain_name> and media.<domain_name>.

# The certificates are validated through CNAMEs in Cloudflare that Terraform cannot write.
# Each aws_acm_certificate_validation below only waits until ACM reports ISSUED, so apply the
# certificates first, add the records shown by `terraform output cloudflare_records`, then
# apply the validations (docs/rebuild-from-zero.md §2.2).

resource "aws_acm_certificate" "app" {
  domain_name       = local.app_host
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "app" {
  certificate_arn = aws_acm_certificate.app.arn

  timeouts {
    create = "10m" # fits the ~15-minute credential window; re-run once the Cloudflare record resolves
  }
}

resource "aws_acm_certificate" "media" {
  provider = aws.us_east_1

  domain_name       = local.media_host
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "media" {
  provider = aws.us_east_1

  certificate_arn = aws_acm_certificate.media.arn

  timeouts {
    create = "10m"
  }
}

data "aws_route53_zone" "delegated" {
  zone_id = var.hosted_zone_id
}

resource "aws_route53_record" "app_origin" {
  zone_id = var.hosted_zone_id
  name    = local.app_origin_host
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }

  lifecycle {
    precondition {
      condition     = trimsuffix(data.aws_route53_zone.delegated.name, ".") == var.delegated_zone_name
      error_message = "hosted_zone_id does not belong to the zone named delegated_zone_name."
    }
  }
}

resource "aws_route53_record" "media_origin" {
  for_each = toset(["A", "AAAA"]) # the distribution has IPv6 enabled

  zone_id = var.hosted_zone_id
  name    = local.media_origin_host
  type    = each.key

  alias {
    name                   = aws_cloudfront_distribution.media.domain_name
    zone_id                = aws_cloudfront_distribution.media.hosted_zone_id
    evaluate_target_health = false
  }
}
