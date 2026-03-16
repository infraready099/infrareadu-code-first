/**
 * App Template Registry
 *
 * Defines all one-click deployable open-source applications.
 * Templates are deployed directly from Docker Hub / GHCR — no GitHub repo required.
 *
 * Adding a new template: append one object to APP_TEMPLATES. No other changes needed.
 * The runner will auto-detect modules, env var handling, and Secrets Manager routing.
 */

export type TemplateCategory =
  | "automation"
  | "analytics"
  | "cms"
  | "storage"
  | "database"
  | "ai"
  | "monitoring"
  | "lowcode"
  | "bi";

export interface TemplateEnvVar {
  /** The environment variable key passed to the container */
  key: string;
  /** Human-readable label shown in the UI */
  label: string;
  /** Help text shown beneath the input */
  description: string;
  /** Whether the user must provide a value before deploying */
  required: boolean;
  /**
   * If true, the value is stored in AWS Secrets Manager and injected via
   * ECS secrets injection — never appears in plaintext task definition.
   */
  secret: boolean;
  defaultValue?: string;
  placeholder?: string;
  validation?: "url" | "email" | "alphanumeric" | "any";
}

export interface TemplateVolume {
  /** Logical name used by ECS */
  name: string;
  /** Mount path inside the container */
  containerPath: string;
  /** EFS or ephemeral size in GB (EFS for persistence) */
  sizeGb: number;
}

export interface AppTemplate {
  /** Unique stable identifier — used in DB and SQS payloads */
  id: string;
  /** Display name */
  name: string;
  /** One-sentence description */
  description: string;
  category: TemplateCategory;
  /** Fully qualified Docker image reference */
  dockerImage: string;
  /** Port the container listens on */
  port: number;
  protocol: "http" | "https";
  /** Fargate CPU units: 256 | 512 | 1024 | 2048 */
  cpu: number;
  /** Fargate memory in MB: 512 | 1024 | 2048 | 4096 */
  memory: number;
  /** When true, the rds module is added to the deployment */
  requiresDatabase: boolean;
  /** When true, the storage module is added to the deployment */
  requiresStorage: boolean;
  /** Environment variables the user must/can configure */
  envVars: TemplateEnvVar[];
  /** Optional persistent volumes (requires EFS — adds cost) */
  volumes?: TemplateVolume[];
  /** ALB health check path */
  healthCheckPath: string;
  /** Approximate AWS cost per month in USD (ECS + optional RDS) */
  estimatedMonthlyCost: number;
  /** Name of the equivalent SaaS product */
  saasAlternative?: string;
  /** Monthly cost of the equivalent SaaS */
  saasAlternativeCost?: number;
  /** Emoji used in the UI template picker */
  icon: string;
  /** Link to the official docs */
  docsUrl?: string;
  /** Searchable tags */
  tags: string[];
}

// ─── Template Definitions ────────────────────────────────────────────────────

