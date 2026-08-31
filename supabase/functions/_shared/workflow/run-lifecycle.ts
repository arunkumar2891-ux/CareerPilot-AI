import { createAdminClient } from '../supabase-admin.ts';

export class RunCancelledError extends Error {
  constructor() {
    super('Execution cancelled by user');
    this.name = 'RunCancelledError';
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

export async function isRunCancelled(admin: AdminClient, runId: string): Promise<boolean> {
  const { data } = await admin.from('workflow_runs').select('status').eq('id', runId).single();
  return data?.status === 'cancelled';
}

export async function assertRunActive(admin: AdminClient, runId: string): Promise<void> {
  if (await isRunCancelled(admin, runId)) throw new RunCancelledError();
}
