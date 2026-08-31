import { createUserClient, jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { cancelWorkflowRun } from '../_shared/workflow/executor.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabase = createUserClient(authHeader);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const runId = body.runId as string;
    if (!runId) return jsonResponse({ error: 'runId required' }, 400);

    const result = await cancelWorkflowRun(runId, user.id);
    return jsonResponse({ runId, status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
