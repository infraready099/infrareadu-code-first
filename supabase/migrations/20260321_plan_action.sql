-- Add plan action and planned status to support Plan → Review → Deploy flow.
-- Users can preview exactly what will be deployed before confirming.

-- 1. Allow action = 'plan' on deployment rows
ALTER TABLE public.deployments
  DROP CONSTRAINT IF EXISTS deployments_action_check;

ALTER TABLE public.deployments
  ADD CONSTRAINT deployments_action_check
  CHECK (action IN ('deploy', 'destroy', 'plan'));

-- 2. Allow status = 'planned' (terminal state after a plan completes)
ALTER TABLE public.deployments
  DROP CONSTRAINT IF EXISTS deployments_status_check;

ALTER TABLE public.deployments
  ADD CONSTRAINT deployments_status_check
  CHECK (status IN ('queued', 'running', 'success', 'failed', 'destroying', 'destroyed', 'planned'));

-- 3. Add plan_summary column — JSONB map of module → { toAdd, toChange, toDestroy }
ALTER TABLE public.deployments
  ADD COLUMN IF NOT EXISTS plan_summary JSONB;
