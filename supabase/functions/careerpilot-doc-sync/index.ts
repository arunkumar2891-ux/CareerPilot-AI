import { createAdminClient, jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { syncCareerPilotProjectToGoogleDoc } from '../_shared/google-doc-careerpilot-sync.ts';

function isAuthorized(req: Request): boolean {
  const secret = Deno.env.get('DEPLOY_SYNC_SECRET');
  if (!secret) return false;
  const auth = req.headers.get('Authorization');
  return auth === `Bearer ${secret}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  if (!isAuthorized(req)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const admin = createAdminClient();
    const { data: rows, error } = await admin.from('settings').select('user_id, data');
    if (error) throw error;

    const results: Array<{
      userId: string;
      ok: boolean;
      replacements?: number;
      sectionChars?: number;
      error?: string;
    }> = [];

    for (const row of rows || []) {
      const jobSearch = (row.data as Record<string, unknown> | null)?.jobSearch as Record<string, unknown> | undefined;
      const fileId = String(jobSearch?.resumeFileId || '').trim();
      if (!fileId) continue;

      try {
        const sync = await syncCareerPilotProjectToGoogleDoc(admin, row.user_id, fileId);
        results.push({
          userId: row.user_id,
          ok: true,
          replacements: sync.replacements,
          sectionChars: sync.sectionChars,
        });
      } catch (err) {
        results.push({
          userId: row.user_id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const synced = results.filter((r) => r.ok).length;
    return jsonResponse({ synced, attempted: results.length, results });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