export const APP_TEMPLATES: AppTemplate[] = [
  // ── n8n ──────────────────────────────────────────────────────────────────
  {
    id: "n8n",
    name: "n8n",
    description: "Workflow automation platform — connect anything, automate everything.",
    category: "automation",
    dockerImage: "n8nio/n8n:latest",
    port: 5678,
    protocol: "http",
    cpu: 512,
    memory: 1024,
    requiresDatabase: true,
    requiresStorage: false,
    healthCheckPath: "/healthz",
    estimatedMonthlyCost: 45,
    saasAlternative: "n8n Cloud",
    saasAlternativeCost: 50,
    icon: "⚡",
    docsUrl: "https://docs.n8n.io/hosting/",
    tags: ["automation", "workflow", "no-code", "zapier-alternative"],
    envVars: [
      {
        key: "N8N_BASIC_AUTH_ACTIVE",
        label: "Enable Basic Auth",
        description: "Protect the UI with a username and password.",
        required: false,
        secret: false,
        defaultValue: "true",
        validation: "any",
      },
      {
        key: "N8N_BASIC_AUTH_USER",
        label: "Admin Username",
        description: "Username for the n8n web UI.",
        required: true,
        secret: false,
        placeholder: "admin",
        validation: "alphanumeric",
      },
      {
        key: "N8N_BASIC_AUTH_PASSWORD",
        label: "Admin Password",
        description: "Password for the n8n web UI. Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "strong-password-here",
        validation: "any",
      },
      {
        key: "WEBHOOK_URL",
        label: "Webhook Base URL",
        description: "Public URL where n8n receives webhooks (your domain or ALB DNS).",
        required: false,
        secret: false,
        placeholder: "https://n8n.yourdomain.com",
        validation: "url",
      },
      {
        key: "N8N_ENCRYPTION_KEY",
        label: "Encryption Key",
        description: "Key used to encrypt stored credentials. Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "32-character-random-string",
        validation: "any",
      },
    ],
  },

  // ── Ghost ─────────────────────────────────────────────────────────────────
  {
    id: "ghost",
    name: "Ghost",
    description: "Professional publishing platform for newsletters, blogs, and memberships.",
    category: "cms",
    // Ghost's official image requires MySQL. We use the Postgres-compatible
    // community image. For production use of the official image, swap to MySQL
    // RDS (engine: mysql) — note this in the UI.
    dockerImage: "ghost:5-alpine",
    port: 2368,
    protocol: "http",
    cpu: 512,
    memory: 1024,
    requiresDatabase: true,
    requiresStorage: true,
    healthCheckPath: "/ghost/api/v4/admin/",
    estimatedMonthlyCost: 55,
    saasAlternative: "Ghost Pro",
    saasAlternativeCost: 36,
    icon: "👻",
    docsUrl: "https://ghost.org/docs/config/",
    tags: ["cms", "blog", "newsletter", "publishing", "membership"],
    envVars: [
      {
        key: "url",
        label: "Site URL",
        description: "The public URL of your Ghost site.",
        required: true,
        secret: false,
        placeholder: "https://blog.yourdomain.com",
        validation: "url",
      },
      {
        key: "database__client",
        label: "Database Client",
        description: "Ghost database driver. Use 'mysql' for the official image.",
        required: false,
        secret: false,
        defaultValue: "mysql",
        validation: "any",
      },
      {
        key: "mail__transport",
        label: "Mail Transport",
        description: "Email transport method (SMTP, SES, etc.).",
        required: false,
        secret: false,
        defaultValue: "SMTP",
        validation: "any",
      },
      {
        key: "mail__options__service",
        label: "Mail Service",
        description: "Mail service provider (e.g. Mailgun, SES).",
        required: false,
        secret: false,
        placeholder: "Mailgun",
        validation: "any",
      },
      {
        key: "mail__options__auth__user",
        label: "Mail Username / API Key",
        description: "SMTP username or API key. Stored in Secrets Manager.",
        required: false,
        secret: true,
        placeholder: "postmaster@mg.yourdomain.com",
        validation: "any",
      },
      {
        key: "mail__options__auth__pass",
        label: "Mail Password",
        description: "SMTP password. Stored in Secrets Manager.",
        required: false,
        secret: true,
        placeholder: "smtp-password",
        validation: "any",
      },
    ],
  },

  // ── Plausible Analytics ───────────────────────────────────────────────────
  {
    id: "plausible",
    name: "Plausible Analytics",
    description: "Privacy-friendly, lightweight website analytics. GDPR compliant.",
    category: "analytics",
    // Plausible officially uses Postgres + ClickHouse. This single-container
    // image uses Postgres only — suitable for low-to-medium traffic.
    dockerImage: "plausible/analytics:latest",
    port: 8000,
    protocol: "http",
    cpu: 512,
    memory: 1024,
    requiresDatabase: true,
    requiresStorage: false,
    healthCheckPath: "/api/health",
    estimatedMonthlyCost: 40,
    saasAlternative: "Plausible Cloud",
    saasAlternativeCost: 19,
    icon: "📊",
    docsUrl: "https://plausible.io/docs/self-hosting",
    tags: ["analytics", "privacy", "gdpr", "google-analytics-alternative"],
    envVars: [
      {
        key: "BASE_URL",
        label: "Base URL",
        description: "Public URL of your Plausible instance.",
        required: true,
        secret: false,
        placeholder: "https://analytics.yourdomain.com",
        validation: "url",
      },
      {
        key: "SECRET_KEY_BASE",
        label: "Secret Key Base",
        description: "64+ character random secret for session encryption. Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "generate with: openssl rand -base64 64",
        validation: "any",
      },
      {
        key: "DISABLE_REGISTRATION",
        label: "Disable Public Registration",
        description: "Set to 'true' to prevent new signups after your account is created.",
        required: false,
        secret: false,
        defaultValue: "true",
        validation: "any",
      },
    ],
  },

  // ── Umami Analytics ───────────────────────────────────────────────────────
  {
    id: "umami",
    name: "Umami",
    description: "Simple, fast, privacy-focused analytics alternative to Google Analytics.",
    category: "analytics",
    dockerImage: "ghcr.io/umami-software/umami:postgresql-latest",
    port: 3000,
    protocol: "http",
    cpu: 256,
    memory: 512,
    requiresDatabase: true,
    requiresStorage: false,
    healthCheckPath: "/api/heartbeat",
    estimatedMonthlyCost: 32,
    saasAlternative: "Umami Cloud",
    saasAlternativeCost: 9,
    icon: "🔵",
    docsUrl: "https://umami.is/docs/install",
    tags: ["analytics", "privacy", "lightweight", "open-source"],
    envVars: [
      {
        key: "APP_SECRET",
        label: "App Secret",
        description: "Random string used to generate unique values. Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "generate with: openssl rand -hex 32",
        validation: "any",
      },
    ],
  },

  // ── MinIO ─────────────────────────────────────────────────────────────────
  {
    id: "minio",
    name: "MinIO",
    description: "S3-compatible object storage. Drop-in replacement for AWS S3.",
    category: "storage",
    dockerImage: "minio/minio:latest",
    port: 9000,
    protocol: "http",
    cpu: 512,
    memory: 1024,
    requiresDatabase: false,
    requiresStorage: true, // S3 bucket for MinIO data persistence via EFS or S3 gateway
    healthCheckPath: "/minio/health/live",
    estimatedMonthlyCost: 35,
    saasAlternative: "AWS S3",
    saasAlternativeCost: 23,
    icon: "🗄️",
    docsUrl: "https://min.io/docs/minio/container/index.html",
    tags: ["storage", "s3", "object-storage", "self-hosted"],
    envVars: [
      {
        key: "MINIO_ROOT_USER",
        label: "Root Username",
        description: "MinIO admin username (at least 3 characters). Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "minio-admin",
        validation: "any",
      },
      {
        key: "MINIO_ROOT_PASSWORD",
        label: "Root Password",
        description: "MinIO admin password (at least 8 characters). Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "strong-password-here",
        validation: "any",
      },
      {
        key: "MINIO_BROWSER_REDIRECT_URL",
        label: "Console URL",
        description: "Public URL for the MinIO console (port 9001).",
        required: false,
        secret: false,
        placeholder: "https://minio-console.yourdomain.com",
        validation: "url",
      },
    ],
    volumes: [
      {
        name: "minio-data",
        containerPath: "/data",
        sizeGb: 50,
      },
    ],
  },

  // ── Appsmith ──────────────────────────────────────────────────────────────
  {
    id: "appsmith",
    name: "Appsmith",
    description: "Low-code platform to build internal tools, dashboards, and admin panels.",
    category: "lowcode",
    // Appsmith CE bundles its own MongoDB and Redis — no external DB needed.
    dockerImage: "appsmith/appsmith-ce:latest",
    port: 80,
    protocol: "http",
    cpu: 1024,
    memory: 2048,
    requiresDatabase: false,
    requiresStorage: false,
    healthCheckPath: "/api/v1/health",
    estimatedMonthlyCost: 50,
    saasAlternative: "Appsmith Cloud",
    saasAlternativeCost: 40,
    icon: "🛠️",
    docsUrl: "https://docs.appsmith.com/getting-started/setup/installation-guides/docker",
    tags: ["lowcode", "internal-tools", "admin-panel", "dashboard"],
    envVars: [
      {
        key: "APPSMITH_ENCRYPTION_PASSWORD",
        label: "Encryption Password",
        description: "Password for encrypting datasource credentials. Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "strong-password-here",
        validation: "any",
      },
      {
        key: "APPSMITH_ENCRYPTION_SALT",
        label: "Encryption Salt",
        description: "Salt for encrypting datasource credentials. Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "random-salt-string",
        validation: "any",
      },
      {
        key: "APPSMITH_SUPERVISOR_PASSWORD",
        label: "Supervisor Password",
        description: "Password for the internal process supervisor. Stored in Secrets Manager.",
        required: false,
        secret: true,
        placeholder: "supervisor-password",
        validation: "any",
      },
    ],
    volumes: [
      {
        name: "appsmith-data",
        containerPath: "/appsmith-stacks",
        sizeGb: 20,
      },
    ],
  },

  // ── Directus ──────────────────────────────────────────────────────────────
  {
    id: "directus",
    name: "Directus",
    description: "Headless CMS and data platform — REST + GraphQL API over any SQL database.",
    category: "cms",
    dockerImage: "directus/directus:latest",
    port: 8055,
    protocol: "http",
    cpu: 512,
    memory: 1024,
    requiresDatabase: true,
    requiresStorage: false,
    healthCheckPath: "/server/health",
    estimatedMonthlyCost: 45,
    saasAlternative: "Directus Cloud",
    saasAlternativeCost: 15,
    icon: "📦",
    docsUrl: "https://docs.directus.io/self-hosted/docker-guide.html",
    tags: ["cms", "headless", "api", "graphql", "rest"],
    envVars: [
      {
        key: "SECRET",
        label: "App Secret",
        description: "Random secret for signing tokens. Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "generate with: openssl rand -hex 32",
        validation: "any",
      },
      {
        key: "ADMIN_EMAIL",
        label: "Admin Email",
        description: "Email address for the first admin user.",
        required: true,
        secret: false,
        placeholder: "admin@yourdomain.com",
        validation: "email",
      },
      {
        key: "ADMIN_PASSWORD",
        label: "Admin Password",
        description: "Password for the first admin user. Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "strong-password-here",
        validation: "any",
      },
      {
        key: "PUBLIC_URL",
        label: "Public URL",
        description: "Public URL of your Directus instance (used for CORS and redirects).",
        required: false,
        secret: false,
        placeholder: "https://cms.yourdomain.com",
        validation: "url",
      },
    ],
  },

  // ── Metabase ──────────────────────────────────────────────────────────────
  {
    id: "metabase",
    name: "Metabase",
    description: "Business intelligence tool — explore data and build dashboards without SQL.",
    category: "bi",
    dockerImage: "metabase/metabase:latest",
    port: 3000,
    protocol: "http",
    cpu: 1024,
    memory: 2048,
    // Metabase uses Postgres to store its own config, questions, and dashboards.
    requiresDatabase: true,
    requiresStorage: false,
    healthCheckPath: "/api/health",
    estimatedMonthlyCost: 60,
    saasAlternative: "Metabase Cloud",
    saasAlternativeCost: 85,
    icon: "📈",
    docsUrl: "https://www.metabase.com/docs/latest/installation-and-operation/running-metabase-on-docker",
    tags: ["bi", "analytics", "dashboards", "sql", "data"],
    envVars: [
      {
        key: "MB_ENCRYPTION_SECRET_KEY",
        label: "Encryption Secret Key",
        description: "Key used to encrypt sensitive data in the Metabase database. Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "generate with: openssl rand -base64 32",
        validation: "any",
      },
      {
        key: "MB_SITE_URL",
        label: "Site URL",
        description: "Public URL of your Metabase instance.",
        required: false,
        secret: false,
        placeholder: "https://metabase.yourdomain.com",
        validation: "url",
      },
      {
        key: "JAVA_TIMEZONE",
        label: "Timezone",
        description: "JVM timezone for date display in reports.",
        required: false,
        secret: false,
        defaultValue: "UTC",
        validation: "any",
      },
    ],
  },

  // ── WordPress ─────────────────────────────────────────────────────────────
  {
    id: "wordpress",
    name: "WordPress",
    description: "The world's most popular CMS. Powers 43% of all websites.",
    category: "cms",
    // WordPress officially requires MySQL. The RDS module deploys a MySQL-compatible
    // Amazon Aurora Serverless v2 instance when db_engine is set to "mysql".
    // This is noted in the template so the runner sets db_engine: "mysql".
    dockerImage: "wordpress:latest",
    port: 80,
    protocol: "http",
    cpu: 512,
    memory: 1024,
    requiresDatabase: true,
    requiresStorage: true,
    healthCheckPath: "/wp-login.php",
    estimatedMonthlyCost: 45,
    saasAlternative: "WordPress.com",
    saasAlternativeCost: 25,
    icon: "🌐",
    docsUrl: "https://developer.wordpress.org/advanced-administration/before-install/",
    tags: ["cms", "blog", "website", "popular"],
    envVars: [
      {
        key: "WORDPRESS_DB_NAME",
        label: "Database Name",
        description: "Name of the WordPress database.",
        required: false,
        secret: false,
        defaultValue: "wordpress",
        validation: "alphanumeric",
      },
      {
        key: "WORDPRESS_TABLE_PREFIX",
        label: "Table Prefix",
        description: "Database table prefix. Change for security.",
        required: false,
        secret: false,
        defaultValue: "wp_",
        validation: "any",
      },
      {
        key: "WORDPRESS_AUTH_KEY",
        label: "Auth Key",
        description: "Secret key for authentication cookies. Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "generate at: https://api.wordpress.org/secret-key/1.1/salt/",
        validation: "any",
      },
      {
        key: "WORDPRESS_SECURE_AUTH_KEY",
        label: "Secure Auth Key",
        description: "Secret key for secure authentication cookies. Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "generate at: https://api.wordpress.org/secret-key/1.1/salt/",
        validation: "any",
      },
    ],
  },

  // ── Supabase (lite) ───────────────────────────────────────────────────────
  {
    id: "supabase-lite",
    name: "Supabase (Self-hosted)",
    description: "Self-hosted Postgres with REST API, auth, and realtime subscriptions.",
    category: "database",
    // The supabase/postgres image is the Postgres layer only. Full self-hosted
    // Supabase stack requires docker-compose with 8+ services — not suitable
    // for single-container ECS. This deploys the managed Postgres image with
    // PostgREST for the REST API layer.
    dockerImage: "supabase/postgres:15.1.0.147",
    port: 5432,
    protocol: "http",
    cpu: 1024,
    memory: 2048,
    requiresDatabase: false, // IS the database
    requiresStorage: false,
    healthCheckPath: "/",
    estimatedMonthlyCost: 55,
    saasAlternative: "Supabase Cloud",
    saasAlternativeCost: 25,
    icon: "🟢",
    docsUrl: "https://supabase.com/docs/guides/self-hosting/docker",
    tags: ["database", "postgres", "rest-api", "auth", "realtime", "firebase-alternative"],
    envVars: [
      {
        key: "POSTGRES_PASSWORD",
        label: "Postgres Password",
        description: "Password for the Postgres superuser. Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "strong-password-here",
        validation: "any",
      },
      {
        key: "JWT_SECRET",
        label: "JWT Secret",
        description: "Secret for signing JWTs (minimum 32 characters). Stored in Secrets Manager.",
        required: true,
        secret: true,
        placeholder: "generate with: openssl rand -base64 32",
        validation: "any",
      },
    ],
    volumes: [
      {
        name: "postgres-data",
        containerPath: "/var/lib/postgresql/data",
        sizeGb: 20,
      },
    ],
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Look up a template by its stable ID.
 * Returns undefined if the ID does not exist — callers must handle this.
 */
export function getTemplate(id: string): AppTemplate | undefined {
  return APP_TEMPLATES.find((t) => t.id === id);
}

/**
 * Returns all templates in a given category, sorted by estimated cost ascending.
 */
export function getTemplatesByCategory(category: TemplateCategory): AppTemplate[] {
  return APP_TEMPLATES
    .filter((t) => t.category === category)
    .sort((a, b) => a.estimatedMonthlyCost - b.estimatedMonthlyCost);
}

/**
 * Returns all unique categories that have at least one template.
 */
export function getAvailableCategories(): TemplateCategory[] {
  return [...new Set(APP_TEMPLATES.map((t) => t.category))];
}
