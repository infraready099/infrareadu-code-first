-- InfraReady.io — App Template Marketplace
-- Adds template support to the projects table.
-- Run after: 20260310_add_github_columns.sql

-- ─── Add template columns to projects ───────────────────────────────────────

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS app_template_id  TEXT,
  ADD COLUMN IF NOT EXISTS template_config  JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.projects.app_template_id IS
  'ID of the app template used for this project (e.g. "n8n", "ghost"). NULL for repo-based projects.';

COMMENT ON COLUMN public.projects.template_config IS
  'User-provided env var values for the template. Secret values are NOT stored here — '
  'they are written directly to AWS Secrets Manager by the runner.';

-- ─── Index — template queries ────────────────────────────────────────────────
-- Used by template analytics and to quickly find all deployments of a given template.

CREATE INDEX IF NOT EXISTS idx_projects_template
  ON public.projects (app_template_id)
  WHERE app_template_id IS NOT NULL;

-- ─── Template analytics view ─────────────────────────────────────────────────
-- Shows how many projects have been deployed per template.
-- Used by the admin dashboard to surface popular templates.

CREATE OR REPLACE VIEW public.template_stats AS
  SELECT
    app_template_id,
    COUNT(*)                                        AS deploy_count,
    COUNT(*) FILTER (WHERE status = 'success')      AS success_count,
    COUNT(*) FILTER (WHERE status = 'failed')       AS failed_count,
    MAX(last_deployed_at)                           AS last_deployed_at
  FROM public.projects
  WHERE app_template_id IS NOT NULL
  GROUP BY app_template_id
  ORDER BY deploy_count DESC;

COMMENT ON VIEW public.template_stats IS
  'Aggregate deployment counts per app template. Read-only — updated automatically.';

-- ─── repo_url: make nullable for template projects ───────────────────────────
-- Template projects have no GitHub repo — repo_url should be optional.
-- The initial schema set NOT NULL; relax that constraint here.

ALTER TABLE public.projects
  ALTER COLUMN repo_url DROP NOT NULL;

-- Add a check: a project must have EITHER a repo_url OR an app_template_id,
-- but not neither (NULL + NULL is invalid).
ALTER TABLE public.projects
  ADD CONSTRAINT projects_repo_or_template
  CHECK (repo_url IS NOT NULL OR app_template_id IS NOT NULL);

COMMENT ON CONSTRAINT projects_repo_or_template ON public.projects IS
  'Every project must have either a GitHub repo URL or an app template ID.';
