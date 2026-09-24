import { jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { processDueSteps, processScheduledAutomations } from '../_shared/workflow/executor.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { checkSchedulerAuth } from '../_shared/scheduler-auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const denied = checkSchedulerAuth(req);
    if (denied) return denied;
    const steps = await processDueSteps();
    const automations = await processScheduledAutomations();
    const admin = createAdminClient();
    // Count only. This used to select and return id/name/schedule for every
    // tenant's active automations, which is a cross-tenant disclosure in a
    // payload that exists purely for operational debugging.
    const { count: activeAutomationCount } = await admin
      .from('automations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    return jsonResponse({
      steps,
      automations,
      utcNow: new Date().toISOString(),
      activeAutomationCount: activeAutomationCount ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
