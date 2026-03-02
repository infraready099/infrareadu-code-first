/**
 * InfraReady Deploy Runner — AWS Lambda
 *
 * Triggered by SQS. Assumes customer's IAM role, runs OpenTofu,
 * streams logs back to Supabase in real time.
 */

import { SQSEvent, SQSRecord } from "aws-lambda";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { execOpenTofu } from "./opentofu";
import { createClient } from "@supabase/supabase-js";

const sts = new STSClient({ region: process.env.AWS_REGION ?? "us-east-1" });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role — can write to any row
);

interface DeployJob {
  deploymentId: string;
  projectId: string;
  userId: string;
  modules: string[];
  config: Record<string, unknown>;
  awsRoleArn: string;
  awsExternalId: string;
}

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    await processRecord(record);
  }
};

async function processRecord(record: SQSRecord): Promise<void> {
  const job: DeployJob = JSON.parse(record.body);
  const { deploymentId } = job;

  await updateDeployment(deploymentId, { status: "running" });
  await appendLog(deploymentId, "info", `[InfraReady] Starting deployment ${deploymentId}`);

  try {
    // Step 1: Assume customer's IAM role
    await appendLog(deploymentId, "info", `[AWS] Assuming role: ${job.awsRoleArn}`);

    const assumed = await sts.send(new AssumeRoleCommand({
      RoleArn: job.awsRoleArn,
      RoleSessionName: `infraready-deploy-${deploymentId}`,
      ExternalId: job.awsExternalId,
      DurationSeconds: 3600, // 1 hour
    }));

    const credentials = {
      accessKeyId: assumed.Credentials!.AccessKeyId!,
      secretAccessKey: assumed.Credentials!.SecretAccessKey!,
      sessionToken: assumed.Credentials!.SessionToken!,
    };

    await appendLog(deploymentId, "success", `[AWS] Role assumed successfully`);

    // Step 2: Run OpenTofu for each requested module in order
    const moduleOrder = ["vpc", "rds", "ecs", "storage", "security"];
    const orderedModules = moduleOrder.filter((m) => job.modules.includes(m));

    const outputs: Record<string, Record<string, unknown>> = {};

    for (const moduleName of orderedModules) {
      await appendLog(deploymentId, "info", `\n[OpenTofu] Deploying module: ${moduleName}`);
      await updateDeployment(deploymentId, { current_module: moduleName });

      const moduleConfig = buildModuleConfig(moduleName, job.config, outputs);

      const moduleOutputs = await execOpenTofu({
        module: moduleName,
        config: moduleConfig,
        credentials,
        deploymentId,
        projectId: job.projectId,
        region: (job.config.aws_region as string) ?? "us-east-1",
        onLog: (level, line) => appendLog(deploymentId, level, line),
      });

      outputs[moduleName] = moduleOutputs;
      await appendLog(deploymentId, "success", `[OpenTofu] Module ${moduleName} deployed successfully`);
    }

    // Step 3: Save outputs and mark complete
    await appendLog(deploymentId, "info", "\n[InfraReady] Saving outputs...");

    const flatOutputs = formatOutputs(outputs);

    await updateDeployment(deploymentId, {
      status: "success",
      outputs: flatOutputs,
      completed_at: new Date().toISOString(),
      current_module: null,
    });

    await supabase
      .from("projects")
      .update({ status: "success", last_deployed_at: new Date().toISOString() })
      .eq("id", job.projectId);

    await appendLog(deploymentId, "success", `\n[InfraReady] Deployment complete! Your infrastructure is live.`);

  } catch (err: unknown) {
    const error = err as Error;
    console.error(`Deployment ${deploymentId} failed:`, error);

    await appendLog(deploymentId, "error", `\n[InfraReady] Deployment failed: ${error.message}`);
    await appendLog(deploymentId, "error", "[InfraReady] Resources created before failure have been preserved. Review above for details.");

    await updateDeployment(deploymentId, {
      status: "failed",
      error: error.message,
      completed_at: new Date().toISOString(),
      current_module: null,
    });

    await supabase
      .from("projects")
      .update({ status: "failed" })
      .eq("id", job.projectId);
  }
}

