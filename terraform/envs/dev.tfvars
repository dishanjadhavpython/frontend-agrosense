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

monthly_budget_usd = 150 # dev runs ~$95 + Bedrock; a lower figure alerts every month
# budget_alert_email = "you@example.com"

card_retention_days = 30

# Replace with the OpenNext function URL host after the first apply.

# The web app and the engine, smallest sizes that hold their working set.
web_cpu       = 512
web_memory    = 1024
engine_cpu    = 1024
engine_memory = 4096

# Clerk's publishable key (pk_test_... / pk_live_...). Public by design.
# clerk_publishable_key = "pk_test_..."

# Security services that bill per use stay off in dev.
guardduty_runtime_monitoring = false
enable_security_hub          = false
enable_inspector             = false
