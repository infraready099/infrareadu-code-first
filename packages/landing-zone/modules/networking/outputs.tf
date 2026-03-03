output "transit_gateway_id" {
  description = "Transit Gateway ID — share this with workload accounts for VPC attachment"
  value       = aws_ec2_transit_gateway.this.id
}

output "transit_gateway_arn" {
  description = "Transit Gateway ARN"
  value       = aws_ec2_transit_gateway.this.arn
}

output "tgw_ram_share_arn" {
  description = "RAM resource share ARN — workload accounts use this to create TGW attachments"
  value       = aws_ram_resource_share.tgw.arn
}

output "spoke_route_table_id" {
  description = "TGW route table ID for spoke (workload) attachments"
  value       = aws_ec2_transit_gateway_route_table.spoke.id
}

output "egress_route_table_id" {
  description = "TGW route table ID for the centralized egress VPC"
  value       = aws_ec2_transit_gateway_route_table.egress.id
}

output "egress_nat_public_ip" {
  description = "Public IP of the centralized egress NAT gateway. Empty if enable_centralized_egress = false."
  value       = var.enable_centralized_egress ? aws_eip.nat_egress[0].public_ip : null
}

output "egress_vpc_id" {
  description = "VPC ID of the centralized egress VPC. Empty if enable_centralized_egress = false."
  value       = var.enable_centralized_egress ? aws_vpc.egress[0].id : null
}

output "accepted_attachment_ids" {
  description = "Map of spoke name → accepted TGW attachment ID"
  value = {
    for k, v in aws_ec2_transit_gateway_vpc_attachment_accepter.spoke : k => v.id
  }
}
