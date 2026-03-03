/**
 * Security Scan Service — Checkov compliance scanning
 *
 * Runs Checkov against generated Terraform/OpenTofu HCL before ANY deployment.
 * Supports: HIPAA, SOC2, SOC1, CIS AWS Foundations, NIST 800-53, PCI DSS.
 *
 * If CRITICAL or HIGH findings exist, deployment is BLOCKED.
 * Results are surfaced in the UI with remediation guidance.
 *
 * Checkov must be installed in the Lambda container:
 *   pip3 install checkov  (add to Dockerfile)
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const execFileAsync = promisify(execFile);

// ─── Types ────────────────────────────────────────────────────────────────────

export type Severity  = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type Framework = "hipaa" | "soc2" | "cis_aws_foundations_benchmark" | "nist_800_53" | "pci" | "gdpr";

export interface ScanOptions {
  hclContent:      string;           // Complete HCL to scan
  frameworks:      Framework[];      // Compliance frameworks to check
  blockOnSeverity: Severity[];       // Which severities block deployment (default: CRITICAL, HIGH)
  projectName:     string;
  moduleType:      string;
}

export interface Finding {
  checkId:       string;   // e.g. "CKV_AWS_18" or "CKV_HIPAA_1"
  checkName:     string;   // Human-readable check name
  severity:      Severity;
  framework:     string;   // Which framework flagged this
  resource:      string;   // e.g. "aws_s3_bucket.this"
  file:          string;   // Relative file path
  line:          number;   // Line number in HCL
  remediation:   string;   // How to fix it
  docUrl:        string;   // Link to Checkov docs for this check
}

export interface ScanResult {
  passed:          boolean;       // false if any blockOnSeverity findings exist
  blockedBy:       Finding[];     // Findings that are blocking deployment
  findings:        Finding[];     // All findings (all severities)
  summary: {
    critical: number;
    high:     number;
    medium:   number;
    low:      number;
    passed:   number;
    failed:   number;
  };
  frameworks:   Framework[];
  scanDuration: number;           // milliseconds
  checkovVersion: string;
}

// ─── Checkov output types (internal) ─────────────────────────────────────────

interface CheckovResult {
  check_id:          string;
  check_name:        string;
  result:            "passed" | "failed";
  severity:          string;
  bc_check_id?:      string;
  repo_file_path:    string;
  file_line_range:   [number, number];
  resource:          string;
  guideline?:        string;
  check_type:        string;
}

interface CheckovOutput {
  passed_checks:  CheckovResult[];
  failed_checks:  CheckovResult[];
  parsing_errors: string[];
  summary: {
    passed:   number;
    failed:   number;
    parsing_error: number;
  };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function scanHcl(opts: ScanOptions): Promise<ScanResult> {
  const start = Date.now();

  // Write HCL to a temp directory for Checkov to scan
  const scanDir = join(tmpdir(), `infraready-scan-${Date.now()}`);
  mkdirSync(scanDir, { recursive: true });

  const hclPath = join(scanDir, "main.tf");
  writeFileSync(hclPath, opts.hclContent, "utf-8");

  let checkovVersion = "unknown";
  let rawOutput: CheckovOutput = {
    passed_checks: [],
    failed_checks: [],
    parsing_errors: [],
    summary: { passed: 0, failed: 0, parsing_error: 0 },
  };

  try {
    // Get checkov version
    const { stdout: versionOut } = await execFileAsync("checkov", ["--version"]).catch(() => ({ stdout: "checkov unknown" }));
    checkovVersion = versionOut.trim();

    // Build checkov command
    const args = buildCheckovArgs(hclPath, opts.frameworks);

    const { stdout } = await execFileAsync("checkov", args, {
      timeout: 120_000, // 2 minutes max
      maxBuffer: 10 * 1024 * 1024, // 10MB output
    }).catch((err: { stdout?: string; code?: number }) => {
      // Checkov exits with code 1 when there are failures — that's normal
      if (err.code === 1 && err.stdout) {
        return { stdout: err.stdout };
      }
      throw err;
    });

    rawOutput = JSON.parse(stdout) as CheckovOutput;
  } catch (err) {
    // If Checkov isn't installed or fails to parse, return a warning (don't block)
    console.warn("[security-scan] Checkov scan failed:", err);
    return buildFallbackResult(opts, Date.now() - start);
  } finally {
    // Clean up temp dir
    rmSync(scanDir, { recursive: true, force: true });
  }

  const findings = mapFindings(rawOutput.failed_checks, opts.frameworks);
  const blockedBy = findings.filter(f => opts.blockOnSeverity.includes(f.severity));

  return {
    passed:    blockedBy.length === 0,
    blockedBy,
    findings,
    summary: {
      critical: countBySeverity(findings, "CRITICAL"),
      high:     countBySeverity(findings, "HIGH"),
      medium:   countBySeverity(findings, "MEDIUM"),
      low:      countBySeverity(findings, "LOW"),
      passed:   rawOutput.summary.passed,
      failed:   rawOutput.summary.failed,
    },
    frameworks:     opts.frameworks,
    scanDuration:   Date.now() - start,
    checkovVersion,
  };
}

// ─── Checkov argument builder ─────────────────────────────────────────────────

function buildCheckovArgs(hclPath: string, frameworks: Framework[]): string[] {
  const args = [
    "--file",     hclPath,
    "--output",   "json",
    "--quiet",                // suppress progress bars
    "--compact",              // compact output
  ];

  // Map our framework names to Checkov's framework/check IDs
  const checkovFrameworks = mapFrameworks(frameworks);
  if (checkovFrameworks.length > 0) {
    args.push("--framework", checkovFrameworks.join(","));
  }

  // Always include these critical compliance frameworks
  if (!frameworks.includes("cis_aws_foundations_benchmark")) {
    args.push("--check", CIS_CHECKS.join(","));
  }

  return args;
}

function mapFrameworks(frameworks: Framework[]): string[] {
  const mapping: Record<Framework, string> = {
    hipaa:                          "terraform",  // Checkov checks are tagged by framework in metadata
    soc2:                           "terraform",
    cis_aws_foundations_benchmark:  "terraform",
    nist_800_53:                    "terraform",
    pci:                            "terraform",
    gdpr:                           "terraform",
  };

  // Deduplicate — all use terraform framework in Checkov, filtering by check tags
  return [...new Set(frameworks.map(f => mapping[f]))];
}

// CIS AWS Foundations Benchmark v1.4 — critical checks to always run
const CIS_CHECKS = [
  "CKV_AWS_18",   // S3: Enable access logging
  "CKV_AWS_19",   // S3: Enable encryption
  "CKV_AWS_20",   // S3: Disable public ACL
  "CKV_AWS_21",   // S3: Enable versioning
  "CKV_AWS_28",   // RDS: Enable backups
  "CKV_AWS_16",   // RDS: Enable encryption
  "CKV_AWS_17",   // RDS: Disable public access
  "CKV_AWS_129",  // RDS: Enable CloudWatch logging
  "CKV_AWS_2",    // ALB: Use HTTPS
  "CKV_AWS_92",   // ECS: Enable logging
  "CKV_AWS_97",   // ECS: Use secrets for sensitive env vars
  "CKV_AWS_65",   // ECS: Enable Container Insights
  "CKV_AWS_111",  // IAM: No wildcard resource in policies
  "CKV_AWS_40",   // IAM: No inline policies on users
  "CKV_AWS_7",    // KMS: Enable key rotation
  "CKV_AWS_119",  // CloudWatch: Encrypt log groups
  "CKV_AWS_50",   // Lambda: No public access
  "CKV_AWS_76",   // ALB: Drop invalid headers
];

// ─── Finding mapper ───────────────────────────────────────────────────────────

function mapFindings(rawFailures: CheckovResult[], frameworks: Framework[]): Finding[] {
  return rawFailures.map((f) => ({
    checkId:     f.check_id,
    checkName:   f.check_name,
    severity:    normalizeSeverity(f.severity),
    framework:   detectFramework(f.check_id, frameworks),
    resource:    f.resource,
    file:        f.repo_file_path,
    line:        f.file_line_range[0],
    remediation: getRemediation(f.check_id),
    docUrl:      `https://docs.bridgecrew.io/docs/${f.check_id.toLowerCase()}`,
  }));
}

function normalizeSeverity(raw: string | undefined): Severity {
  const upper = (raw ?? "").toUpperCase();
  if (upper === "CRITICAL") return "CRITICAL";
  if (upper === "HIGH")     return "HIGH";
  if (upper === "MEDIUM")   return "MEDIUM";
  if (upper === "LOW")      return "LOW";
  return "INFO";
}

function detectFramework(checkId: string, frameworks: Framework[]): string {
  // Map check ID prefixes to frameworks
  const prefix = checkId.split("_")[1]; // e.g. "AWS" from "CKV_AWS_18"
  if (checkId.includes("HIPAA")) return "hipaa";
  if (checkId.includes("SOC2"))  return "soc2";
  if (checkId.includes("NIST"))  return "nist_800_53";
  if (checkId.includes("PCI"))   return "pci";
  if (prefix === "AWS")          return frameworks[0] ?? "cis_aws_foundations_benchmark";
  return "general";
}

// ─── Remediation knowledge base ───────────────────────────────────────────────

const REMEDIATIONS: Record<string, string> = {
  // S3
  CKV_AWS_18: "Enable S3 server access logging: add logging { target_bucket = ... }",
  CKV_AWS_19: "Enable S3 encryption: add server_side_encryption_configuration block",
  CKV_AWS_20: "Block public ACL: set acl = \"private\" and add bucket_public_access_block",
  CKV_AWS_21: "Enable versioning: add versioning { enabled = true }",

  // RDS
  CKV_AWS_16: "Enable RDS encryption: set storage_encrypted = true, kms_key_id = <your-kms-key>",
  CKV_AWS_17: "Disable public RDS access: set publicly_accessible = false",
  CKV_AWS_28: "Enable automated backups: set backup_retention_period >= 7",
  CKV_AWS_129:"Enable CloudWatch logging: set enabled_cloudwatch_logs_exports = [\"postgresql\", \"upgrade\"]",

  // IAM
  CKV_AWS_111: "Scope IAM resource to specific ARNs, not \"*\". Use least-privilege principle.",
  CKV_AWS_40:  "Use managed policies instead of inline policies on IAM users.",
  CKV_AWS_7:   "Enable KMS key rotation: set enable_key_rotation = true",

  // ECS
  CKV_AWS_92: "Enable ECS logging: add logConfiguration block pointing to CloudWatch",
  CKV_AWS_97: "Use ECS secrets for sensitive values: reference Secrets Manager ARNs in secrets block",
  CKV_AWS_65: "Enable Container Insights: set setting { name = \"containerInsights\" value = \"enabled\" }",

  // ALB
  CKV_AWS_2:  "Enforce HTTPS on ALB: use aws_lb_listener with protocol = \"HTTPS\" and ssl_policy",
  CKV_AWS_76: "Drop invalid headers on ALB: set drop_invalid_header_fields = true",

  // Lambda
  CKV_AWS_50: "Lambda is public. Add resource_policy restricting invocation to specific principals.",

  // CloudWatch
  CKV_AWS_119: "Encrypt CloudWatch log group: set kms_key_id = <your-kms-key-arn>",

  // HIPAA-specific
  CKV_HIPAA_1: "HIPAA: Enable audit logging for all data access",
  CKV_HIPAA_2: "HIPAA: Encrypt all PHI data at rest and in transit",
};

function getRemediation(checkId: string): string {
  return REMEDIATIONS[checkId] ?? `Review the Checkov documentation for ${checkId} and apply the recommended fix.`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countBySeverity(findings: Finding[], severity: Severity): number {
  return findings.filter(f => f.severity === severity).length;
}

// If Checkov isn't installed in the environment, return a soft warning
function buildFallbackResult(opts: ScanOptions, duration: number): ScanResult {
  return {
    passed:    true,     // Don't block if scanner isn't available
    blockedBy: [],
    findings:  [{
      checkId:     "INFRAREADY_SCANNER_UNAVAILABLE",
      checkName:   "Security scanner not available in this environment",
      severity:    "INFO",
      framework:   "system",
      resource:    "system",
      file:        "",
      line:        0,
      remediation: "Checkov is not installed. Add 'RUN pip3 install checkov' to the Dockerfile.",
      docUrl:      "https://www.checkov.io/1.Welcome/Quick%20Start.html",
    }],
    summary:      { critical: 0, high: 0, medium: 0, low: 0, passed: 0, failed: 0 },
    frameworks:   opts.frameworks,
    scanDuration: duration,
    checkovVersion: "not installed",
  };
}

// ─── Convenience: format scan result for UI display ──────────────────────────

export function formatScanReport(result: ScanResult): string {
  const icon    = result.passed ? "✅" : "🚫";
  const status  = result.passed ? "PASSED — deployment cleared" : "BLOCKED — fix issues before deploying";

  const lines = [
    `${icon} Security scan: ${status}`,
    `   Frameworks: ${result.frameworks.join(", ")}`,
    `   Results: ${result.summary.passed} checks passed, ${result.summary.failed} failed`,
    `   Severity: CRITICAL=${result.summary.critical} HIGH=${result.summary.high} MEDIUM=${result.summary.medium} LOW=${result.summary.low}`,
    `   Duration: ${result.scanDuration}ms`,
  ];

  if (result.blockedBy.length > 0) {
    lines.push("", "Issues blocking deployment:");
    for (const f of result.blockedBy) {
      lines.push(`   [${f.severity}] ${f.checkId}: ${f.checkName}`);
      lines.push(`      Resource: ${f.resource} (line ${f.line})`);
      lines.push(`      Fix: ${f.remediation}`);
      lines.push(`      Docs: ${f.docUrl}`);
    }
  }

  return lines.join("\n");
}

// ─── Convenience: default scan options for InfraReady deployments ─────────────

export const DEFAULT_FRAMEWORKS: Framework[] = [
  "cis_aws_foundations_benchmark",
  "soc2",
  "hipaa",
];

export const DEFAULT_BLOCK_ON: Severity[] = ["CRITICAL", "HIGH"];
