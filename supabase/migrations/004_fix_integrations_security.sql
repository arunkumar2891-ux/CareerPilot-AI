-- Fix Supabase security advisor: integrations_safe view used SECURITY DEFINER semantics
-- Drop function first (it depends on the view type), then the view, then recreate safely.

DROP FUNCTION IF EXISTS public.get_integrations_safe();

DROP VIEW IF EXISTS public.integrations_safe;

-- List integrations without exposing credentials column
CREATE OR REPLACE FUNCTION public.get_integrations_safe()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  name text,
  category text,
  status text,
  description text,
  icon text,
  last_sync timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.user_id,
    i.name,
    i.category,
    i.status,
    i.description,
    i.icon,
    i.last_sync,
    i.created_at,
    i.updated_at
  FROM public.integrations i
  WHERE i.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_integrations_safe() TO authenticated;

-- Prevent SELECT * from returning credentials to the client
REVOKE SELECT ON public.integrations FROM authenticated;
GRANT SELECT (
  id, user_id, name, category, status, description, icon, last_sync, created_at, updated_at
) ON public.integrations TO authenticated;

-- Inserts/updates still allowed (RLS enforces user_id); credentials writable on insert/update
GRANT INSERT, UPDATE, DELETE ON public.integrations TO authenticated;
