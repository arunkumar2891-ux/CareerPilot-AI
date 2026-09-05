import { createAdminClient, jsonResponse } from '../_shared/supabase-admin.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';

  if (oauthError) {
    const detail = url.searchParams.get('error_description') || oauthError;
    return Response.redirect(`${appUrl}/?error=${encodeURIComponent(detail)}`);
  }

  if (!code || !state) {
    return Response.redirect(`${appUrl}/?error=${encodeURIComponent('oauth_failed')}`);
  }

  try {
    const { userId } = JSON.parse(atob(state));
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
    const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI') || `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-oauth-callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokens.error_description || 'Token exchange failed');

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from('integrations')
      .select('id, credentials')
      .eq('user_id', userId)
      .eq('name', 'Google Drive')
      .maybeSingle();

    const previous = (existing?.credentials as Record<string, string> | undefined) ?? {};
    const creds = {
      refresh_token: tokens.refresh_token || previous.refresh_token,
      access_token: tokens.access_token,
      expiry: Date.now() + tokens.expires_in * 1000,
    };

    if (!creds.refresh_token) {
      throw new Error('Google did not return a refresh token. Remove CareerPilot access at myaccount.google.com/permissions and reconnect.');
    }

    if (existing) {
      await admin.from('integrations').update({
        credentials: creds,
        status: 'connected',
        last_sync: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await admin.from('integrations').insert({
        user_id: userId,
        name: 'Google Drive',
        category: 'Storage',
        description: 'Google Drive and Docs access',
        icon: 'Chrome',
        status: 'connected',
        credentials: creds,
      });
    }

    return Response.redirect(`${appUrl}/?connected=google`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'oauth_failed';
    return Response.redirect(`${appUrl}/?error=${encodeURIComponent(message)}`);
  }
});
