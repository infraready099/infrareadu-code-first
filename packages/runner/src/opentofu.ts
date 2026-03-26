/**
 * OpenTofu executor — runs tofu init + plan + apply inside Lambda
 * OpenTofu binary is bundled in the Lambda container image
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, mkdirSync, cpSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { S3Client } from "@aws-sdk/client-s3";
import {
  EC2Client,
  DescribeVpcsCommand,
  DescribeAddressesCommand,
  DescribeSubnetsCommand,
  DescribeInternetGatewaysCommand,
  DescribeFlowLogsCommand,
  DescribeNatGatewaysCommand,
  DeleteNatGatewayCommand,
  DescribeRouteTablesCommand,
  DescribeSecurityGroupsCommand,
} from "@aws-sdk/client-ec2";
import {
  ElasticLoadBalancingV2Client,
  DescribeTargetGroupsCommand,
  DescribeLoadBalancersCommand as DescribeALBsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { ECRClient, DescribeRepositoriesCommand } from "@aws-sdk/client-ecr";
import { ECSClient, DescribeClustersCommand, DescribeServicesCommand, DeleteServiceCommand, UpdateServiceCommand } from "@aws-sdk/client-ecs";
import { KMSClient, DescribeKeyCommand } from "@aws-sdk/client-kms";
import { ConfigServiceClient, DescribeConfigurationRecordersCommand, DescribeDeliveryChannelsCommand } from "@aws-sdk/client-config-service";
import {
  SecretsManagerClient,
  DescribeSecretCommand,
  DeleteSecretCommand,
} from "@aws-sdk/client-secrets-manager";

const execFileAsync = promisify(execFile);

type LogLevel = "info" | "success" | "error" | "warn";

interface OpenTofuOptions {
  module: string;
  config: Record<string, unknown>;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  };
  deploymentId: string;
  projectId: string;
  region: string;
  awsAccountId?: string;
  onLog: (level: LogLevel, line: string) => Promise<void>;
}

const OPENTOFU_BINARY = process.env.OPENTOFU_PATH ?? "/opt/opentofu/tofu";
const MODULES_PATH = process.env.MODULES_PATH ?? "/var/task/modules";

function buildWorkDir(
  module: string,
  config: Record<string, unknown>,
  credentials: OpenTofuOptions["credentials"],
  projectId: string,
  region: string,
  awsAccountId?: string,
  deploymentId?: string,
): { workDir: string; tfvarsPath: string; backendConfigPath: string; stateBucket: string; env: Record<string, string | undefined>; providerCacheDir: string } {
  // Use deploymentId (UUID) for uniqueness — Date.now() is not safe under concurrent Lambda invocations
  const uniqueKey = deploymentId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workDir = join(tmpdir(), `infraready-${module}-${uniqueKey}`);
  mkdirSync(workDir, { recursive: true });

  const tfvarsPath = join(workDir, "terraform.tfvars.json");
  writeFileSync(tfvarsPath, JSON.stringify(config, null, 2));

  const backendConfigPath = join(workDir, "backend.hcl");
  // Include account ID so each customer gets their own state bucket (S3 names are globally unique)
  const accountSegment = awsAccountId ?? String(config.project_name);
  const stateBucket = `infraready-state-${accountSegment}-${region}`;
  // Use projectId (UUID) as the state key — NOT project_name.
  // project_name is mutable and non-unique: if a project is deleted and recreated
  // with the same name, it would otherwise share state with the old project, causing
  // orphaned resource conflicts and confusing "different project information" errors.
  writeFileSync(backendConfigPath, `bucket  = "${stateBucket}"\nkey     = "${projectId}/${module}/terraform.tfstate"\nregion  = "${region}"\nencrypt = true\n`);

  const providerCacheDir = join(tmpdir(), `infraready-providers-${projectId}`);
  mkdirSync(providerCacheDir, { recursive: true });

  const moduleSource = join(MODULES_PATH, module);
  cpSync(moduleSource, workDir, { recursive: true });

  const env: Record<string, string | undefined> = {
    ...process.env,
    AWS_ACCESS_KEY_ID: credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    AWS_SESSION_TOKEN: credentials.sessionToken,
    AWS_DEFAULT_REGION: region,
    TF_IN_AUTOMATION: "1",
    TF_INPUT: "0",
    TF_CLI_ARGS: "-no-color",
    TF_PLUGIN_CACHE_DIR: providerCacheDir,
    TF_PLUGIN_CACHE_MAY_BREAK_DEPENDENCY_LOCK_FILE: "1",
    ...(awsAccountId && { AWS_ACCOUNT_ID: awsAccountId }),
  };

  return { workDir, tfvarsPath, backendConfigPath, stateBucket, env, providerCacheDir };
}

export interface PlanSummary {
  toAdd:     number;
  toChange:  number;
  toDestroy: number;
}

/**
 * Run tofu init + tofu plan for a single module and return the plan summary.
 * Does NOT apply — safe to run anytime as a preview.
 */
