import type { WorkflowNodeType } from '../types';

export interface SeedNode {
  type: WorkflowNodeType;
  name: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
}

/** Built-in job search pipeline — auto-provisioned for every user on login via BootstrapService */
export const DEFAULT_JOB_SEARCH_WORKFLOW = {
  name: 'Daily Job Search Pipeline',
  description: 'Apify LinkedIn scrape → Gemini ATS optimize → LaTeX PDF → Resume Studio (Drive sync is manual)',
  schedule: '0 7 * * *',
  nodes: [
    { type: 'schedule', name: 'Daily 7 AM', x: 0, y: 200, config: { cron: '0 7 * * *' } },
    { type: 'gdocs', name: 'Sync Google Doc Resume', x: 200, y: 200, config: { fileId: '{{settings.jobSearch.resumeFileId}}' } },
    { type: 'transform', name: 'Build LinkedIn URL', x: 400, y: 200, config: { action: 'build_linkedin_url' } },
    { type: 'apify', name: 'Start Apify Scrape', x: 600, y: 200, config: { action: 'start_run', actorId: 'curious_coder~linkedin-jobs-scraper', count: 10, limitPerSource: 10 } },
    { type: 'apify', name: 'Check Apify Status', x: 800, y: 200, config: { action: 'check_status' } },
    { type: 'wait', name: 'Wait 10s', x: 800, y: 400, config: { seconds: 10 } },
    { type: 'apify', name: 'Fetch Results', x: 1000, y: 200, config: { action: 'fetch_dataset' } },
    { type: 'function', name: 'Parse Jobs', x: 1200, y: 200, config: { builtin: 'parse_apify_jobs' } },
    { type: 'transform', name: 'Limit Jobs', x: 1400, y: 200, config: { action: 'limit', max: 10 } },
    { type: 'duplicate_checker', name: 'Filter Duplicates', x: 1600, y: 200, config: {} },
    { type: 'supabase', name: 'Store Job', x: 1800, y: 200, config: { action: 'insert_job' } },
    { type: 'gemini', name: 'ATS Optimizer', x: 2000, y: 200, config: {} },
    { type: 'function', name: 'Build LaTeX', x: 2200, y: 200, config: { builtin: 'build_latex' } },
    { type: 'pdf', name: 'Compile PDF', x: 2400, y: 200, config: {} },
    { type: 'storage', name: 'Upload to Storage', x: 2600, y: 200, config: {} },
    { type: 'function', name: 'Email Summary', x: 2800, y: 200, config: { builtin: 'email_summary' } },
    { type: 'email', name: 'Send Email', x: 3000, y: 200, config: {} },
  ] as SeedNode[],
};

/** Edge definitions as source/target node indices */
export function buildSeedEdges(_nodeIds: string[]): { source: number; target: number; label?: string }[] {
  return [
    { source: 0, target: 1 },
    { source: 1, target: 2 },
    { source: 2, target: 3 },
    { source: 3, target: 4 },
    { source: 4, target: 5, label: 'false' },
    { source: 5, target: 4 },
    { source: 4, target: 6, label: 'true' },
    { source: 6, target: 7 },
    { source: 7, target: 8 },
    { source: 8, target: 9 },
    { source: 9, target: 10 },
    { source: 10, target: 11 },
    { source: 11, target: 12 },
    { source: 12, target: 13 },
    { source: 13, target: 14 },
    { source: 14, target: 15 },
    { source: 15, target: 16 },
  ];
}
