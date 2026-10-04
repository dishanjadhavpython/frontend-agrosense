environment = "prod"
region      = "ap-south-1"

backend_cpu           = 1024
backend_memory        = 4096
backend_desired_count = 1

waf_rate_limit_per_5min     = 2000
waf_api_rate_limit_per_5min = 200
# ~$10/month plus per-request. Worth it once there is traffic to protect.
waf_bot_control = true

monthly_budget_usd = 250
# budget_alert_email = "you@example.com"

# See `card_retention_days` — an engineering default, not legal advice.
card_retention_days = 90


web_cpu           = 512
web_memory        = 1024
web_desired_count = 2 # two web tasks: a deploy or a crash never leaves zero
engine_cpu        = 1024
engine_memory     = 4096

# clerk_publishable_key = "pk_live_..."

# Worth paying for once real farmers' cards are in the system.
guardduty_runtime_monitoring = true
enable_security_hub          = true
enable_inspector             = true
