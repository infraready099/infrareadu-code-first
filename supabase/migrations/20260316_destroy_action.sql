-- Add action column to deployments (deploy vs destroy)
ALTER TABLE public.deployments
  ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'deploy';

-- Add destroyed status to projects
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('pending', 'deploying', 'success', 'failed', 'destroying', 'destroyed'));
