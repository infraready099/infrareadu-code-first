/**
 * GitHub App — push deploy.yml into the customer's repo after deployment.
 *
 * Auth flow:
 *   1. Sign a short-lived JWT with the App's private key (RS256)
 *   2. Exchange it for an installation access token (scoped to one install)
 *   3. PUT the workflow file via the GitHub Contents API
 *
 * No extra npm packages needed — uses Node.js built-in `crypto` + `https`.
 */

import * as crypto from "crypto";
import * as https  from "https";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PushWorkflowParams {
  /** GitHub App ID (numeric) */
  appId: string;
  /** PEM-encoded RSA private key for the App */
  privateKeyPem: string;
  /** Installation ID stored on the project row */
  installationId: string;
  /** Repo owner (e.g. "acme-corp") */
  owner: string;
  /** Repo name (e.g. "my-app") */
  repo: string;
  /** YAML content to write */
  workflowYaml: string;
}

// ─── JWT helpers (RS256, no dependencies) ────────────────────────────────────

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function makeAppJwt(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);

  const header  = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iat: now - 60,   // allow 60s clock skew
    exp: now + 600,  // 10 minutes max
    iss: appId,
  }));

  const toSign  = `${header}.${payload}`;
  const sign    = crypto.createSign("RSA-SHA256");
  sign.update(toSign);
  const sig = base64url(sign.sign(privateKeyPem));

  return `${toSign}.${sig}`;
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function httpsRequest(
  options: https.RequestOptions,
  body?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end",  () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function githubRequest<T>(
  path: string,
  method: "GET" | "POST" | "PUT",
  token: string,
  body?: object
): Promise<T> {
  const bodyStr = body ? JSON.stringify(body) : undefined;
  return httpsRequest(
    {
      hostname: "api.github.com",
      path,
      method,
      headers: {
        "Accept":        "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "User-Agent":    "InfraReady-Runner/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(bodyStr ? {
          "Content-Type":   "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
        } : {}),
      },
    },
    bodyStr
  ).then(({ status, body: raw }) => {
    if (status >= 400) {
      throw new Error(`GitHub API ${method} ${path} → ${status}: ${raw}`);
    }
    return JSON.parse(raw) as T;
  });
}

// ─── Public function ──────────────────────────────────────────────────────────

/**
 * Pushes `.github/workflows/deploy.yml` into the customer's repo.
 * Creates the file if it doesn't exist; updates it if it does.
 * Returns the URL of the committed file.
 */
export async function pushWorkflowToRepo(params: PushWorkflowParams): Promise<string> {
  const { appId, privateKeyPem, installationId, owner, repo, workflowYaml } = params;

  // Step 1 — get installation access token
  const jwt = makeAppJwt(appId, privateKeyPem);
  const tokenResp = await githubRequest<{ token: string }>(
    `/app/installations/${installationId}/access_tokens`,
    "POST",
    jwt
  );
  const token = tokenResp.token;

  // Step 2 — check if file exists (to get its SHA for update)
  const filePath = ".github/workflows/deploy.yml";
  const apiPath  = `/repos/${owner}/${repo}/contents/${filePath}`;

  let existingSha: string | undefined;
  try {
    const existing = await githubRequest<{ sha: string }>(apiPath, "GET", token);
    existingSha = existing.sha;
  } catch {
    // 404 = file doesn't exist yet — that's fine
  }

  // Step 3 — create or update the file
  const content = Buffer.from(workflowYaml).toString("base64");
  const message = existingSha
    ? "chore: update InfraReady deploy workflow"
    : "chore: add InfraReady deploy workflow";

  const result = await githubRequest<{ content: { html_url: string } }>(
    apiPath,
    "PUT",
    token,
    {
      message,
      content,
      ...(existingSha ? { sha: existingSha } : {}),
    }
  );

  return result.content.html_url;
}
