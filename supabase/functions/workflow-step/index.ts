import { jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { processDueSteps } from '../_shared/workflow/executor.ts';
import { checkSchedulerAuth } from '../_shared/scheduler-auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const denied = checkSchedulerAuth(req);
    if (denied) return denied;
    const processed = await processDueSteps();
    return jsonResponse({ processed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
