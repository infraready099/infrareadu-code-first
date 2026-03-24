-- Fix deployments.status constraint to include destroy states.
--
-- The runner sets deployments.status = 'destroying' and 'destroyed' during
-- tofu destroy runs, but the original constraint only allowed:
--   (queued, running, success, failed)
-- This caused every destroy-flow status update to be silently rejected by
-- Postgres, leaving deployment rows stuck at 'queued' forever and making
-- the destroy progress invisible to the UI.

ALTER TABLE public.deployments
  DROP CONSTRAINT IF EXISTS deployments_status_check;

ALTER TABLE public.deployments
  ADD CONSTRAINT deployments_status_check
  CHECK (status IN ('queued', 'running', 'success', 'failed', 'destroying', 'destroyed'));