export async function planOpenTofu(opts: OpenTofuOptions): Promise<PlanSummary> {
  const { module, config, credentials, projectId, region, awsAccountId, deploymentId, onLog } = opts;

  const { workDir, tfvarsPath, backendConfigPath, stateBucket, env, providerCacheDir } = buildWorkDir(
    module, config, credentials, projectId, region, awsAccountId, deploymentId
  );

  try {
    await ensureStateBucket(stateBucket, region, credentials);

    await onLog("info", `[tofu] Initializing ${module} for plan...`);
    await runTofu(["init", `-backend-config=${backendConfigPath}`, "-reconfigure"], workDir, env, onLog);

    await onLog("info", `[tofu] Planning ${module}...`);

    // Capture stdout so we can parse the plan summary line
    let planOutput = "";
    const originalOnLog = onLog;
    const capturingOnLog: typeof onLog = async (level, line) => {
      planOutput += line + "\n";
      return originalOnLog(level, line);
    };

    await runTofu(["plan", "-compact-warnings", `-var-file=${tfvarsPath}`], workDir, env, capturingOnLog);

    // Parse "Plan: X to add, Y to change, Z to destroy."
    const match = planOutput.match(/Plan:\s*(\d+)\s+to add,\s*(\d+)\s+to change,\s*(\d+)\s+to destroy/i);
    if (match) {
      return {
        toAdd:     parseInt(match[1], 10),
        toChange:  parseInt(match[2], 10),
        toDestroy: parseInt(match[3], 10),
      };
    }

    // No changes: "No changes. Infrastructure is up-to-date."
    return { toAdd: 0, toChange: 0, toDestroy: 0 };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
    rmSync(providerCacheDir, { recursive: true, force: true });
  }
}

export async function destroyOpenTofu(opts: OpenTofuOptions): Promise<void> {
  const { module, config, credentials, projectId, region, awsAccountId, deploymentId, onLog } = opts;

  const { workDir, tfvarsPath, backendConfigPath, stateBucket, env, providerCacheDir } = buildWorkDir(
    module, config, credentials, projectId, region, awsAccountId, deploymentId
  );

  try {
    await ensureStateBucket(stateBucket, region, credentials);

    await onLog("info", `[tofu] Initializing ${module} for destroy...`);
    await runTofu(["init", `-backend-config=${backendConfigPath}`, "-reconfigure"], workDir, env, onLog);

    await onLog("info", `[tofu] Destroying ${module}...`);
    await runTofu(["destroy", "-auto-approve", `-var-file=${tfvarsPath}`], workDir, env, onLog);
  } finally {
    // I1: always clean up temp directories to prevent /tmp exhaustion on Lambda reuse
    rmSync(workDir, { recursive: true, force: true });
    rmSync(providerCacheDir, { recursive: true, force: true });
  }
}

export async function execOpenTofu(opts: OpenTofuOptions): Promise<Record<string, unknown>> {
  const { module, config, credentials, projectId, region, awsAccountId, deploymentId, onLog } = opts;

  const { workDir, tfvarsPath, backendConfigPath, stateBucket, env, providerCacheDir } = buildWorkDir(
    module, config, credentials, projectId, region, awsAccountId, deploymentId
  );

  try {
    await ensureStateBucket(stateBucket, region, credentials);

    // tofu init
    await onLog("info", `[tofu] Initializing module ${module}...`);
    await runTofu(["init", `-backend-config=${backendConfigPath}`, "-reconfigure"], workDir, env, onLog);

    // Pre-flight import: pull any orphaned resources into state so apply doesn't fail with "already exists"
    await tryImportOrphans(module, config, workDir, env, onLog);

    // tofu plan
    await onLog("info", `[tofu] Planning ${module}...`);
    const planPath = join(workDir, "plan.out");
    await runTofu(["plan", "-compact-warnings", `-var-file=${tfvarsPath}`, `-out=${planPath}`], workDir, env, onLog);

    // tofu apply
    await onLog("info", `[tofu] Applying ${module}...`);
    await runTofu(["apply", "-compact-warnings", "-auto-approve", planPath], workDir, env, onLog);

    // tofu output — get the outputs as JSON
    const { stdout } = await execFileAsync(OPENTOFU_BINARY, ["output", "-json"], {
      cwd: workDir,
      env,
    });

    // Parse outputs — OpenTofu outputs are { key: { value: ..., type: ... } }
    const rawOutputs = JSON.parse(stdout) as Record<string, { value: unknown }>;
    return Object.fromEntries(
      Object.entries(rawOutputs).map(([k, v]) => [k, v.value])
    );
  } finally {
    // I1: always clean up temp directories to prevent /tmp exhaustion on Lambda reuse
    rmSync(workDir, { recursive: true, force: true });
    rmSync(providerCacheDir, { recursive: true, force: true });
  }
}

