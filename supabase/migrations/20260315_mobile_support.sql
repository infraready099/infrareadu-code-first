-- InfraReady.io — Mobile Deployment Support
-- Adds mobile-specific columns to projects and a lookup index.
-- All columns are nullable so existing web projects are unaffected.
-- Run via: supabase db push

-- ─── PROJECTS: MOBILE COLUMNS ────────────────────────────────────────────────

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS deployment_type    TEXT DEFAULT 'web'
    CHECK (deployment_type IN ('web', 'mobile', 'template')),

  ADD COLUMN IF NOT EXISTS mobile_platform    TEXT
    CHECK (mobile_platform IN ('ios', 'android', 'both')),

  ADD COLUMN IF NOT EXISTS mobile_framework   TEXT
    CHECK (mobile_framework IN ('expo', 'react-native', 'flutter')),

  -- iOS bundle identifier (e.g. com.example.app)
  ADD COLUMN IF NOT EXISTS mobile_bundle_id   TEXT,

  -- Android package name (e.g. com.example.app)
  ADD COLUMN IF NOT EXISTS mobile_package_name TEXT,

  -- CodeBuild project name, set after the codebuild module deploys successfully
  ADD COLUMN IF NOT EXISTS codebuild_project_name TEXT;

-- Ensure every existing project row explicitly has deployment_type = 'web'
-- so the CHECK constraint is satisfied without requiring a column default migration.
UPDATE public.projects
SET deployment_type = 'web'
WHERE deployment_type IS NULL;

-- ─── INDEX ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_projects_deployment_type ON public.projects(deployment_type);
