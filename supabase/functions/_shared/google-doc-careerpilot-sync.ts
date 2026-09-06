import { refreshGoogleToken, getUserSettings } from './credentials.ts';
import { fetchWithTimeout } from './fetch-timeout.ts';
import {
  collectCareerPilotMetrics,
  type CareerPilotLiveMetrics,
} from './careerpilot-metrics.ts';
import {
  buildCareerPilotProjectSection,
  extractCareerPilotSectionFromDoc,
} from './careerpilot-project-section.ts';
import { fetchGoogleDocText } from './google-doc-sync.ts';
import type { createAdminClient } from './supabase-admin.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface CareerPilotDocSyncResult {
  metrics: CareerPilotLiveMetrics;
  replacements: number;
  sectionChars: number;
}

async function batchReplaceInGoogleDoc(
  accessToken: string,
  fileId: string,
  replacements: { oldText: string; newText: string }[],
): Promise<number> {
  const requests = replacements
    .filter((r) => r.oldText && r.oldText !== r.newText)
    .map((r) => ({
      replaceAllText: {
        containsText: { text: r.oldText, matchCase: true },
        replaceText: r.newText,
      },
    }));

  if (!requests.length) return 0;

  const res = await fetchWithTimeout(
    `https://docs.googleapis.com/v1/documents/${fileId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    },
    30000,
    'Google Docs batchUpdate',
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = (err as { error?: { message?: string } }).error?.message || 'Google Docs update failed';
    if (/insufficient|scope|permission/i.test(message)) {
      throw new Error('Google Docs write permission required. Reconnect Google Drive in Integrations (documents scope).');
    }
    throw new Error(message);
  }

  const body = await res.json() as { replies?: unknown[] };
  return body.replies?.length ?? requests.length;
}

/** Sync full CareerPilot AI project section (features, architecture, bullets + live metrics) to Google Doc. */
export async function syncCareerPilotProjectToGoogleDoc(
  admin: AdminClient,
  userId: string,
  fileId: string,
): Promise<CareerPilotDocSyncResult> {
  const metrics = await collectCareerPilotMetrics(admin, userId);
  const newSection = buildCareerPilotProjectSection(metrics);

  const settings = await getUserSettings(userId);
  const jobSearch = (settings.jobSearch as Record<string, unknown>) || {};
  const storedSection = String(jobSearch.careerPilotProjectBlock || jobSearch.careerPilotMetricsBlock || '');
  const docText = await fetchGoogleDocText(userId, fileId);
  const docSection = extractCareerPilotSectionFromDoc(docText);
  const oldSection = docSection || storedSection;

  const accessToken = await refreshGoogleToken(userId);
  let replacements = 0;

  if (oldSection) {
    replacements = await batchReplaceInGoogleDoc(accessToken, fileId, [{
      oldText: oldSection,
      newText: newSection,
    }]);
  } else if (docText.includes('CareerPilot AI')) {
    const anchor = docText.includes('Aug 2026 – Present')
      ? 'Aug 2026 – Present'
      : 'URL: https://careerpilot-ai-6i93.onrender.com';
    const idx = docText.indexOf(anchor);
    if (idx >= 0) {
      const lineEnd = docText.indexOf('\n', idx);
      const anchorLine = docText.slice(idx, lineEnd > idx ? lineEnd : undefined).trim();
      replacements = await batchReplaceInGoogleDoc(accessToken, fileId, [{
        oldText: anchorLine,
        newText: newSection,
      }]);
    }
  } else {
    const picReelMarker = '--- Project: Pic-Reel';
    const picIdx = docText.indexOf(picReelMarker);
    if (picIdx >= 0) {
      replacements = await batchReplaceInGoogleDoc(accessToken, fileId, [{
        oldText: picReelMarker,
        newText: `${newSection}\n\n${picReelMarker}`,
      }]);
    }
  }

  const nextSettings = {
    ...settings,
    jobSearch: {
      ...jobSearch,
      careerPilotProjectBlock: newSection,
      careerPilotProjectLastSynced: metrics.lastUpdated,
      careerPilotMetricsBlock: newSection,
      careerPilotMetricsLastSynced: metrics.lastUpdated,
    },
  };
  await admin.from('settings').upsert({
    user_id: userId,
    data: nextSettings,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  return { metrics, replacements, sectionChars: newSection.length };
}

/** @deprecated Use syncCareerPilotProjectToGoogleDoc */
export const syncCareerPilotMetricsToGoogleDoc = syncCareerPilotProjectToGoogleDoc;
