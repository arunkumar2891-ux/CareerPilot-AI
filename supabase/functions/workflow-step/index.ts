import { jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { processDueSteps } from '../_shared/workflow/executor.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const secret = Deno.env.get('WORKFLOW_SCHEDULER_SECRET');
    const authHeader = req.headers.get('Authorization');
    if (secret && authHeader !== `Bearer ${secret}`) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const processed = await processDueSteps();
    return jsonResponse({ processed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
