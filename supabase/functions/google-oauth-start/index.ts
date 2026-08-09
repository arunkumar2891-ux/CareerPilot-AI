import { createUserClient, jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI') || `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-oauth-callback`;

  if (!clientId) return jsonResponse({ error: 'GOOGLE_CLIENT_ID not configured' }, 500);

  const url = new URL(req.url);
  const userId = url.searchParams.get('user_id');
  const authHeader = req.headers.get('Authorization');

  if (!userId && authHeader) {
    const supabase = createUserClient(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const state = btoa(JSON.stringify({ userId: user.id }));
      const scopes = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/documents.readonly',
      ].join(' ');
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes,
        access_type: 'offline',
        prompt: 'consent',
        state,
      })}`;
      return jsonResponse({ url: authUrl });
    }
  }

  return jsonResponse({ error: 'Unauthorized' }, 401);
});
