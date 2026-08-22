import { createUserClient, jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { refreshGoogleToken } from '../_shared/credentials.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

  const supabase = createUserClient(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  try {
    const accessToken = await refreshGoogleToken(user.id);
    return jsonResponse({ access_token: accessToken });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Token failed' }, 400);
  }
});
