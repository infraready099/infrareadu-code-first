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
} from "@aws-sdk/client-ec2";
import {
  ElasticLoadBalancingV2Client,
  DescribeTargetGroupsCommand,
  DescribeLoadBalancersCommand as DescribeALBsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { ECRClient, DescribeRepositoriesCommand } from "@aws-sdk/client-ecr";
import { ECSClient, DescribeClustersCommand } from "@aws-sdk/client-ecs";
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

        // Import private route tables + associations — same pattern as public
        try {
          const privateRtResult = await ec2.send(new DescribeRouteTablesCommand({
            Filters: [
              { Name: "vpc-id", Values: [vpcId] },
              { Name: "tag:ManagedBy", Values: ["infraready"] },
              { Name: "tag:Module", Values: ["vpc"] },
            ],
          }));
          const privateRts = (privateRtResult.RouteTables ?? []).filter(rt =>
            rt.Tags?.some(t => t.Key === "Name" && t.Value?.includes("rt-private"))
          );
          for (const rt of privateRts) {
            if (!rt.RouteTableId) continue;
            const rtName = rt.Tags?.find(t => t.Key === "Name")?.Value ?? "";
            const rtIdx = rtName.endsWith(`${region}a`) ? 0 : rtName.endsWith(`${region}b`) ? 1 : -1;
            if (rtIdx < 0) continue;
            try {
              await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, `aws_route_table.private[${rtIdx}]`, rt.RouteTableId], { cwd: workDir, env });
              await onLog("info", `[tofu] Imported private route table ${rt.RouteTableId} as private[${rtIdx}]`);
            } catch { /* already in state */ }

            for (const assoc of rt.Associations ?? []) {
              if (!assoc.SubnetId || !assoc.RouteTableAssociationId || assoc.Main) continue;
              const subnetRes = await ec2.send(new DescribeSubnetsCommand({ SubnetIds: [assoc.SubnetId] }));
              const subnetName = subnetRes.Subnets?.[0]?.Tags?.find(t => t.Key === "Name")?.Value ?? "";
              const assocIdx = subnetName.endsWith(`${region}a`) ? 0 : subnetName.endsWith(`${region}b`) ? 1 : -1;
              if (assocIdx < 0) continue;
              try {
                await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, `aws_route_table_association.private[${assocIdx}]`, assoc.RouteTableAssociationId], { cwd: workDir, env });
                await onLog("info", `[tofu] Imported private RT association ${assoc.RouteTableAssociationId} as private[${assocIdx}]`);
              } catch { /* already in state */ }
            }
          }
        } catch { /* private RT lookup failed — proceed */ }
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

  // Look up ELB Target Group + ALB ARNs, ECR repo name, and ECS cluster for ECS imports
  let tgArn = "";
  let albArn = "";
  let ecrRepoName = "";
  let ecsClusterArn = "";
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
    } catch { /* cluster doesn't exist yet — fine */ }
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
      ...(ecsClusterArn ? [["aws_ecs_cluster.this", ecsClusterArn]  as [string, string]] : []),
      ...(ecrRepoName   ? [["aws_ecr_repository.app", ecrRepoName]  as [string, string]] : []),
      ...(tgArn         ? [["aws_lb_target_group.app", tgArn]       as [string, string]] : []),
      ...(albArn        ? [["aws_lb.app",              albArn]       as [string, string]] : []),
    ],
    rds: [
      ["aws_cloudwatch_log_group.rds",    `/infraready/${name}/rds`],
    ],
    kms: [
      // KMS keys can't be imported without ARN — skip
    ],
  };

  const toImport = imports[module] ?? [];
  for (const [address, id] of toImport) {
    if (!id || id.endsWith("-")) continue; // skip if ID couldn't be computed
    try {
      const tfvarsPath = join(workDir, "terraform.tfvars.json");
      await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, address, id], { cwd: workDir, env });
      await onLog("info", `[tofu] Imported existing resource: ${address}`);
    } catch {
      // Resource doesn't exist in AWS or already in state — both are fine
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
