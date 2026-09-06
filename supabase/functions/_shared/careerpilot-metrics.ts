import type { createAdminClient } from './supabase-admin.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface CareerPilotLiveMetrics {
  jobsDiscovered: number;
  resumesTailored: number;
  pipelineRunsCompleted: number;
  aiTokensMonth: number;
  lastUpdated: string;
}

export const CAREERPILOT_METRIC_PREFIX = '[CareerPilot]';

export function formatCareerPilotMetricLines(metrics: CareerPilotLiveMetrics): string[] {
  const updated = new Date(metrics.lastUpdated).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return [
    'Live metrics (synced from production — auto-updated):',
    `- ${CAREERPILOT_METRIC_PREFIX} Jobs discovered: ${metrics.jobsDiscovered}`,
    `- ${CAREERPILOT_METRIC_PREFIX} Job-tailored resumes: ${metrics.resumesTailored}`,
    `- ${CAREERPILOT_METRIC_PREFIX} Pipeline runs completed: ${metrics.pipelineRunsCompleted}`,
    `- ${CAREERPILOT_METRIC_PREFIX} AI tokens used (month): ${metrics.aiTokensMonth.toLocaleString('en-US')}`,
    `- ${CAREERPILOT_METRIC_PREFIX} Last synced: ${updated}`,
  ];
}

export function formatCareerPilotMetricsBlock(metrics: CareerPilotLiveMetrics): string {
  return formatCareerPilotMetricLines(metrics).join('\n');
}

export async function collectCareerPilotMetrics(
  admin: AdminClient,
  userId: string,
): Promise<CareerPilotLiveMetrics> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [
    jobsRes,
    resumesRes,
    runsRes,
    tokensRes,
    profileRes,
  ] = await Promise.all([
    admin.from('jobs').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('resumes').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_corpus', false),
    admin.from('workflow_runs').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'success'),
    admin.from('ai_usage_events').select('tokens_total').eq('user_id', userId).gte('created_at', monthStart.toISOString()),
    admin.from('profiles').select('ai_credits_used').eq('user_id', userId).maybeSingle(),
  ]);

  const tokenRows = tokensRes.data || [];
  const tokensFromEvents = tokenRows.reduce((sum, row) => sum + Number(row.tokens_total ?? 0), 0);
  const aiTokensMonth = tokensFromEvents || Number(profileRes.data?.ai_credits_used ?? 0);

  return {
    jobsDiscovered: jobsRes.count ?? 0,
    resumesTailored: resumesRes.count ?? 0,
    pipelineRunsCompleted: runsRes.count ?? 0,
    aiTokensMonth,
    lastUpdated: new Date().toISOString(),
  };
}
