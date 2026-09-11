import { useMemo, useState } from 'react';
import { Copy, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { getRunLogsSql, getRunObservabilitySql } from '@/utils/run-id';
import type { ExecutionLog } from '@/types';

function formatLogLine(log: ExecutionLog): string {
  const time = log.timestamp ? new Date(log.timestamp).toISOString() : '';
  const job = log.jobIndex != null ? ` job=${log.jobIndex}` : '';
  const attempt = log.attempt != null ? ` attempt=${log.attempt}` : '';
  return `${time} [${log.level}]${job}${attempt} ${log.message}`;
}

interface ExecutionRunLogsProps {
  runId: string;
  logs: ExecutionLog[];
}

export function ExecutionRunLogs({ runId, logs }: ExecutionRunLogsProps) {
  const [level, setLevel] = useState<'all' | 'error' | 'warn'>('all');
  const visible = useMemo(() => {
    if (level === 'all') return logs;
    return logs.filter((log) => log.level === level);
  }, [logs, level]);

  const copyLogs = async () => {
    const text = visible.map(formatLogLine).join('\n');
    await navigator.clipboard.writeText(text || '(no logs)');
    toast.success(`Copied ${visible.length} log line${visible.length === 1 ? '' : 's'}`);
  };

  const copySql = async (sql: string, label: string) => {
    await navigator.clipboard.writeText(sql);
    toast.success(`Copied ${label}`);
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="h-4 w-4" />
              All logs
            </CardTitle>
            <p className="text-xs text-muted-foreground font-mono break-all">{runId}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={copyLogs}>
              <Copy className="h-3.5 w-3.5" /> Copy logs
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => copySql(getRunLogsSql(runId), 'get_run_logs SQL')}
            >
              <Copy className="h-3.5 w-3.5" /> SQL
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copySql(getRunObservabilitySql(runId), 'observability SQL')}
            >
              Dump SQL
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {([
            ['all', 'All'],
            ['error', 'Errors'],
            ['warn', 'Warnings'],
          ] as const).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={level === value ? 'secondary' : 'ghost'}
              onClick={() => setLevel(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[min(28rem,60vh)] rounded-lg border border-border bg-muted/30 p-3">
          <div className="font-mono text-xs space-y-1">
            {visible.length === 0 ? (
              <p className="text-muted-foreground">No logs for this run.</p>
            ) : visible.map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">
                  {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                </span>
                {log.jobIndex != null && (
                  <span className="text-muted-foreground shrink-0">j{log.jobIndex}</span>
                )}
                <span
                  className={
                    log.level === 'error'
                      ? 'text-destructive'
                      : log.level === 'warn'
                        ? 'text-warning'
                        : 'break-words'
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
        <p className="mt-3 text-xs text-muted-foreground">
          In the Supabase SQL editor, paste the copied SQL and run it with this run id.
        </p>
      </CardContent>
    </Card>
  );
}
