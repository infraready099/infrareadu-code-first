# ─── MODULE: NETWORKING ───────────────────────────────────────────────────────
# Centralized network hub running in the dedicated network account.
#
# Resources:
#   - Transit Gateway — connects all VPCs across all workload accounts
#   - TGW route tables — spoke (workload accounts) and inspection (for future GWLB)
#   - TGW VPC attachment accepter — accepts spoke VPC attachments
#   - RAM resource share — shares the TGW with the entire org (no peering needed)
#   - Centralized egress VPC with NAT (optional, var.enable_centralized_egress)
#
# Transit Gateway cost: ~$0.05/hr per attachment + $0.02/GB data.
# For a 6-account org with 5 attachments: ~$180/mo baseline + data transfer.
#
# This module runs in the NETWORK account.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
}

locals {
  common_tags = merge(var.tags, {
    Module = "networking"
  })

  # Egress VPC CIDR — small, used only for NAT gateway
  egress_vpc_cidr    = "100.64.0.0/24"
  egress_public_cidr = "100.64.0.0/26"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ─── TRANSIT GATEWAY ──────────────────────────────────────────────────────────
# The TGW acts as the central routing hub for all VPCs.
# Benefits over VPC peering:
#   - Transitive routing (A→hub→B without direct A↔B peering)
#   - Single management point for routing policy
#   - Supports VPN, Direct Connect Gateway attachment

resource "aws_ec2_transit_gateway" "this" {
  description = "${var.org_name} Landing Zone Transit Gateway"

  # Default route table association/propagation is DISABLED.
  # We manage route tables explicitly for full control over routing policy.
  default_route_table_association = "disable"
  default_route_table_propagation = "disable"

  # DNS support allows VPCs connected to TGW to resolve each other's hostnames
  dns_support = "enable"

  # ECMP support for VPN redundancy — active-active across multiple VPN tunnels
  vpn_ecmp_support = "enable"

  # Allow cross-account attachments — required for spoke VPCs in other accounts
  auto_accept_shared_attachments = "enable"

  # Amazon side AS for BGP (private range — does not conflict with RFC 1918)
  amazon_side_asn = 64512

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-tgw"
  })
}

# ─── ROUTE TABLES ─────────────────────────────────────────────────────────────
# Two route tables:
#   spoke  — for workload VPC attachments, routes to all spokes + egress
#   egress — for the centralized egress VPC attachment (when enabled)

resource "aws_ec2_transit_gateway_route_table" "spoke" {
  transit_gateway_id = aws_ec2_transit_gateway.this.id

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-tgw-rt-spoke"
    Type = "spoke"
  })
}

resource "aws_ec2_transit_gateway_route_table" "egress" {
  transit_gateway_id = aws_ec2_transit_gateway.this.id

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-tgw-rt-egress"
    Type = "egress"
  })
}

# ─── TGW VPC ATTACHMENT ACCEPTER ─────────────────────────────────────────────
# Spoke accounts create TGW attachments from their side; we accept them here.
# The map key is a descriptive label (e.g. "prod"), the value is the attachment ID
# passed from the workload account deployment.
#
# After acceptance, associate with spoke route table and propagate routes.

resource "aws_ec2_transit_gateway_vpc_attachment_accepter" "spoke" {
  for_each = var.spoke_vpc_attachments

  transit_gateway_attachment_id = each.value

  # Auto-associate with the spoke route table on acceptance
  transit_gateway_default_route_table_association = false
  transit_gateway_default_route_table_propagation = false

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-tgw-attachment-${each.key}"
    Spoke = each.key
  })
}

# Associate each accepted attachment with the spoke route table
resource "aws_ec2_transit_gateway_route_table_association" "spoke" {
  for_each = var.spoke_vpc_attachments

  transit_gateway_attachment_id  = aws_ec2_transit_gateway_vpc_attachment_accepter.spoke[each.key].id
  transit_gateway_route_table_id = aws_ec2_transit_gateway_route_table.spoke.id
}

# Propagate routes from each spoke attachment into the spoke route table
# This makes each spoke's CIDR reachable from all other spokes
resource "aws_ec2_transit_gateway_route_table_propagation" "spoke" {
  for_each = var.spoke_vpc_attachments

  transit_gateway_attachment_id  = aws_ec2_transit_gateway_vpc_attachment_accepter.spoke[each.key].id
  transit_gateway_route_table_id = aws_ec2_transit_gateway_route_table.spoke.id
}

# Default route in spoke table → send internet-bound traffic to egress VPC
# Only created when centralized egress is enabled.
resource "aws_ec2_transit_gateway_route" "spoke_default" {
  count = var.enable_centralized_egress ? 1 : 0

  destination_cidr_block         = "0.0.0.0/0"
  transit_gateway_route_table_id = aws_ec2_transit_gateway_route_table.spoke.id
  transit_gateway_attachment_id  = aws_ec2_transit_gateway_vpc_attachment.egress[0].id
}

# ─── RAM RESOURCE SHARE ───────────────────────────────────────────────────────
# Share the Transit Gateway with the entire org using Resource Access Manager.
# This eliminates the need for TGW peering — spoke accounts can attach VPCs
# directly to our TGW using the RAM-shared ARN.

