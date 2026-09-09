import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InlineLoader } from '@/components/motion';
import { services } from '@/services';

export function RoleBanksStatusBanner() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => services.settings.get(),
    refetchInterval: (query) => {
      const jobSearch = query.state.data?.jobSearch as Record<string, unknown> | undefined;
      return jobSearch?.roleBanksStatus === 'generating' ? 4000 : false;
    },
  });
  const jobSearch = settings?.jobSearch as Record<string, unknown> | undefined;
  const status = String(jobSearch?.roleBanksStatus ?? '');
  const generatedAt = String(jobSearch?.roleBanksGeneratedAt ?? '');
  const error = String(jobSearch?.roleBanksError ?? '');
  const previousStatus = useRef(status);

  useEffect(() => {
    if (previousStatus.current === 'generating' && (status === 'ready' || status === 'error')) {
      qc.invalidateQueries({ queryKey: ['resumes'] });
    }
    previousStatus.current = status;
  }, [status, qc]);

  if (status === 'generating') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <InlineLoader />
        <span className="status-label normal-case tracking-wide">Role banks: generating from Master ATS…</span>
      </p>
    );
  }
  if (status === 'error') {
    return (
      <p className="text-sm text-destructive" role="status">
        Role banks: generation failed{error ? ` — ${error}` : ''}
      </p>
    );
  }
  if (status === 'ready' && generatedAt) {
    const when = new Date(generatedAt);
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Role banks: updated{Number.isNaN(when.getTime()) ? '' : ` ${when.toLocaleString()}`}
      </p>
    );
  }
  return null;
}
