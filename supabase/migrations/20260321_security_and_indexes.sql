-- Security fixes and index improvements — 2026-03-21
--
-- Bug 2 (HIGH): deployments.action has no CHECK constraint — any value can be inserted
-- Bug 3 (HIGH): waitlist RLS policy uses USING(true) — leaks all emails to anon callers
-- Bug 4 (MEDIUM): no composite index on (project_id, created_at DESC) — slow page loads at scale
-- Bug 5 (MEDIUM): template_stats view accessible to all roles — exposes cross-customer telemetry


-- ── Bug 2: add CHECK constraint to deployments.action ────────────────────────
-- The runner only writes 'deploy' or 'destroy'; enforce this at the DB layer.
ALTER TABLE public.deployments
  ADD CONSTRAINT deployments_action_check
  CHECK (action IN ('deploy', 'destroy'));


-- ── Bug 3: fix waitlist RLS — scope reads/writes to service_role only ─────────
-- The previous policy used USING(true) which allowed any authenticated or anon
-- Supabase client to SELECT all waitlist rows (names + emails).
DROP POLICY IF EXISTS "service role full access" ON public.waitlist;

CREATE POLICY "service_role_only" ON public.waitlist
  FOR ALL
  USING      (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ── Bug 4: composite index for the most common deployments query ──────────────
-- The project detail page queries: WHERE project_id = ? ORDER BY created_at DESC LIMIT 1
-- A single-column index on project_id cannot satisfy the ORDER BY without a sort.
CREATE INDEX IF NOT EXISTS idx_deployments_project_created
  ON public.deployments (project_id, created_at DESC);

-- Also useful for admin dashboards filtering by status + time:
CREATE INDEX IF NOT EXISTS idx_deployments_status_created
  ON public.deployments (status, created_at DESC);


-- ── Bug 5: restrict template_stats view to service_role ───────────────────────
-- Views in PostgreSQL bypass RLS by default; any authenticated user could call
-- SELECT * FROM template_stats and see cross-customer deployment counts/rates.
REVOKE ALL ON public.template_stats FROM anon, authenticated;
GRANT  SELECT ON public.template_stats TO service_role;