resource "aws_ram_resource_share" "tgw" {
  name                      = "${var.org_name}-tgw-share"
  allow_external_principals = false

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-tgw-ram-share"
  })
}

resource "aws_ram_resource_association" "tgw" {
  resource_arn       = aws_ec2_transit_gateway.this.arn
  resource_share_arn = aws_ram_resource_share.tgw.arn
}

# Share with the entire organization — any account in the org can attach a VPC
resource "aws_ram_principal_association" "org" {
  principal          = var.organization_id
  resource_share_arn = aws_ram_resource_share.tgw.arn
}

# ─── CENTRALIZED EGRESS VPC (OPTIONAL) ───────────────────────────────────────
# When enabled, all spoke VPC internet traffic routes through a single NAT
# gateway in this VPC. Benefits:
#   - All egress traffic has one predictable IP (whitelist in vendor systems)
#   - NAT cost consolidated to one gateway vs. one per spoke VPC
#   - Future: plug in a firewall/inspection between TGW and NAT
#
# Cost: ~$32/mo for NAT gateway EIP + ~$0.045/hr for NAT gateway processing
# Skip this for early-stage — each workload VPC can have its own NAT.

resource "aws_vpc" "egress" {
  count = var.enable_centralized_egress ? 1 : 0

  cidr_block           = local.egress_vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name    = "${var.org_name}-egress-vpc"
    Purpose = "Centralized internet egress via NAT Gateway"
  })
}

resource "aws_internet_gateway" "egress" {
  count = var.enable_centralized_egress ? 1 : 0

  vpc_id = aws_vpc.egress[0].id

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-egress-igw"
  })
}

resource "aws_subnet" "egress_public" {
  count = var.enable_centralized_egress ? 1 : 0

  vpc_id                  = aws_vpc.egress[0].id
  cidr_block              = local.egress_public_cidr
  availability_zone       = "${data.aws_region.current.name}a"
  map_public_ip_on_launch = false

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-egress-public-a"
    Tier = "public"
  })
}

resource "aws_eip" "nat_egress" {
  count  = var.enable_centralized_egress ? 1 : 0
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-egress-nat-eip"
  })

  depends_on = [aws_internet_gateway.egress]
}

resource "aws_nat_gateway" "egress" {
  count = var.enable_centralized_egress ? 1 : 0

  allocation_id = aws_eip.nat_egress[0].id
  subnet_id     = aws_subnet.egress_public[0].id

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-egress-nat"
  })

  depends_on = [aws_internet_gateway.egress]
}

# TGW subnet in the egress VPC — TGW attachment lives here
resource "aws_subnet" "egress_tgw" {
  count = var.enable_centralized_egress ? 1 : 0

  vpc_id            = aws_vpc.egress[0].id
  cidr_block        = cidrsubnet(local.egress_vpc_cidr, 2, 1)
  availability_zone = "${data.aws_region.current.name}a"

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-egress-tgw-a"
    Tier = "transit"
  })
}

# Route table for public subnet: default → IGW
resource "aws_route_table" "egress_public" {
  count  = var.enable_centralized_egress ? 1 : 0
  vpc_id = aws_vpc.egress[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.egress[0].id
  }

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-egress-rt-public"
  })
}

resource "aws_route_table_association" "egress_public" {
  count = var.enable_centralized_egress ? 1 : 0

  subnet_id      = aws_subnet.egress_public[0].id
  route_table_id = aws_route_table.egress_public[0].id
}

# Route table for TGW subnet: RFC 1918 → TGW (return traffic to spokes)
resource "aws_route_table" "egress_tgw" {
  count  = var.enable_centralized_egress ? 1 : 0
  vpc_id = aws_vpc.egress[0].id

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-egress-rt-tgw"
  })
}

resource "aws_route_table_association" "egress_tgw" {
  count = var.enable_centralized_egress ? 1 : 0

  subnet_id      = aws_subnet.egress_tgw[0].id
  route_table_id = aws_route_table.egress_tgw[0].id
}

# Attach the egress VPC to the Transit Gateway
resource "aws_ec2_transit_gateway_vpc_attachment" "egress" {
  count = var.enable_centralized_egress ? 1 : 0

  subnet_ids         = [aws_subnet.egress_tgw[0].id]
  transit_gateway_id = aws_ec2_transit_gateway.this.id
  vpc_id             = aws_vpc.egress[0].id

  transit_gateway_default_route_table_association = false
  transit_gateway_default_route_table_propagation = false

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-tgw-attachment-egress"
  })
}

# Associate egress VPC attachment with the egress route table
resource "aws_ec2_transit_gateway_route_table_association" "egress" {
  count = var.enable_centralized_egress ? 1 : 0

  transit_gateway_attachment_id  = aws_ec2_transit_gateway_vpc_attachment.egress[0].id
  transit_gateway_route_table_id = aws_ec2_transit_gateway_route_table.egress.id
}

# In the egress route table: route 0.0.0.0/0 to the egress attachment (spokes send internet traffic here)
resource "aws_ec2_transit_gateway_route" "egress_default" {
  count = var.enable_centralized_egress ? 1 : 0

  destination_cidr_block         = "0.0.0.0/0"
  transit_gateway_route_table_id = aws_ec2_transit_gateway_route_table.egress.id
  transit_gateway_attachment_id  = aws_ec2_transit_gateway_vpc_attachment.egress[0].id
}
