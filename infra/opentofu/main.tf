variable "cloudflare_api_token" {
  description = "Cloudflare token scoped to DNS edit for the Verelle zone."
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  type = string
}

variable "origin_ipv4" {
  description = "The existing stephens.page origin selected by ADR 0005."
  type        = string
}

resource "cloudflare_dns_record" "verelle" {
  zone_id = var.cloudflare_zone_id
  name    = "verelle.app"
  type    = "A"
  content = var.origin_ipv4
  ttl     = 1
  proxied = true
}

output "verelle_hostname" {
  value = cloudflare_dns_record.verelle.name
}
