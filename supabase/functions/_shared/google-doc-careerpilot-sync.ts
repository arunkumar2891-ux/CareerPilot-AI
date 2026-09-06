import { refreshGoogleToken, getUserSettings } from './credentials.ts';
import {
  collectCareerPilotMetrics,
  formatCareerPilotMetricLines,
  type CareerPilotLiveMetrics,
} from './careerpilot-metrics.ts';
import {
  buildCareerPilotProjectSection,
  extractCareerPilotSectionFromDoc,
} from './careerpilot-project-section.ts';
import {
  batchUpdateGoogleDoc,
  buildDocumentTextMap,
  fetchGoogleDocument,
  findCareerPilotSectionRange,
  insertDocumentText,
  replaceDocumentRange,
} from './google-doc-structure.ts';
import type { createAdminClient } from './supabase-admin.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface CareerPilotDocSyncResult {
  metrics: CareerPilotLiveMetrics;
  strategy: 'index-replace' | 'metric-lines' | 'anchor-insert' | 'none';
  occurrencesChanged: number;
  sectionFound: boolean;
  sectionChars: number;
  /** @deprecated Use occurrencesChanged — kept for backward compatibility */
  replacements: number;
}

const METRIC_KEYS = [
  'Jobs discovered',
  'Job-tailored resumes',
  'Pipeline runs completed',
  'AI tokens used (month)',
  'Last synced',
] as const;

function metricLineReplacements(
  metrics: CareerPilotLiveMetrics,
  docText: string,
  storedSection: string,
): { oldText: string; newText: string }[] {
  const newLines = formatCareerPilotMetricLines(metrics);
  const newByKey = new Map<string, string>();
  for (const line of newLines) {
    for (const key of METRIC_KEYS) {
      if (line.includes(`[CareerPilot] ${key}:`)) {
        newByKey.set(key, line.replace(/^-\s*/, '').trim());
      }
    }
  }

  const sources = [docText, storedSection].filter(Boolean);
  const pairs: { oldText: string; newText: string }[] = [];

  for (const source of sources) {
    for (const rawLine of source.split('\n')) {
      const trimmed = rawLine.trim();
      const core = trimmed.replace(/^[·•*-]\s*/, '');
      if (!core.includes('[CareerPilot]')) continue;
      for (const key of METRIC_KEYS) {
        if (!core.includes(`[CareerPilot] ${key}:`)) continue;
        const newLine = newByKey.get(key);
        if (!newLine) continue;
        const candidates = [trimmed, core, `- ${core}`].filter((v, i, arr) => arr.indexOf(v) === i);
        for (const oldText of candidates) {
          if (oldText === newLine) continue;
          pairs.push({ oldText, newText: newLine });
        }
      }
    }
  }

  const seen = new Set<string>();
  return pairs.filter((pair) => {
    if (seen.has(pair.oldText)) return false;
    seen.add(pair.oldText);
    return pair.oldText !== pair.newText;
  });
}

async function replaceMetricLines(
  accessToken: string,
  fileId: string,
  metrics: CareerPilotLiveMetrics,
  docText: string,
  storedSection: string,
): Promise<number> {
  const replacements = metricLineReplacements(metrics, docText, storedSection);
  if (!replacements.length) return 0;

  const result = await batchUpdateGoogleDoc(
    accessToken,
    fileId,
    replacements.map((pair) => ({
      replaceAllText: {
        containsText: { text: pair.oldText, matchCase: true },
        replaceText: pair.newText,
      },
    })),
  );
  return result.occurrencesChanged;
}

async function findInsertIndexAfterAnchor(docTextMap: ReturnType<typeof buildDocumentTextMap>): Promise<number | null> {
  const normalized = docTextMap.text.replace(/\r\n/g, '\n');
  const anchors = [
    'Aug 2026 – Present',
    'Aug 2026 - Present',
    'URL: https://careerpilot-ai-6i93.onrender.com',
    'Technologies:',
  ];
  for (const anchor of anchors) {
    const idx = normalized.indexOf(anchor);
    if (idx < 0) continue;
    const lineEnd = normalized.indexOf('\n', idx);
    const docIndex = docTextMap.docIndexAt(lineEnd >= 0 ? lineEnd : idx + anchor.length);
    if (docIndex >= 0) return docIndex + 1;
  }
  return null;
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
  const accessToken = await refreshGoogleToken(userId);

  let strategy: CareerPilotDocSyncResult['strategy'] = 'none';
  let occurrencesChanged = 0;
  let sectionFound = false;

  const googleDoc = await fetchGoogleDocument(accessToken, fileId);
  const docTextMap = buildDocumentTextMap(googleDoc);
  const structuralText = docTextMap.text.replace(/\r\n/g, '\n');
  const sectionRange = findCareerPilotSectionRange(docTextMap);

  if (sectionRange) {
    sectionFound = true;
    const result = await replaceDocumentRange(accessToken, fileId, sectionRange, newSection);
    occurrencesChanged = result.requestCount > 0 ? 1 : 0;
    strategy = 'index-replace';
  } else if (structuralText.includes('CareerPilot AI') || structuralText.includes('[CareerPilot]')) {
    sectionFound = Boolean(extractCareerPilotSectionFromDoc(structuralText));
    occurrencesChanged = await replaceMetricLines(accessToken, fileId, metrics, structuralText, storedSection);
    if (occurrencesChanged > 0) {
      strategy = 'metric-lines';
    } else {
      const insertIndex = await findInsertIndexAfterAnchor(docTextMap);
      if (insertIndex != null) {
        const metricBlock = `\n\n${formatCareerPilotMetricLines(metrics).join('\n')}\n`;
        await insertDocumentText(accessToken, fileId, insertIndex, metricBlock);
        occurrencesChanged = 1;
        strategy = 'anchor-insert';
      }
    }
  } else {
    const picIdx = docTextMap.text.indexOf('--- Project: Pic-Reel');
    if (picIdx >= 0) {
      const insertIndex = docTextMap.docIndexAt(picIdx);
      if (insertIndex >= 0) {
        await insertDocumentText(accessToken, fileId, insertIndex, `${newSection}\n\n`);
        occurrencesChanged = 1;
        strategy = 'anchor-insert';
      }
    }
  }

  if (occurrencesChanged === 0 && strategy === 'none') {
    throw new Error(
      'Could not update Google Doc: CareerPilot AI section not found. Add a block starting with "--- Project: CareerPilot AI" to your Doc, then sync again.',
    );
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

  return {
    metrics,
    strategy,
    occurrencesChanged,
    sectionFound,
    sectionChars: newSection.length,
    replacements: occurrencesChanged,
  };
}

/** @deprecated Use syncCareerPilotProjectToGoogleDoc */
export const syncCareerPilotMetricsToGoogleDoc = syncCareerPilotProjectToGoogleDoc;
