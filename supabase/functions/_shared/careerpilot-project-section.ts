import {
  formatCareerPilotMetricLines,
  type CareerPilotLiveMetrics,
} from './careerpilot-metrics.ts';
import { CAREERPILOT_PROJECT_SECTION_TEMPLATE } from './career-corpus/careerpilot-section.generated.ts';

export const CAREERPILOT_PROJECT_MARKER = '--- Project: CareerPilot AI';

const METRIC_LINE_RE = /^\s*(?:[-·•*]|\d+\.)?\s*\[CareerPilot\]\s+.+/;
const METRICS_HEADER_RE = /^Live metrics \(synced from production/i;

/** Canonical CareerPilot project block from repo corpus (features, architecture, bullets). */
export function getCareerPilotProjectTemplate(): string {
  return CAREERPILOT_PROJECT_SECTION_TEMPLATE;
}

export function injectLiveMetrics(section: string, metrics: CareerPilotLiveMetrics): string {
  const metricLines = formatCareerPilotMetricLines(metrics);
  const lines = section.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (METRICS_HEADER_RE.test(trimmed)) {
      out.push(...metricLines);
      i += 1;
      while (i < lines.length && (METRIC_LINE_RE.test(lines[i].trim()) || lines[i].trim() === '')) {
        i += 1;
      }
      continue;
    }
    out.push(lines[i]);
    i += 1;
  }

  if (out.some((line) => METRICS_HEADER_RE.test(line.trim()))) {
    return out.join('\n').trim();
  }

  const techLineIdx = out.findIndex((line) => line.startsWith('Technologies:'));
  if (techLineIdx >= 0) {
    out.splice(techLineIdx + 1, 0, '', ...metricLines);
    return out.join('\n').trim();
  }

  return `${out.join('\n').trim()}\n\n${metricLines.join('\n')}`.trim();
}

export function buildCareerPilotProjectSection(metrics: CareerPilotLiveMetrics): string {
  return injectLiveMetrics(getCareerPilotProjectTemplate(), metrics);
}

/** Extract CareerPilot project block from exported Google Doc / master resume text. */
export function extractCareerPilotSectionFromDoc(docText: string): string | null {
  const lines = docText.split('\n');
  const needleLower = 'careerpilot ai';
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const normalized = line.replace(/\\/g, '').trim();
    if (!normalized.startsWith('--- Project:') && !normalized.includes('Project: CareerPilot AI')) continue;
    if (normalized.toLowerCase().includes(needleLower)) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const normalized = lines[i].replace(/\\/g, '').trim();
    if (normalized.startsWith('--- Project:') || normalized.match(/^={10,}/)) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}
