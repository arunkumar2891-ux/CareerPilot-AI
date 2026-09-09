import { jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';

function isAuthorized(req: Request): boolean {
  const secret = Deno.env.get('DEPLOY_SYNC_SECRET');
  if (!secret) return false;
  const auth = req.headers.get('Authorization');
  return auth === `Bearer ${secret}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (!isAuthorized(req)) return jsonResponse({ error: 'Unauthorized' }, 401);
  return jsonResponse({ skipped: true, reason: 'Outbound CareerPilot Google Doc sync has been removed.' });
});
