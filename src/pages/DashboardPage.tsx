import { useQuery } from '@tanstack/react-query';
import { StaggerItem, StaggerList } from '@/components/motion';
import {
  Briefcase, FileCheck, Send, FileText, Sparkles, Activity,
  TrendingUp, Zap, ArrowRight, Play, Clock, CheckCircle2,
  XCircle, AlertCircle, Inbox, StopCircle,
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
  CartesianGrid, BarChart, Bar, RadialBarChart, RadialBar,
} from 'recharts';
import { PageHeader } from '@/components/shared/PageHeader';
import { MetricCard } from '@/components/shared/MetricCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { services } from '@/services';
import { timeAgo, computeRunDurationMs, formatDurationMs, formatNumber } from '@/utils';
import { PROVIDER_LABELS } from '@/constants/ai-usage';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '@/store';
import { EmptyState } from '@/components/shared/EmptyState';

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: metrics } = useQuery({ queryKey: ['metrics'], queryFn: () => services.analytics.metrics() });
  const { data: aiUsage } = useQuery({ queryKey: ['aiUsage'], queryFn: () => services.analytics.aiUsage() });
  const { data: timeseries } = useQuery({ queryKey: ['timeseries'], queryFn: () => services.analytics.timeseries() });
  const { data: runs } = useQuery({ queryKey: ['runs'], queryFn: () => services.execution.listRuns() });
  const notifications = useNotificationStore((s) => s.notifications);

  const recentRuns = (runs || []).slice(0, 6);

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <PageHeader
        title="Dashboard"
        description="Your autonomous job search command center"
        actions={
          <Button onClick={() => navigate('/jobs')} className="gap-2">
            <Zap className="h-4 w-4" /> Run Job Search
          </Button>
        }
      />

      <StaggerList className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Jobs Found Today" value={metrics?.jobsFoundToday ?? 0} icon={<Briefcase className="h-5 w-5" />} trend={12} />
        <MetricCard label="Jobs Processed" value={metrics?.jobsProcessed ?? 0} icon={<Activity className="h-5 w-5" />} trend={8} accent="bg-chart-2/40" />
        <MetricCard label="Applications Ready" value={metrics?.applicationsReady ?? 0} icon={<FileCheck className="h-5 w-5" />} trend={5} accent="bg-warning/40" />
        <MetricCard label="Applications Submitted" value={metrics?.applicationsSubmitted ?? 0} icon={<Send className="h-5 w-5" />} trend={15} accent="bg-chart-4/40" />
        <MetricCard label="Resume Versions" value={metrics?.resumeVersions ?? 0} icon={<FileText className="h-5 w-5" />} trend={-3} accent="bg-chart-5/40" />
        <MetricCard
          label="AI Tokens (month)"
          value={formatNumber(metrics?.aiTokensUsed ?? 0)}
          icon={<Sparkles className="h-5 w-5" />}
          accent="bg-primary/40"
        />
      </StaggerList>

      <Card>
        <CardHeader className="flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-base">AI Usage — {aiUsage?.monthLabel ?? 'This month'}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Token usage across resume tailoring, ATS scoring, and Copilot — no in-app limit.
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {formatNumber(aiUsage?.totalTokens ?? 0)} total tokens
          </Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(aiUsage?.providers ?? []).map((provider) => {
              const pct = Math.min(100, (provider.tokens / Math.max(1, provider.freeTierLimit)) * 100);
              return (
                <div key={provider.provider} className="min-w-0 rounded-lg border border-border p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">{PROVIDER_LABELS[provider.provider]}</p>
                    <Badge variant="outline" className="shrink-0 text-2xs">{provider.requests} requests</Badge>
                  </div>
                  <p className="text-2xl font-semibold tabular-nums">{formatNumber(provider.tokens)}</p>
                  <p className="text-xs text-muted-foreground">tokens this month</p>
                  <div className="mt-3">
                    <div className="mb-1 flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-2xs text-muted-foreground">
                      <span>vs free-tier reference (~{formatNumber(provider.freeTierLimit)}/mo)</span>
                      <span className="tabular-nums">{formatNumber(provider.remaining)} left</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-chart-2"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {(aiUsage?.recent?.length ?? 0) > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent AI calls</p>
              <div className="space-y-2">
                {aiUsage!.recent.map((event, i) => (
                  /* Two flex groups plus four text runs cannot share one 288px line. Wrap the
                     row and let each group stay intact, rather than clipping the timestamp. */
                  <div key={`${event.createdAt}-${i}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="secondary" className="shrink-0 text-2xs capitalize">{event.provider}</Badge>
                      <span className="truncate text-muted-foreground">{event.operation.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-muted-foreground">
                      <span className="tabular-nums">{formatNumber(event.tokens)} tokens</span>
                      <span>{timeAgo(event.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* See the grid note below: `grid-cols-1` pins the mobile track minimum to 0. A recharts
          ResponsiveContainer measures its parent, so an auto track that sized to content would
          let the chart's own min-content width set the row width. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Job Discovery &amp; Applications</CardTitle>
            <Badge variant="secondary" className="shrink-0 gap-1"><TrendingUp className="h-3 w-3" />14 days</Badge>
          </CardHeader>
          <CardContent className="min-w-0">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={timeseries || []}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="jobsFound" stroke="hsl(var(--chart-1))" fill="url(#g1)" strokeWidth={2} name="Jobs Found" />
                <Area type="monotone" dataKey="jobsApplied" stroke="hsl(var(--chart-2))" fill="url(#g2)" strokeWidth={2} name="Applied" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Success Rate</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <ResponsiveContainer width="100%" height={240}>
              <RadialBarChart innerRadius="60%" outerRadius="100%" data={[{ value: metrics?.successRate ?? 0, fill: 'hsl(var(--chart-2))' }]} startAngle={90} endAngle={-270}>
                <RadialBar background dataKey="value" cornerRadius={20} />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-2xl font-semibold">
                  {metrics?.successRate ?? 0}%
                </text>
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs">
              <div><p className="text-muted-foreground">Avg ATS</p><p className="font-semibold">{metrics?.avgAtsScore ?? 0}</p></div>
              <div><p className="text-muted-foreground">Interviews</p><p className="font-semibold">{metrics?.applicationsSubmitted ? Math.round(metrics.applicationsSubmitted * 0.32) : 0}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* `grid-cols-1` is load-bearing, not redundant. Bare `grid` leaves
          `grid-template-columns: none`, so items land in an *implicit* `auto` track whose
          minimum is the items' min-content width — that lets a wide card push the track past
          the viewport, and `<main>`'s `overflow-x-hidden` then clips it rather than scrolling.
          `grid-cols-1` compiles to `repeat(1, minmax(0, 1fr))`, whose minimum is 0. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          {/* `flex-row` unconditionally forces the title and "View all" onto one line.
              At 320px the title wraps and collides with the button, so stack until sm. */}
          <CardHeader className="flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <CardTitle className="text-base">Execution Queue</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/executions')} className="-ml-2 gap-1 sm:ml-0">
              View all <ArrowRight className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentRuns.length === 0 ? (
              <EmptyState icon={Activity} title="No executions yet" description="Workflow runs will appear here once you execute them." />
            ) : recentRuns.map((run) => (
              /* The status icon, name/meta block and badge do not fit on one 320px
                 line. Stack the badge under the text and let it sit with the meta. */
              <div key={run.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 items-start gap-3 sm:flex-1 sm:items-center">
                  {run.status === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success sm:mt-0" />
                    : run.status === 'failed' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive sm:mt-0" />
                    : run.status === 'cancelled' ? <StopCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning sm:mt-0" />
                    : run.status === 'running' || run.status === 'queued' ? <Play className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:mt-0" />
                    : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground sm:mt-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{run.workflowName || 'Workflow'}</p>
                    <p className="text-xs text-muted-foreground">{timeAgo(run.startedAt)} · {formatDurationMs(computeRunDurationMs(run))}</p>
                  </div>
                </div>
                <div className="shrink-0 pl-7 sm:pl-0">
                  <StatusBadge status={run.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Height must be DEFINITE. Radix's Root is `overflow-hidden` and its Viewport is
                `h-full`, so with `h-auto max-h-[...]` the 100% resolves against an auto-height
                parent and the Viewport never becomes a scroll container — the Root just clips
                and no scrollbar appears, stranding older notifications. An earlier revision of
                this file did exactly that to save dead space; do not reintroduce it. */}
            <ScrollArea className="h-[240px] pr-3">
              <div className="space-y-3">
                {notifications.length === 0 ? (
                  <EmptyState icon={Inbox} title="No notifications" description="You're all caught up." className="py-8" />
                ) : notifications.map((n) => (
                  <div key={n.id} className="flex gap-3">
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${n.type === 'failure' ? 'bg-destructive/10 text-destructive' : n.type === 'reminder' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'}`}>
                      {n.type === 'failure' ? <AlertCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium break-words">{n.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                      <p className="mt-0.5 text-2xs text-muted-foreground">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Application Funnel</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={[
                { stage: 'Found', value: metrics?.jobsProcessed ?? 0, fill: 'hsl(var(--chart-1))' },
                { stage: 'Applied', value: metrics?.applicationsSubmitted ?? 0, fill: 'hsl(var(--chart-2))' },
                { stage: 'Interview', value: metrics?.applicationsSubmitted ? Math.round(metrics.applicationsSubmitted * 0.32) : 0, fill: 'hsl(var(--chart-3))' },
                { stage: 'Offer', value: metrics?.applicationsSubmitted ? Math.round(metrics.applicationsSubmitted * 0.12) : 0, fill: 'hsl(var(--success))' },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="stage" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" stagger={0.05}>
        {[
          { label: 'New Resume', icon: FileText, path: '/resumes' },
          { label: 'Search Jobs', icon: Briefcase, path: '/jobs' },
          { label: 'AI Copilot', icon: Sparkles, path: '/copilot' },
          { label: 'Executions', icon: Activity, path: '/executions' },
        ].map((q) => (
          <StaggerItem key={q.label}>
            <button
              type="button"
              onClick={() => navigate(q.path)}
              className="glass-card flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/30 hover:shadow-glow-sm"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-glow-sm">
                <q.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{q.label}</p>
                <p className="text-xs text-muted-foreground">Quick action</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </StaggerItem>
        ))}
      </StaggerList>
    </div>
  );
}