function buildModuleConfig(
  module: string,
  config: Record<string, unknown>,
  previousOutputs: Record<string, Record<string, unknown>>
): Record<string, unknown> {
  const base = {
    project_name: config.project_name,
    environment:  config.environment ?? "production",
    aws_region:   config.aws_region ?? "us-east-1",
  };

  switch (module) {
    case "vpc":
      return {
        ...base,
        vpc_cidr:           config.vpc_cidr ?? "10.0.0.0/16",
        enable_nat_gateway: config.enable_nat ?? true,
        single_nat_gateway: config.environment !== "production",
        enable_flow_logs:   true,
      };

    case "rds":
      return {
        ...base,
        vpc_id:               previousOutputs.vpc?.vpc_id,
        private_subnet_ids:   previousOutputs.vpc?.private_subnet_ids,
        app_security_group_id: previousOutputs.ecs?.ecs_task_security_group_id ?? "",
        engine:               config.db_engine ?? "postgres",
        instance_class:       config.db_instance ?? "db.t3.micro",
        multi_az:             config.db_multi_az ?? false,
        deletion_protection:  config.environment === "production",
      };

    case "ecs":
      return {
        ...base,
        vpc_id:             previousOutputs.vpc?.vpc_id,
        public_subnet_ids:  previousOutputs.vpc?.public_subnet_ids,
        private_subnet_ids: previousOutputs.vpc?.private_subnet_ids,
        domain_name:        config.domain_name ?? "",
        container_port:     config.container_port ?? 3000,
        container_cpu:      config.container_cpu ?? 256,
        container_memory_mb: config.container_memory ?? 512,
        db_secret_arn:      previousOutputs.rds?.db_secret_arn ?? "",
      };

    case "storage":
      return {
        ...base,
        cdn_domain:           config.cdn_domain ?? "",
        enable_access_logging: true,
      };

    case "security":
      return {
        ...base,
        alert_email:                config.alert_email,
        billing_alarm_threshold_usd: config.billing_threshold ?? 100,
        enable_guardduty:           true,
        enable_security_hub:        true,
        enable_config:              true,
        log_retention_days:         365,
      };

    default:
      return base;
  }
}

function formatOutputs(
  moduleOutputs: Record<string, Record<string, unknown>>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (moduleOutputs.vpc) {
    out.vpc_id = moduleOutputs.vpc.vpc_id;
  }

  if (moduleOutputs.rds) {
    out.db_secret_arn  = moduleOutputs.rds.db_secret_arn;
    out.db_endpoint    = moduleOutputs.rds.db_endpoint;
  }

  if (moduleOutputs.ecs) {
    out.app_url      = moduleOutputs.ecs.app_url;
    out.ecr_url      = moduleOutputs.ecs.ecr_repository_url;
    out.cluster_name = moduleOutputs.ecs.ecs_cluster_name;
    out.service_name = moduleOutputs.ecs.ecs_service_name;
    out.log_group    = moduleOutputs.ecs.log_group_name;
  }

  if (moduleOutputs.storage) {
    out.cdn_url     = moduleOutputs.storage.cdn_url;
    out.bucket_name = moduleOutputs.storage.bucket_name;
  }

  if (moduleOutputs.security) {
    out.alerts_topic = moduleOutputs.security.alerts_topic_arn;
  }

  return out;
}

async function updateDeployment(deploymentId: string, updates: Record<string, unknown>) {
  await supabase
    .from("deployments")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", deploymentId);
}

async function appendLog(deploymentId: string, level: string, message: string) {
  const logEntry = { ts: new Date().toISOString(), level, msg: message };

  // Supabase doesn't support array append natively, so we use a raw RPC
  await supabase.rpc("append_deployment_log", {
    p_deployment_id: deploymentId,
    p_log_entry: logEntry,
  });
}
