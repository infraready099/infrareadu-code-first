-- InfraReady.io — Initial Database Schema
-- Run this in the Supabase SQL editor or via `supabase db push`

-- ─── PROJECTS ───────────────────────────────────────────────────────────────

CREATE TABLE public.projects (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  repo_url           TEXT        NOT NULL,
  aws_region         TEXT        NOT NULL DEFAULT 'us-east-1',
  aws_role_arn       TEXT,
  aws_account_id     TEXT,
  aws_external_id    TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  aws_connected_at   TIMESTAMPTZ,
  status             TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'deploying', 'success', 'failed')),
  last_deployed_at   TIMESTAMPTZ,
  outputs            JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── DEPLOYMENTS ────────────────────────────────────────────────────────────

CREATE TABLE public.deployments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modules         TEXT[]      NOT NULL,
  config          JSONB       NOT NULL DEFAULT '{}',
  status          TEXT        NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'running', 'success', 'failed')),
  current_module  TEXT,
  logs            JSONB       NOT NULL DEFAULT '[]',
  outputs         JSONB,
  error           TEXT,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── INDEXES ────────────────────────────────────────────────────────────────

CREATE INDEX idx_projects_user_id     ON public.projects(user_id);
CREATE INDEX idx_deployments_project  ON public.deployments(project_id);
CREATE INDEX idx_deployments_user     ON public.deployments(user_id);
CREATE INDEX idx_deployments_status   ON public.deployments(status);

-- ─── UPDATED_AT TRIGGER ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER deployments_updated_at
  BEFORE UPDATE ON public.deployments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────

ALTER TABLE public.projects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;

-- Users can only see and modify their own projects
CREATE POLICY "users_own_projects" ON public.projects
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only see and modify their own deployments
CREATE POLICY "users_own_deployments" ON public.deployments
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role (used by the Lambda runner) bypasses RLS to write logs + update status
CREATE POLICY "service_role_projects" ON public.projects
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_deployments" ON public.deployments
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── APPEND LOG RPC ─────────────────────────────────────────────────────────
-- Called by the Lambda runner to append a log entry without fetching the whole array.
-- SECURITY DEFINER runs as the postgres superuser — bypasses RLS for the runner.

CREATE OR REPLACE FUNCTION public.append_deployment_log(
  p_deployment_id UUID,
  p_log_entry     JSONB
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.deployments
  SET    logs       = logs || p_log_entry,
         updated_at = now()
  WHERE  id = p_deployment_id;
$$;

-- ─── SUPABASE REALTIME ───────────────────────────────────────────────────────
-- Enable realtime on deployments so the UI can subscribe to live log updates.
-- The project detail page subscribes to changes on the specific deployment row.

ALTER PUBLICATION supabase_realtime ADD TABLE public.deployments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
