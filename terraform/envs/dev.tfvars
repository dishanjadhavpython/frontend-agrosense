environment = "dev"
region      = "ap-south-1"

# Smallest that still holds torch without swapping under a prediction.
backend_cpu           = 512
backend_memory        = 3072
backend_desired_count = 1

# Loose while there is no real traffic to characterise.
waf_rate_limit_per_5min     = 2000
waf_api_rate_limit_per_5min = 300
waf_bot_control             = false

monthly_budget_usd = 40
# budget_alert_email = "you@example.com"

card_retention_days = 30

# Replace with the OpenNext function URL host after the first apply.
next_origin_domain = "example.com"
