# AgroSense on AWS

```
                        CloudFront  +  WAF
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
 /_next/static/*       everything else          /api/py/*
       │                      │                      │
      S3            Lambda (Next, OpenNext)   ALB → Fargate (ARM64)
                                                     │  torch, tesseract
                                      S3 · DynamoDB · Secrets Manager
                                                     ▲
                          EventBridge (30 min) → Lambda (research sweep)
```

Two shapes of compute, picked for two different reasons rather than for
consistency:

- **The reading service is always warm.** It loads torch and tesseract. On
  Lambda that is a 30–60 second cold start on the first prediction after any
  quiet period — on exactly the request a farmer is standing there waiting for.
  Fargate costs ~$20/month and removes the problem instead of mitigating it.
- **The research sweep scales to zero.** It runs every 30 minutes, idles most
  of the day, and nobody waits on it. That is the shape Lambda is for.

On-demand research — the runs that start the moment somebody hits Predict —
happens in-process on the Fargate task, not in the Lambda. It has to begin
inside the request and report progress back through `/api/insights/…`. See
`backend/agents/queue.py`.

---

## What it costs

At low traffic, per month:

| | |
|---|---|
| ALB | $16 |
| Fargate, 0.5 vCPU / 3 GB, always on (ARM) | ~$20 |
| WAF — web ACL + 4 rules | ~$10 |
| CloudFront, Lambda, S3, DynamoDB, Secrets | ~$5 |
| **total** | **~$50** |

Two deliberate savings, both worth knowing about before you change anything:

- **No NAT Gateway** — $32/month avoided. The Fargate task sits in a *public*
  subnet with a public IP, and its security group admits traffic from the load
  balancer's security group and nothing else. A private subnet plus NAT would
  add a second, redundant control at the price of the largest line in the
  stack. The task genuinely needs outbound internet (ECR, OpenAI, data.gov.in,
  the search backends), which is exactly what the NAT would have been for.
- **`PriceClass_200`** — no edge locations in South America or Australia. The
  audience is Maharashtra.

`waf_bot_control` is off by default. It is about $10/month plus per-request
charges — the biggest optional line here, and turning it on silently would be
a cost surprise. `envs/prod.tfvars` enables it.

The ALB is the line most worth questioning later: CloudFront can reach a
Fargate task directly with a shared origin secret and save the $16, at the cost
of a stable DNS name and health checks. Not in v1.

---

## Deploying

### 0. Once per account

```bash
cd terraform
terraform init
```

### 1. First apply

`next_origin_domain` has no correct default — it is the OpenNext function URL,
which does not exist yet. Pass a placeholder:

```bash
terraform apply -var-file=envs/dev.tfvars -var next_origin_domain=example.com
```

### 2. Put the secrets in

Terraform creates the secrets empty and never holds their values — anything
passed as a resource argument is stored in plaintext in state.

```bash
terraform output -json secret_arns | jq -r 'to_entries[] | "\(.key)\t\(.value)"'

aws secretsmanager put-secret-value \
  --secret-id agrosense-dev/openai-api-key   --secret-string 'sk-...'
aws secretsmanager put-secret-value \
  --secret-id agrosense-dev/clerk-secret-key --secret-string 'sk_live_...'
aws secretsmanager put-secret-value \
  --secret-id agrosense-dev/agrosense-api-key \
  --secret-string "$(openssl rand -hex 32)"
```

### 3. Build and push the reading service

**ARM64.** The task definition pins `cpu_architecture = "ARM64"` — Graviton is
~20% cheaper and torch ships ARM wheels. An amd64 image fails at boot with an
exec format error, which reads as a crash loop rather than as a build mistake.

On an Apple Silicon Mac this is the native build. On an Intel machine or in CI,
name the platform:

```bash
REPO=$(terraform output -raw backend_ecr_repository)
aws ecr get-login-password --region ap-south-1 \
  | docker login --username AWS --password-stdin "${REPO%%/*}"

cd ..
docker build --platform linux/arm64 -f backend/Dockerfile -t "$REPO:latest" .
docker push "$REPO:latest"

aws ecs update-service --cluster "$(terraform -chdir=terraform output -raw ecs_cluster)" \
  --service "$(terraform -chdir=terraform output -raw ecs_service)" \
  --force-new-deployment
```

First boot takes ~60s — that is torch loading, and the ALB health check has a
180s grace period for it.

### 4. Build and push the research sweep

Same repository layout, different image and entrypoint (`backend.agents.pipeline`).

```bash
REPO=$(terraform output -raw agents_ecr_repository)
docker build --platform linux/arm64 -f backend/Dockerfile.agents -t "$REPO:latest" .
docker push "$REPO:latest"
aws lambda update-function-code --function-name agrosense-dev-agents --image-uri "$REPO:latest"
```

### 5. The Next.js half

OpenNext builds the Lambda bundle and the static assets. It is not in this
Terraform because it owns the Next build output, and a module that tried to
own that would have to know about it.

```bash
npx @opennextjs/aws build
aws s3 sync .open-next/assets "s3://$(terraform -chdir=terraform output -raw frontend_bucket)/_next/static" \
  --cache-control "public,max-age=31536000,immutable"
# deploy .open-next/server-function as a Lambda with a function URL, then:
terraform apply -var-file=envs/dev.tfvars -var next_origin_domain=<id>.lambda-url.ap-south-1.on.aws
```

### 6. Open it

```bash
terraform output site_url
```

---

## Checking it

```bash
terraform fmt -recursive -check
terraform validate
checkov -d .          # if you have it
```

The ALB's DNS name is an output, and **curling it from a laptop will time
out**. That is correct: its security group admits only CloudFront's published
prefix list, so the WAF cannot be walked around by going straight to the
origin — which is the usual reason an edge WAF turns out to be decorative.

## Tearing down

```bash
terraform destroy -var-file=envs/dev.tfvars -var next_origin_domain=example.com
```

`prod` has deletion protection on the ALB and a 30-day recovery window on
secrets, both of which have to be cleared by hand first. `dev` does not.
