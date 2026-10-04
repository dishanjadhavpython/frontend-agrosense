/**
 * The VPC, and one decision worth explaining.
 *
 * There is no NAT Gateway. The reading service runs in a *public* subnet with
 * a public IP, and its security group admits traffic from the load balancer's
 * security group and from nowhere else.
 *
 * The textbook layout puts the task in a private subnet behind a NAT. That
 * costs $32/month before a single byte moves, and buys — here — nothing. The
 * task's only inbound path is the ALB either way, because the security group
 * says so; a private subnet would add a second, redundant control at the cost
 * of the most expensive line in this whole stack. The task does need outbound
 * internet (ECR, OpenAI, data.gov.in, DuckDuckGo), which is precisely what the
 * NAT would have been for.
 *
 * If this ever holds something a security group is not enough for, the change
 * is: add private subnets, add a NAT, move the service. The module is written
 * so that is a contained edit.
 */

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # Two AZs, because an ALB requires subnets in at least two. Not because the
  # single task is highly available — it is not, and pretending otherwise in a
  # comment would be worse than the single task.
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "main" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.name_prefix}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.name_prefix}-igw" }
}

resource "aws_subnet" "public" {
  count = length(local.azs)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${var.name_prefix}-public-${local.azs[count.index]}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${var.name_prefix}-public" }
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ---- Security groups -----------------------------------------------------

resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb"
  description = "Public entry point. Only CloudFront should reach this in practice."
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.name_prefix}-alb" }
}

# CloudFront's own address ranges, published by AWS as a managed prefix list.
# Restricting to it means the ALB cannot be hit directly, so the WAF attached
# to CloudFront cannot be walked around — which is the usual way an edge WAF
# turns out to be decorative.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# Port 80, because that is the port CloudFront's origin uses: TLS terminates at
# the edge and the origin is `http-only` (see the edge module). This rule used
# to open 443 while the listener and the origin both spoke 80, so every request
# CloudFront forwarded would have been dropped here. The listener additionally
# refuses anything without CloudFront's origin header (see the platform module),
# so the prefix list is the first of two locks, not the only one.
resource "aws_vpc_security_group_ingress_rule" "alb_from_cloudfront" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from CloudFront edge locations only"
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  description       = "To the service"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "service" {
  name        = "${var.name_prefix}-service"
  description = "The three services. Inbound from the ALB (web only) and from each other."
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.name_prefix}-service" }
}

# This rule is what makes the public subnet safe. Source is the ALB's security
# group, not a CIDR — so a public IP on the task is reachable by the load
# balancer and by nothing else on the internet.
resource "aws_vpc_security_group_ingress_rule" "service_from_alb" {
  security_group_id            = aws_security_group.service.id
  description                  = "The web app, from the load balancer only"
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = var.web_port
  to_port                      = var.web_port
}

# Service Connect traffic: the web app calling the reading service and the
# engine. Source is this same group, so the API and the engine answer the web
# app and nothing on the internet — neither has a public route of any kind.
resource "aws_vpc_security_group_ingress_rule" "service_from_service" {
  security_group_id            = aws_security_group.service.id
  description                  = "Service Connect between the three services"
  referenced_security_group_id = aws_security_group.service.id
  ip_protocol                  = "tcp"
  from_port                    = 1024
  to_port                      = 65535
}

# Outbound is open because the services genuinely need it: pulling images from
# ECR, Bedrock and Secrets Manager, Clerk's JWKS, and data.gov.in and the search
# backends the research tools call. There is no NAT to pin an address on.
resource "aws_vpc_security_group_egress_rule" "service_all" {
  security_group_id = aws_security_group.service.id
  description       = "ECR, Bedrock, Secrets Manager, Clerk, data.gov.in, search backends"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# ---- Gateway endpoint for S3 ---------------------------------------------
#
# Free, unlike the interface endpoints. Card uploads and downloads then travel
# inside the VPC rather than out through the internet gateway, which is both
# faster and keeps the traffic off the public path.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id]

  tags = { Name = "${var.name_prefix}-s3" }
}