/**
 * Attempt to import resources that are known to be orphan-prone (created mid-apply, never in state).
 * Failures are silently ignored — if the resource doesn't exist in AWS, that's fine.
 * If it does exist and is imported, the subsequent plan/apply will reconcile it without error.
 */
async function tryImportOrphans(
  module: string,
  config: Record<string, unknown>,
  workDir: string,
  env: Record<string, string | undefined>,
  onLog: (level: LogLevel, line: string) => Promise<void>
): Promise<void> {
  const name = `${config.project_name}-${config.environment ?? "production"}`;
  const accountId = env.AWS_ACCOUNT_ID ?? "";
  const region = env.AWS_DEFAULT_REGION ?? (config.region as string) ?? "us-east-1";

  // For the VPC module: look up the VPC by Name tag so we can import it even if state was lost.
  // This prevents VpcLimitExceeded on retries — existing VPC is reconciled rather than recreated.
  if (module === "vpc") {
    try {
      const ec2 = new EC2Client({
        region,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
          sessionToken: env.AWS_SESSION_TOKEN,
        },
      });
      const result = await ec2.send(new DescribeVpcsCommand({
        Filters: [{ Name: "tag:Name", Values: [`${name}-vpc`] }],
      }));
      const vpcId = result.Vpcs?.[0]?.VpcId;
      if (vpcId) {
        const tfvarsPath = join(workDir, "terraform.tfvars.json");

        // VPC
        try {
          await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, "aws_vpc.this", vpcId], { cwd: workDir, env });
          await onLog("info", `[tofu] Imported existing VPC ${vpcId} into state`);
        } catch { /* already in state */ }

        // Subnets — look up by VPC ID, then match by Name tag so this works with any vpc_cidr
        try {
          const subnetResult = await ec2.send(new DescribeSubnetsCommand({
            Filters: [{ Name: "vpc-id", Values: [vpcId] }],
          }));
          const subnets = subnetResult.Subnets ?? [];

          // C1: match by Name tag — uses region variable so this works in all AWS regions
          const az1 = `${region}a`;
          const az2 = `${region}b`;
          const publicNames  = [`${name}-public-${az1}`, `${name}-public-${az2}`];
          const privateNames = [`${name}-private-${az1}`, `${name}-private-${az2}`];

          for (let i = 0; i < publicNames.length; i++) {
            const subnet = subnets.find((s) => s.Tags?.some((t) => t.Key === "Name" && t.Value === publicNames[i]));
            if (!subnet?.SubnetId) continue;
            try {
              await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, `aws_subnet.public[${i}]`, subnet.SubnetId], { cwd: workDir, env });
              await onLog("info", `[tofu] Imported existing subnet ${subnet.SubnetId} as public[${i}]`);
            } catch { /* already in state */ }
          }
          for (let i = 0; i < privateNames.length; i++) {
            const subnet = subnets.find((s) => s.Tags?.some((t) => t.Key === "Name" && t.Value === privateNames[i]));
            if (!subnet?.SubnetId) continue;
            try {
              await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, `aws_subnet.private[${i}]`, subnet.SubnetId], { cwd: workDir, env });
              await onLog("info", `[tofu] Imported existing subnet ${subnet.SubnetId} as private[${i}]`);
            } catch { /* already in state */ }
          }
        } catch { /* subnet lookup failed — proceed */ }

        // Internet Gateway
        try {
          const igwResult = await ec2.send(new DescribeInternetGatewaysCommand({
            Filters: [{ Name: "attachment.vpc-id", Values: [vpcId] }],
          }));
          const igwId = igwResult.InternetGateways?.[0]?.InternetGatewayId;
          if (igwId) {
            try {
              await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, "aws_internet_gateway.this", igwId], { cwd: workDir, env });
              await onLog("info", `[tofu] Imported existing IGW ${igwId} into state`);
            } catch { /* already in state */ }
          }
        } catch { /* IGW lookup failed — proceed */ }

        // Flow Log
        try {
          const flResult = await ec2.send(new DescribeFlowLogsCommand({
            Filter: [{ Name: "resource-id", Values: [vpcId] }],
          }));
          const flowLogId = flResult.FlowLogs?.[0]?.FlowLogId;
          if (flowLogId) {
            try {
              await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, "aws_flow_log.this[0]", flowLogId], { cwd: workDir, env });
              await onLog("info", `[tofu] Imported existing flow log ${flowLogId} into state`);
            } catch { /* already in state */ }
          }
        } catch { /* flow log lookup failed — proceed */ }
      }

      // Import existing EIPs for NAT gateways — filter by both Project and Environment
      // to avoid importing EIPs that belong to a different environment of the same project (W6)
      const eipResult = await ec2.send(new DescribeAddressesCommand({
        Filters: [
          { Name: "tag:Project",     Values: [String(config.project_name)] },
          { Name: "tag:Environment", Values: [String(config.environment ?? "production")] },
        ],
      }));
      const eips = eipResult.Addresses ?? [];
      const eipAllocationIds = eips.map((e) => e.AllocationId).filter(Boolean) as string[];

      for (let i = 0; i < eips.length; i++) {
        const allocationId = eips[i].AllocationId;
        if (!allocationId) continue;
        const tfvarsPath = join(workDir, "terraform.tfvars.json");
        try {
          await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, `aws_eip.nat[${i}]`, allocationId], { cwd: workDir, env });
          await onLog("info", `[tofu] Imported existing EIP ${allocationId} as nat[${i}]`);
        } catch { /* already in state */ }
      }

      // NAT Gateway cleanup + import
      // Failed NAT gateways hold EIP associations indefinitely — must delete them before
      // tofu apply can create new ones. Available ones are imported so tofu doesn't recreate.
      if (vpcId && eipAllocationIds.length > 0) {
        try {
          const tfvarsPath = join(workDir, "terraform.tfvars.json");
          const ngwResult = await ec2.send(new DescribeNatGatewaysCommand({
            Filter: [
              { Name: "vpc-id", Values: [vpcId] },
              { Name: "state", Values: ["pending", "available", "failed"] },
            ],
          }));
          const allNgws = ngwResult.NatGateways ?? [];

          // Separate available ones (import) from failed/pending ones (delete to free EIPs)
          const availableNgws = allNgws.filter((ngw) => ngw.State === "available");
          const failedNgws    = allNgws.filter((ngw) => ngw.State === "failed" || ngw.State === "pending");

          // Import available NAT gateways ordered by AZ so index matches EIP index
          const ngwsSorted = availableNgws.sort((a, b) =>
            (a.Tags?.find((t) => t.Key === "Name")?.Value ?? "").localeCompare(
              b.Tags?.find((t) => t.Key === "Name")?.Value ?? ""
            )
          );
          for (let i = 0; i < ngwsSorted.length; i++) {
            const ngwId = ngwsSorted[i].NatGatewayId;
            if (!ngwId) continue;
            try {
              await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, `aws_nat_gateway.this[${i}]`, ngwId], { cwd: workDir, env });
              await onLog("info", `[tofu] Imported existing NAT gateway ${ngwId} as this[${i}]`);
            } catch { /* already in state or index mismatch — fine */ }
          }

          // Delete failed NAT gateways so their EIPs are released
          for (const ngw of failedNgws) {
            if (!ngw.NatGatewayId) continue;
            try {
              await ec2.send(new DeleteNatGatewayCommand({ NatGatewayId: ngw.NatGatewayId }));
              await onLog("info", `[tofu] Deleted failed NAT gateway ${ngw.NatGatewayId} to release EIP`);
            } catch { /* may already be deleting */ }
          }

          // Wait for failed ones to finish deleting (max 60s)
          if (failedNgws.length > 0) {
            await onLog("info", `[tofu] Waiting for ${failedNgws.length} failed NAT gateway(s) to release EIPs...`);
            for (let attempt = 0; attempt < 12; attempt++) {
              await new Promise((r) => setTimeout(r, 5_000));
              const check = await ec2.send(new DescribeNatGatewaysCommand({
                Filter: [
                  { Name: "nat-gateway-id", Values: failedNgws.map((n) => n.NatGatewayId!).filter(Boolean) },
                  { Name: "state", Values: ["pending", "available", "failed"] },
                ],
              }));
              if ((check.NatGateways ?? []).length === 0) break;
            }
            await onLog("info", `[tofu] EIPs released — proceeding`);
          }
        } catch { /* NAT gateway cleanup failed — proceed and let tofu handle it */ }
      }

      // Route table + association import
      // Route tables are created during apply but associations can conflict on retry
      if (vpcId) {
        try {
          const tfvarsPath = join(workDir, "terraform.tfvars.json");
          const rtResult = await ec2.send(new DescribeRouteTablesCommand({
            Filters: [
              { Name: "vpc-id", Values: [vpcId] },
              { Name: "tag:Name", Values: [`${name}-rt-public`] },
            ],
          }));
          const publicRt = rtResult.RouteTables?.[0];
          if (publicRt?.RouteTableId) {
            try {
              await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, "aws_route_table.public", publicRt.RouteTableId], { cwd: workDir, env });
              await onLog("info", `[tofu] Imported existing public route table ${publicRt.RouteTableId}`);
            } catch { /* already in state */ }

            // Import route table associations — match by subnet ID to get correct index
            for (const assoc of publicRt.Associations ?? []) {
              if (!assoc.SubnetId || !assoc.RouteTableAssociationId || assoc.Main) continue;
              // Look up which public subnet index this is
              const subnetResult2 = await ec2.send(new DescribeSubnetsCommand({ SubnetIds: [assoc.SubnetId] }));
              const subnetName = subnetResult2.Subnets?.[0]?.Tags?.find((t) => t.Key === "Name")?.Value ?? "";
              // az1 (e.g. us-east-1a) = index 0, az2 (e.g. us-east-1b) = index 1
              const idx = subnetName.endsWith(`${region}a`) ? 0 : subnetName.endsWith(`${region}b`) ? 1 : -1;
              if (idx < 0) continue;
              try {
                await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, `aws_route_table_association.public[${idx}]`, assoc.RouteTableAssociationId], { cwd: workDir, env });
                await onLog("info", `[tofu] Imported public RT association ${assoc.RouteTableAssociationId} as public[${idx}]`);
              } catch { /* already in state */ }
            }
          }
        } catch { /* route table lookup failed — proceed */ }

        // Import private route tables + associations via subnet-first lookup.
        // Tag-based lookup misses RTs from prior deployments that may lack InfraReady tags
        // or exist under a different state file. Anchoring on subnet ID is unambiguous —
        // each subnet has exactly one explicit RT association at a time.
        try {
          const privateRtTfvarsPath = join(workDir, "terraform.tfvars.json");
          const az1 = `${region}a`;
          const az2 = `${region}b`;
          const privateSubnetNames = [`${name}-private-${az1}`, `${name}-private-${az2}`];
          const privSubnetRes = await ec2.send(new DescribeSubnetsCommand({
            Filters: [
              { Name: "vpc-id", Values: [vpcId] },
              { Name: "tag:Name", Values: privateSubnetNames },
            ],
          }));

          for (const subnet of privSubnetRes.Subnets ?? []) {
            if (!subnet.SubnetId) continue;
            const subnetName = subnet.Tags?.find(t => t.Key === "Name")?.Value ?? "";
            const idx = subnetName.endsWith(`${region}a`) ? 0 : subnetName.endsWith(`${region}b`) ? 1 : -1;
            if (idx < 0) continue;

            // Find which route table is explicitly associated with this private subnet
            const rtForSubnet = await ec2.send(new DescribeRouteTablesCommand({
              Filters: [{ Name: "association.subnet-id", Values: [subnet.SubnetId] }],
            }));
            const rt = rtForSubnet.RouteTables?.[0];
            if (!rt?.RouteTableId) {
              await onLog("info", `[tofu] No explicit RT association for private subnet ${subnet.SubnetId} — tofu will create one`);
              continue;
            }
            const assoc = rt.Associations?.find(a => a.SubnetId === subnet.SubnetId && !a.Main);
            if (!assoc?.RouteTableAssociationId) continue;

            await onLog("info", `[tofu] Found private subnet ${subnet.SubnetId} associated with RT ${rt.RouteTableId} — importing`);

            // Clear any stale state entry at this index before importing.
            // Prior attempts may have imported a DIFFERENT RT (one with no subnet association yet)
            // which would cause the import below to conflict.
            try { await execFileAsync(OPENTOFU_BINARY, ["state", "rm", `aws_route_table.private[${idx}]`], { cwd: workDir, env }); } catch { /* not in state */ }
            try { await execFileAsync(OPENTOFU_BINARY, ["state", "rm", `aws_route_table_association.private[${idx}]`], { cwd: workDir, env }); } catch { /* not in state */ }

            try {
              await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${privateRtTfvarsPath}`, `aws_route_table.private[${idx}]`, rt.RouteTableId], { cwd: workDir, env });
              await onLog("info", `[tofu] Imported private RT ${rt.RouteTableId} as private[${idx}]`);
            } catch (e) { await onLog("info", `[tofu] Private RT import skipped (already in state): ${e}`); }

            try {
              await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${privateRtTfvarsPath}`, `aws_route_table_association.private[${idx}]`, assoc.RouteTableAssociationId], { cwd: workDir, env });
              await onLog("info", `[tofu] Imported private RT assoc ${assoc.RouteTableAssociationId} as private[${idx}]`);
            } catch (e) { await onLog("info", `[tofu] Private RT assoc import skipped (already in state): ${e}`); }
          }
        } catch (e) { await onLog("info", `[tofu] Private RT subnet-first lookup failed: ${e} — proceeding`); }
      }
    } catch {
      // EC2 lookup failed (permissions, network) — proceed without import
    }
  }

  // For the RDS module: if the Secrets Manager secret is pending deletion,
  // force-delete it so the apply can recreate it cleanly.
  // This happens on retries when a previous attempt created and then failed to delete the secret.
  if (module === "rds") {
    try {
      const secretName = `infraready/${name}/rds-credentials`;
      const sm = new SecretsManagerClient({
        region,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
          sessionToken: env.AWS_SESSION_TOKEN,
        },
      });
      const desc = await sm.send(new DescribeSecretCommand({ SecretId: secretName }));
      if (desc.DeletedDate) {
        // Secret is pending deletion — force-delete it so tofu can recreate it
        await sm.send(new DeleteSecretCommand({
          SecretId: secretName,
          ForceDeleteWithoutRecovery: true,
        }));
        await onLog("info", `[tofu] Force-deleted pending-deletion secret: ${secretName}`);
      }
    } catch {
      // Secret doesn't exist or already gone — fine
    }
  }

  // Look up ELB Target Group + ALB ARNs, ECR repo name, ECS cluster, and security groups for ECS imports
  let tgArn = "";
  let albArn = "";
  let ecrRepoName = "";
  let ecsClusterArn = "";
  let ecsServiceImportId = "";
  let albSgId = "";
  let ecsTasksSgId = "";
  // Security module: KMS key ARN, Config recorder name, and delivery channel name for import
  let securityKmsKeyArn = "";
  let configRecorderName = "";
  let configDeliveryChannelName = "";
  if (module === "ecs") {
    const elbCreds = {
      accessKeyId: env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: env.AWS_SESSION_TOKEN,
    };
    try {
      const elb = new ElasticLoadBalancingV2Client({ region, credentials: elbCreds });
      const tgResult = await elb.send(new DescribeTargetGroupsCommand({ Names: [`${name}-tg`] }));
      tgArn = tgResult.TargetGroups?.[0]?.TargetGroupArn ?? "";
    } catch { /* TG doesn't exist yet — fine */ }

    try {
      const elb = new ElasticLoadBalancingV2Client({ region, credentials: elbCreds });
      const albResult = await elb.send(new DescribeALBsCommand({ Names: [`${name}-alb`] }));
      albArn = albResult.LoadBalancers?.[0]?.LoadBalancerArn ?? "";
    } catch { /* ALB doesn't exist yet — fine */ }

    try {
      const ecr = new ECRClient({ region, credentials: elbCreds });
      const ecrResult = await ecr.send(new DescribeRepositoriesCommand({ repositoryNames: [`${name}-app`] }));
      ecrRepoName = ecrResult.repositories?.[0]?.repositoryName ?? "";
    } catch { /* ECR repo doesn't exist yet — fine */ }

    try {
      const ecs = new ECSClient({ region, credentials: elbCreds });
      const clusterResult = await ecs.send(new DescribeClustersCommand({ clusters: [`${name}-cluster`] }));
      const cluster = clusterResult.clusters?.[0];
      if (cluster?.status === "ACTIVE") {
        ecsClusterArn = cluster.clusterArn ?? "";
      }

      // Also look up the ECS service — "not idempotent" error if service exists but not in state
      if (ecsClusterArn) {
        const svcResult = await ecs.send(new DescribeServicesCommand({
          cluster: `${name}-cluster`,
          services: [`${name}-service`],
        }));
        const svc = svcResult.services?.[0];
        if (svc?.status === "ACTIVE" || svc?.status === "DRAINING") {
          // Service is live — import it so tofu manages it
          ecsServiceImportId = `${name}-cluster/${name}-service`;
        } else if (svc?.status === "INACTIVE") {
          // INACTIVE services can't be cleanly imported; delete so tofu can recreate
          try {
            await ecs.send(new UpdateServiceCommand({
              cluster: `${name}-cluster`,
              service: `${name}-service`,
              desiredCount: 0,
            }));
          } catch { /* already at 0 or not updatable */ }
          try {
            await ecs.send(new DeleteServiceCommand({
              cluster: `${name}-cluster`,
              service: `${name}-service`,
              force: true,
            }));
          } catch { /* already gone */ }
        }
      }
    } catch { /* cluster/service doesn't exist yet — fine */ }

    // Look up security groups by name — they're orphan-prone when apply fails mid-run
    try {
      const ec2 = new EC2Client({ region, credentials: elbCreds });
      const sgResult = await ec2.send(new DescribeSecurityGroupsCommand({
        Filters: [
          { Name: "group-name", Values: [`${name}-alb-sg`, `${name}-ecs-tasks-sg`] },
        ],
      }));
      for (const sg of sgResult.SecurityGroups ?? []) {
        if (sg.GroupName === `${name}-alb-sg`)       albSgId      = sg.GroupId ?? "";
        if (sg.GroupName === `${name}-ecs-tasks-sg`) ecsTasksSgId = sg.GroupId ?? "";
      }
    } catch { /* SGs don't exist yet — fine */ }
  }

  // Security module: look up existing KMS key via its alias so we can import it
  if (module === "security") {
    const kmsCreds = {
      accessKeyId: env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: env.AWS_SESSION_TOKEN,
    };
    try {
      const kms = new KMSClient({ region, credentials: kmsCreds });
      const keyResult = await kms.send(new DescribeKeyCommand({ KeyId: `alias/${name}-security` }));
      securityKmsKeyArn = keyResult.KeyMetadata?.Arn ?? "";
    } catch { /* KMS key/alias doesn't exist yet — fine */ }

    // Look up existing Config recorder + delivery channel — AWS allows only 1 each per account/region
    try {
      const cfgClient = new ConfigServiceClient({ region, credentials: kmsCreds });
      const [recorderResult, channelResult] = await Promise.all([
        cfgClient.send(new DescribeConfigurationRecordersCommand({})),
        cfgClient.send(new DescribeDeliveryChannelsCommand({})),
      ]);
      configRecorderName        = recorderResult.ConfigurationRecorders?.[0]?.name ?? "";
      configDeliveryChannelName = channelResult.DeliveryChannels?.[0]?.name ?? "";
    } catch { /* no recorder yet — fine */ }
  }

  // Map of module → [ [resource_address, resource_id], ... ]
  // Resource addresses MUST match exactly what's declared in the module's main.tf
  const imports: Record<string, [string, string][]> = {
    vpc: [
      ["aws_cloudwatch_log_group.flow_logs[0]", `/infraready/${name}/vpc-flow-logs`],
      ["aws_iam_role.flow_logs[0]",             `${name}-vpc-flow-logs-role`],
    ],
    ecs: [
      // Addresses match ecs/main.tf resource declarations exactly
      ["aws_cloudwatch_log_group.app",      `/infraready/${name}/ecs`],
      ["aws_iam_role.task",                 `${name}-ecs-task-role`],
      ["aws_iam_role.task_execution",       `${name}-ecs-execution-role`],
      ["aws_s3_bucket.alb_logs",            `${name}-alb-logs-${accountId}`],
      ...(ecsClusterArn ? [["aws_ecs_cluster.this",        ecsClusterArn] as [string, string]] : []),
      ...(ecsServiceImportId ? [["aws_ecs_service.app",         ecsServiceImportId] as [string, string]] : []),
      ...(ecrRepoName   ? [["aws_ecr_repository.app",      ecrRepoName]   as [string, string]] : []),
      ...(tgArn         ? [["aws_lb_target_group.app",     tgArn]         as [string, string]] : []),
      ...(albArn        ? [["aws_lb.app",                  albArn]        as [string, string]] : []),
      ...(albSgId       ? [["aws_security_group.alb",      albSgId]       as [string, string]] : []),
      ...(ecsTasksSgId  ? [["aws_security_group.ecs_tasks", ecsTasksSgId] as [string, string]] : []),
    ],
    rds: [
      ["aws_cloudwatch_log_group.rds",    `/infraready/${name}/rds`],
    ],
    kms: [
      // KMS keys can't be imported without ARN — skip
    ],
    security: [
      // Resources that are orphan-prone when security apply fails mid-run
      // Static name patterns from security/main.tf
      ["aws_cloudwatch_log_group.cloudtrail", `/infraready/${name}/cloudtrail`],
      ["aws_s3_bucket.cloudtrail",            `${name}-cloudtrail-${accountId}`],
      ["aws_iam_role.cloudtrail",             `${name}-cloudtrail-role`],
      ["aws_iam_role.config[0]",              `${name}-config-role`],
      ["aws_iam_role.github_deploy[0]",                  `${name}-github-deploy`],
      ["aws_cloudtrail.this",                           `${name}-trail`],
      // Config recorder + delivery channel: use actual names from AWS (only 1 allowed per account/region)
      ...(configRecorderName        ? [["aws_config_configuration_recorder.this[0]", configRecorderName]        as [string, string]] : []),
      ...(configDeliveryChannelName ? [["aws_config_delivery_channel.this[0]",       configDeliveryChannelName] as [string, string]] : []),
      // OIDC provider: must use ARN (not URL) as the import ID
      ["aws_iam_openid_connect_provider.github_actions[0]", `arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com`],
      // KMS key requires a runtime lookup (ARN not derivable from name alone)
      ...(securityKmsKeyArn ? [
        ["aws_kms_key.security",   securityKmsKeyArn]       as [string, string],
        ["aws_kms_alias.security", `alias/${name}-security`] as [string, string],
      ] : []),
    ],
  };

  const toImport = imports[module] ?? [];
  for (const [address, id] of toImport) {
    if (!id || id.endsWith("-")) continue; // skip if ID couldn't be computed
    try {
      const tfvarsPath = join(workDir, "terraform.tfvars.json");
      await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, address, id], { cwd: workDir, env });
      await onLog("info", `[tofu] Imported existing resource: ${address} (${id})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // "already managed" means it's in state — fine. Otherwise log for debugging.
      if (!msg.includes("already managed") && !msg.includes("Cannot import")) {
        await onLog("warn", `[tofu] Import skipped ${address}: ${msg.slice(0, 120)}`);
      }
    }
  }
}

async function runTofu(
  args: string[],
  cwd: string,
  env: Record<string, string | undefined>,
  onLog: (level: LogLevel, line: string) => Promise<void>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = require("child_process").spawn(OPENTOFU_BINARY, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const errorLines: string[] = [];

    child.stdout.on("data", async (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        const level = line.includes("Error") ? "error"
          : line.includes("Warning") ? "warn"
          : line.startsWith("Apply complete") || line.includes("created") ? "success"
          : "info";
        if (level === "error") errorLines.push(line);
        await onLog(level, line);
      }
    });

    child.stderr.on("data", async (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        errorLines.push(line);
        await onLog("error", line);
      }
    });

    child.on("close", (code: number) => {
      if (code === 0) resolve();
      else {
        // Include the last error lines in the message so callers can classify the error
        const detail = errorLines.slice(-10).join(" ").trim();
        const msg = detail
          ? `OpenTofu exited with code ${code}: ${detail}`
          : `OpenTofu exited with code ${code}`;
        reject(new Error(msg));
      }
    });
  });
}

async function ensureStateBucket(
  bucketName: string,
  region: string,
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string }
) {
  const s3 = new S3Client({
    region,
    credentials,
  });

  try {
    // Try to create the bucket (idempotent — fails silently if exists)
    const { CreateBucketCommand, BucketAlreadyOwnedByYou } = await import("@aws-sdk/client-s3");

    await s3.send(new CreateBucketCommand({
      Bucket: bucketName,
      ...(region !== "us-east-1" && {
        CreateBucketConfiguration: { LocationConstraint: region as import("@aws-sdk/client-s3").BucketLocationConstraint }
      }),
    }));

    // Enable versioning and encryption on the state bucket
    const { PutBucketVersioningCommand, PutBucketEncryptionCommand, PutPublicAccessBlockCommand } = await import("@aws-sdk/client-s3");

    await Promise.all([
      s3.send(new PutBucketVersioningCommand({
        Bucket: bucketName,
        VersioningConfiguration: { Status: "Enabled" },
      })),
      s3.send(new PutBucketEncryptionCommand({
        Bucket: bucketName,
        ServerSideEncryptionConfiguration: {
          Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }],
        },
      })),
      s3.send(new PutPublicAccessBlockCommand({
        Bucket: bucketName,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      })),
    ]);
  } catch (err: unknown) {
    // BucketAlreadyOwnedByYou is fine — bucket exists and we own it
    if ((err as { name?: string }).name !== "BucketAlreadyOwnedByYou") {
      // Other errors might indicate permission issues
      console.warn("State bucket setup warning:", err);
    }
  }
}
