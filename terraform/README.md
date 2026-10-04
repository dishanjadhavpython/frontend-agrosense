# AgroSense on AWS

```
farmer's phone ──HTTPS──► CloudFront + WAF ──HTTP + origin header──► ALB
                                                                    │ (refuses anything without it)
                                                                    ▼
                                                     web   Next.js on Fargate (ARM64)
                                                      │  Service Connect — private, no public route
                                      ┌───────────────┴───────────────┐
                                      ▼                               ▼
                       api  reading service (FastAPI)      engine  taluka × season engine
                        │   OCR · soil CNN · crop & fertilizer models · chat · document Q&A
                        ├──► Amazon Bedrock — Nova Pro (APAC profile) + Guardrail
                        └──► DynamoDB (reports, rate limits) · S3 (uploads)
EventBridge (30 min) ──► Lambda research sweep ──► Bedrock · DynamoDB
KMS · CloudTrail · GuardDuty · IAM Access Analyzer   (+ Security Hub, Inspector — opt-in)
```

Everything runs in **ap-south-1 (Mumbai)**, next to the farmers and the
Agmarknet data. CloudFront and its WAF are global and live in us-east-1, which
is an AWS requirement, not a choice.

## Why this shape

- **Three always-warm services, one Lambda.** A farmer waits on the web app,
  the reading service and the engine, and the reading service loads torch — a
  30–60 s cold start on exactly the request someone is standing there for. The
  research sweep is the opposite: nobody waits on it and it idles most of the
  day, so it scales to zero.
- **Only the web app is public.** The browser never calls the reading service
  or the engine; the Next.js server does. So those two have no load balancer,
  no listener and no route from the internet at all — they answer the web app
  over ECS Service Connect (`http://api:8000`, `http://engine:8001`).
- **No model keys.** Every model call goes to Amazon Bedrock with the calling
  task's or function's IAM role. There is no third-party API key to leak or
  rotate.
- **One place for research state.** The sweep Lambda and the reading service
  share one DynamoDB table (`backend/agents/kv.py`). A report the Lambda writes
  is the report the farmer's page reads.

## Security controls

| Layer | Control |
|---|---|
| Edge | CloudFront TLS; WAF: IP reputation, AWS common rules, known-bad inputs, per-IP rate limits on the site, on `/api/*` and on `/api/chat`; bot control opt-in; WAF logs with cookies and `Authorization` redacted |
| Origin | ALB admits only CloudFront's managed prefix list **and** only requests carrying the `X-AgroSense-Origin` secret; everything else gets 403 |
| Network | API and engine reachable only from the web app's security group; no public route |
| Identity | Clerk session verified in the web app and again in the API; per-user daily quotas (`backend/ratelimit.py`) |
| IAM | One task role per service: web and engine have **no** AWS permissions; the API may call Bedrock (Nova Pro + guardrail only), its DynamoDB tables and the uploads prefix |
| Secrets | Secrets Manager, encrypted with a customer-managed KMS key; required ones injected by ECS, optional ones read at boot; never in Terraform state |
| Data | S3 uploads: public access blocked, encrypted, versioned, TLS-only, 90-day expiry; DynamoDB encrypted at rest |
| AI | Bedrock Guardrail on the chat: content filters, prompt-attack detection, credential blocking, Aadhaar masking |
| Audit | CloudTrail, all regions, KMS-encrypted, log-file validation |
| Detection | GuardDuty (S3 data events, Lambda network activity; ECS runtime monitoring opt-in); IAM Access Analyzer; Security Hub and Inspector opt-in |
| Containers | Non-root users, all Linux capabilities dropped, scan on push, deployment circuit breaker with rollback |

## What it costs

At low traffic, per month, ap-south-1, ARM64:

| Item | Approx. |
|---|---|
| Fargate — web 0.5 vCPU / 1 GB | ~$12 |
| Fargate — api 0.5 vCPU / 3 GB (dev) | ~$16 |
| Fargate — engine 1 vCPU / 4 GB | ~$27 |
| ALB | ~$18 |
| WAF — web ACL + 6 rules | ~$12 |
| CloudFront, Lambda, DynamoDB, S3, Secrets Manager, KMS, CloudTrail, GuardDuty | ~$10 |
| Bedrock Nova Pro | per use — ~$0.06 per researched topic, ~$0.002 per chat message |
| **total (dev)** | **~$95 + Bedrock** |

`envs/prod.tfvars` doubles the web tasks and turns on bot control, GuardDuty
runtime monitoring, Security Hub and Inspector — roughly $150–200 plus Bedrock.
The budget alert defaults to $150 (dev) and $250 (prod).

No NAT Gateway: the tasks sit in public subnets with public IPs, and the
security groups — not the subnet — keep inbound traffic out.

## Deploying

Deployment is a GitHub Actions pipeline. Pushing to `main` deploys.

