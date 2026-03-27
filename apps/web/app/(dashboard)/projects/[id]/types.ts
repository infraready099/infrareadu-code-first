// Shared types for the project detail page.
// Import from here in both page.tsx and project-tabs.tsx.

export type DeploymentStatus =
  | "pending" | "deploying" | "queued" | "running"
  | "success" | "failed" | "destroying" | "destroyed" | "planned";

export interface LogLine {
  ts:    string;
  level: "info" | "success" | "error" | "warn";
  msg:   string;
}

export interface ModulePlan {
  toAdd:     number;
  toChange:  number;
  toDestroy: number;
}

export interface Deployment {
  id:           string;
  status:       DeploymentStatus;
  action:       string;
  modules:      string[];
  logs:         LogLine[];
  outputs:      Record<string, unknown> | null;
  plan_summary: Record<string, ModulePlan> | null;
  created_at:   string;
  updated_at:   string;
}

export interface Project {
  id:               string;
  name:             string;
  repo_url:         string;
  aws_region:       string;
  aws_account_id:   string | null;
  status:           DeploymentStatus;
  last_deployed_at: string | null;
  created_at:       string;
}

export type ResourceOutputs = {
  vpc_id?:               string;
  public_subnet_ids?:    string[];
  private_subnet_ids?:   string[];
  db_endpoint?:          string;
  db_port?:              number;
  db_name?:              string;
  db_secret_arn?:        string;
  app_url?:              string;
  ecr_url?:              string;
  cluster_name?:         string;
  service_name?:         string;
  log_group?:            string;
  task_role_arn?:        string;
  execution_role_arn?:   string;
  cdn_url?:              string;
  bucket_name?:          string;
  bucket_arn?:           string;
  alerts_topic_arn?:     string;
  github_workflow_yaml?: string;
};
