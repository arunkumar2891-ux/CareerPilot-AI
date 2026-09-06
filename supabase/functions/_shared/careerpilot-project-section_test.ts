import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildCareerPilotProjectSection,
  extractCareerPilotSectionFromDoc,
  injectLiveMetrics,
} from './careerpilot-project-section.ts';

Deno.test('extractCareerPilotSectionFromDoc finds project block', () => {
  const doc = `--- Project: Pic-Reel ---\nfoo\n\n--- Project: CareerPilot AI — Autonomous Job Search Platform (Personal - GenAI-Native) ---\nRole: GenAI Developer\n\n--- Project: Cric-Scorer ---\nbar`;
  const block = extractCareerPilotSectionFromDoc(doc);
  assertEquals(block?.startsWith('--- Project: CareerPilot AI'), true);
  assertEquals(block?.includes('Role: GenAI Developer'), true);
  assertEquals(block?.includes('Cric-Scorer'), false);
});

Deno.test('injectLiveMetrics replaces placeholder metrics', () => {
  const section = `--- Project: CareerPilot AI ---\nTechnologies: React\n\nLive metrics (synced from production — auto-updated):\n- [CareerPilot] Jobs discovered: 0\n\n- Built pipeline`;
  const updated = injectLiveMetrics(section, {
    jobsDiscovered: 12,
    resumesTailored: 3,
    pipelineRunsCompleted: 5,
    aiTokensMonth: 9000,
    lastUpdated: '2026-08-06T10:00:00.000Z',
  });
  assertEquals(updated.includes('Jobs discovered: 12'), true);
  assertEquals(updated.includes('Jobs discovered: 0'), false);
  assertEquals(updated.includes('- Built pipeline'), true);
});

Deno.test('buildCareerPilotProjectSection includes template bullets', () => {
  const section = buildCareerPilotProjectSection({
    jobsDiscovered: 1,
    resumesTailored: 1,
    pipelineRunsCompleted: 1,
    aiTokensMonth: 100,
    lastUpdated: '2026-08-06T10:00:00.000Z',
  });
  assertEquals(section.includes('--- Project: CareerPilot AI'), true);
  assertEquals(section.includes('Technical Highlights:'), true);
  assertEquals(section.includes('[CareerPilot] Jobs discovered: 1'), true);
});