```
.github/workflows/ci.yml       every push and pull request — no AWS access
  web        eslint · tsc · CSP-hash and ontology checks · next build
  terraform  fmt · validate (main and bootstrap)

.github/workflows/deploy.yml   push to main, or run by hand
  test       reading-service tests (fetches the trained models)
  prepare    the four ECR repositories (a no-op after the first run)
  build      api · agents · web · engine — ARM64, on GitHub's ARM runners,
             tagged with the commit SHA; the engine fits its pipeline into
             the image and answers one recommendation before it is pushed
  deploy     terraform plan → apply with those tags, wait for ECS to settle,
             smoke-test the site, the engine path and the 403 at the origin
```

No AWS key is stored in GitHub: each job exchanges GitHub's OIDC token for
the `agrosense-github-deploy` role, which trusts only this repository's `dev`
environment. The engine is its own repository, linked as a git submodule.

### Once per account (already done for this account)

1. **Bedrock** — Amazon Nova Pro must be invocable in ap-south-1.
2. **Bootstrap** — the state bucket, the private build-inputs bucket and the
   GitHub OIDC role:

   ```bash
   cd terraform/bootstrap
   printf 'terraform {\n  backend "local" {}\n}\n' > backend_override.tf
   terraform init && terraform apply
   rm backend_override.tf
   terraform init -migrate-state -backend-config="bucket=$(terraform output -raw tfstate_bucket)" \
     -backend-config="key=bootstrap/terraform.tfstate" -backend-config="region=ap-south-1" \
     -backend-config="use_lockfile=true" -backend-config="encrypt=true"
   ```

3. **Build inputs** — what a public repository must not carry:

   ```bash
   B=s3://$(terraform -chdir=terraform/bootstrap output -raw build_inputs_bucket)
   aws s3 sync ML/models "$B/ML/models" --exclude "legacy_8class/*" --exclude "soil_v2/*" --exclude "soil_v2_4class/*"
   aws s3 sync "ml engine for Recommendation/data" "$B/engine/data" --exclude "raw/_rejected/*" --exclude "*.md"
   aws s3 sync "ml engine for Recommendation/artifacts" "$B/engine/artifacts" --exclude "pipeline_*.joblib"
   ```

   Re-run these after retraining a model or refreshing the engine's data.

4. **Secrets** — created by Terraform, filled once by hand:

   ```bash
   cd terraform
   terraform init -backend-config=backend.hcl        # backend.hcl is git-ignored
   terraform apply -var-file=envs/dev.tfvars -var clerk_publishable_key=pk_… \
     -target='module.platform.aws_secretsmanager_secret.app'
   aws secretsmanager put-secret-value --secret-id agrosense-dev/clerk-secret-key   --secret-string 'sk_…'
   aws secretsmanager put-secret-value --secret-id agrosense-dev/agrosense-api-key  --secret-string "$(openssl rand -hex 32)"
   # optional — each tool runs keyless without one
   aws secretsmanager put-secret-value --secret-id agrosense-dev/youtube-api-key     --secret-string '…'
   aws secretsmanager put-secret-value --secret-id agrosense-dev/data-gov-in-api-key --secret-string '…'
   ```

5. **GitHub** — an environment named `dev`, and four repository variables:
   `AWS_DEPLOY_ROLE_ARN`, `TF_STATE_BUCKET`, `BUILD_INPUTS_BUCKET` (the
   bootstrap outputs) and `CLERK_PUBLISHABLE_KEY`. Approval rules can be added
   to the `dev` environment in the repository settings.

### Every deploy

```bash
git push origin main          # then watch: gh run watch
```

### Clerk

Add the `site_url` origin to the Clerk application's allowed origins (and use a
production instance with `pk_live_`/`sk_live_` keys for real farmers). A Clerk
production instance needs a domain you own — it asks for DNS records, which a
`*.cloudfront.net` address cannot have — so set `domain_name` and
`acm_certificate_arn` first. Google and Apple sign-in also need your own OAuth
credentials in a production instance; the development instance borrows Clerk's.

The reading service accepts only session tokens issued to `site_url`
(`CLERK_AUTHORIZED_PARTIES`, set by Terraform), so a token minted for any other
site on the same Clerk instance is refused.

### Open it

```bash
terraform output site_url
```

## Checking it

```bash
terraform fmt -recursive -check
terraform validate
terraform plan -var-file=envs/dev.tfvars
checkov -d .          # if you have it
```

`alb_dns_name` answers **403** to a request from a laptop. That is correct: the
listener forwards only requests carrying CloudFront's origin header, so the WAF
cannot be walked around by going straight to the origin.

## Tearing down

```bash
terraform destroy -var-file=envs/dev.tfvars
```

In `prod`, the ALB has deletion protection and secrets a 30-day recovery
window; both are deliberate.
