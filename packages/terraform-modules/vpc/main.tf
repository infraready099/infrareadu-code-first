locals {
  name = "${var.project_name}-${var.environment}"

  # Use provided AZs or default to first 2 in region
  azs = length(var.availability_zones) > 0 ? var.availability_zones : [
    "${var.aws_region}a",
    "${var.aws_region}b"
  ]

  # Calculate subnet CIDRs from VPC CIDR
  # Public subnets: 10.0.0.0/20, 10.0.16.0/20
  # Private subnets: 10.0.128.0/20, 10.0.144.0/20
  public_subnets  = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 4, i)]
  private_subnets = [for i, az in local.azs : cidrsubnet(var.vpc_cidr, 4, i + 8)]

  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "infraready"
    Module      = "vpc"
  })
}

# ─── VPC ────────────────────────────────────────────────────────────────────

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${local.name}-vpc"
  })
}

# ─── INTERNET GATEWAY ───────────────────────────────────────────────────────

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${local.name}-igw"
  })
}

# ─── PUBLIC SUBNETS ─────────────────────────────────────────────────────────

resource "aws_subnet" "public" {
  count = length(local.azs)

  vpc_id                  = aws_vpc.this.id
  cidr_block              = local.public_subnets[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${local.name}-public-${local.azs[count.index]}"
    Tier = "public"
    # Tag required for EKS/ECS ALB auto-discovery
    "kubernetes.io/role/elb" = "1"
  })
}

# ─── PRIVATE SUBNETS ────────────────────────────────────────────────────────

resource "aws_subnet" "private" {
  count = length(local.azs)

  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_subnets[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(local.common_tags, {
    Name = "${local.name}-private-${local.azs[count.index]}"
    Tier = "private"
    # Tag required for EKS internal load balancers
    "kubernetes.io/role/internal-elb" = "1"
  })
}

# ─── ELASTIC IPs FOR NAT GATEWAYS ───────────────────────────────────────────

resource "aws_eip" "nat" {
  # One EIP per AZ (or one total if single_nat_gateway)
  count  = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : length(local.azs)) : 0
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = var.single_nat_gateway ? "${local.name}-nat-eip" : "${local.name}-nat-eip-${local.azs[count.index]}"
  })

  depends_on = [aws_internet_gateway.this]
}

# ─── NAT GATEWAYS ───────────────────────────────────────────────────────────

resource "aws_nat_gateway" "this" {
  count = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : length(local.azs)) : 0

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.common_tags, {
    Name = var.single_nat_gateway ? "${local.name}-nat" : "${local.name}-nat-${local.azs[count.index]}"
  })

  depends_on = [aws_internet_gateway.this]
}

# ─── ROUTE TABLES ───────────────────────────────────────────────────────────

# Public route table — routes to internet gateway
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-rt-public"
  })
}

resource "aws_route_table_association" "public" {
  count = length(local.azs)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private route tables — one per AZ, each routes to its NAT gateway
resource "aws_route_table" "private" {
  count  = length(local.azs)
  vpc_id = aws_vpc.this.id

  dynamic "route" {
    for_each = var.enable_nat_gateway ? [1] : []
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = var.single_nat_gateway ? aws_nat_gateway.this[0].id : aws_nat_gateway.this[count.index].id
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-rt-private-${local.azs[count.index]}"
  })
}

resource "aws_route_table_association" "private" {
  count = length(local.azs)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# ─── VPC FLOW LOGS ──────────────────────────────────────────────────────────
# SOC2 CC6.1 — Required for network traffic monitoring

resource "aws_cloudwatch_log_group" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name              = "/infraready/${local.name}/vpc-flow-logs"
  retention_in_days = var.flow_log_retention_days

  tags = local.common_tags
}

resource "aws_iam_role" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name = "${local.name}-vpc-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "vpc-flow-logs.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name   = "${local.name}-vpc-flow-logs-policy"
  role   = aws_iam_role.flow_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ]
      Resource = "*"
    }]
  })
}

resource "aws_flow_log" "this" {
  count = var.enable_flow_logs ? 1 : 0

  vpc_id          = aws_vpc.this.id
  traffic_type    = "ALL"
  iam_role_arn    = aws_iam_role.flow_logs[0].arn
  log_destination = aws_cloudwatch_log_group.flow_logs[0].arn

  tags = merge(local.common_tags, {
    Name = "${local.name}-flow-logs"
  })
}

# ─── DEFAULT SECURITY GROUP — DENY ALL ──────────────────────────────────────
# Override default SG to have no rules — prevents accidental use

resource "aws_default_security_group" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${local.name}-default-sg-DO-NOT-USE"
  })
}
