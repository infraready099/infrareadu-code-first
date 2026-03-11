-- InfraReady.io — Add GitHub integration columns to projects table
-- Run this migration after 001_initial.sql

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS github_installation_id   TEXT,
  ADD COLUMN IF NOT EXISTS github_repo_owner        TEXT,
  ADD COLUMN IF NOT EXISTS github_repo_name         TEXT,
  ADD COLUMN IF NOT EXISTS github_branch            TEXT DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS github_connected_at      TIMESTAMPTZ;

-- Index for the webhook handler: looks up projects by installation_id + repo
CREATE INDEX IF NOT EXISTS idx_projects_github_installation
  ON public.projects (github_installation_id);

COMMENT ON COLUMN public.projects.github_installation_id IS
  'GitHub App installation ID — unique per user+org that installed the app';
COMMENT ON COLUMN public.projects.github_repo_owner IS
  'GitHub repository owner (username or org name)';
COMMENT ON COLUMN public.projects.github_repo_name IS
  'GitHub repository name without owner prefix';
COMMENT ON COLUMN public.projects.github_branch IS
  'Branch to deploy on push — defaults to main';
COMMENT ON COLUMN public.projects.github_connected_at IS
  'Timestamp when the GitHub App was installed and linked to this project';
