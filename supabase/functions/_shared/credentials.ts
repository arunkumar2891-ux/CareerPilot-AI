import { createAdminClient } from './supabase-admin.ts';
import { fetchWithTimeout } from './fetch-timeout.ts';

export async function getIntegrationCredentials(
  userId: string,
  name: string,
): Promise<Record<string, string>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('integrations')
    .select('credentials')
    .eq('user_id', userId)
    .eq('name', name)
    .maybeSingle();
  return (data?.credentials as Record<string, string>) ?? {};
}

export function getSecretOrIntegration(
  secretName: string,
  integrationCreds: Record<string, string>,
  integrationKey = 'token',
): string {
  return Deno.env.get(secretName) || integrationCreds[integrationKey] || integrationCreds.apiKey || '';
}

export async function getUserSettings(userId: string): Promise<Record<string, unknown>> {
  const admin = createAdminClient();
  const { data } = await admin.from('settings').select('data').eq('user_id', userId).maybeSingle();
  return (data?.data as Record<string, unknown>) ?? {};
}

export async function refreshGoogleToken(userId: string): Promise<string> {
  const creds = await getIntegrationCredentials(userId, 'Google Drive');
  const refreshToken = creds.refresh_token;
  if (!refreshToken) throw new Error('Google OAuth not connected. Connect in Integrations.');

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID/SECRET not configured');

  const res = await fetchWithTimeout(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    },
    20000,
    'Google token refresh',
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || 'Google token refresh failed');

  const admin = createAdminClient();
  await admin.from('integrations').update({
    credentials: { ...creds, access_token: json.access_token, expiry: Date.now() + json.expires_in * 1000 },
    last_sync: new Date().toISOString(),
    status: 'connected',
  }).eq('user_id', userId).eq('name', 'Google Drive');

  return json.access_token as string;
}
