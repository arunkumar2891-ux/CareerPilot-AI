import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Briefcase, FileCheck, Send, FileText, Sparkles, Activity,
  TrendingUp, Target, Zap, ArrowRight, Play, Clock, CheckCircle2,
  XCircle, AlertCircle, Inbox, Bot,
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
  CartesianGrid, BarChart, Bar, RadialBarChart, RadialBar, PieChart, Pie, Cell,
} from 'recharts';
import { PageHeader } from '@/components/shared/PageHeader';
import { MetricCard } from '@/components/shared/MetricCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { services } from '@/services';
import { timeAgo } from '@/utils';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '@/store';
import type { Workflow } from '@/types';
import { EmptyState } from '@/components/shared/EmptyState';

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: metrics } = useQuery({ queryKey: ['metrics'], queryFn: () => services.analytics.metrics() });
  const { data: timeseries } = useQuery({ queryKey: ['timeseries'], queryFn: () => services.analytics.timeseries() });
  const { data: runs } = useQuery({ queryKey: ['runs'], queryFn: () => services.execution.listRuns() });
  const { data: agents } = useQuery({ queryKey: ['agents'], queryFn: () => services.agent.list() });
  const notifications = useNotificationStore((s) => s.notifications);

  const recentRuns = (runs || []).slice(0, 6);
  const activeAgents = (agents || []).filter((a) => a.enabled).slice(0, 5);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Dashboard"
        description="Your autonomous job search command center"
        actions={
          <Button onClick={() => navigate('/jobs')} className="gap-2">
            <Zap className="h-4 w-4" /> Run Job Search
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Jobs Found Today" value={metrics?.jobsFoundToday ?? 0} icon={<Briefcase className="h-5 w-5" />} trend={12} delay={0} />
        <MetricCard label="Jobs Processed" value={metrics?.jobsProcessed ?? 0} icon={<Activity className="h-5 w-5" />} trend={8} delay={0.05} accent="bg-chart-2/40" />
        <MetricCard label="Applications Ready" value={metrics?.applicationsReady ?? 0} icon={<FileCheck className="h-5 w-5" />} trend={5} delay={0.1} accent="bg-warning/40" />
        <MetricCard label="Applications Submitted" value={metrics?.applicationsSubmitted ?? 0} icon={<Send className="h-5 w-5" />} trend={15} delay={0.15} accent="bg-chart-4/40" />
        <MetricCard label="Resume Versions" value={metrics?.resumeVersions ?? 0} icon={<FileText className="h-5 w-5" />} trend={-3} delay={0.2} accent="bg-chart-5/40" />
        <MetricCard label="AI Credits Used" value={metrics?.aiCreditsUsed ?? 0} icon={<Sparkles className="h-5 w-5" />} trend={22} delay={0.25} accent="bg-primary/40" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Job Discovery & Applications</CardTitle>
            <Badge variant="secondary" className="gap-1"><TrendingUp className="h-3 w-3" />14 days</Badge>
          </CardHeader>
          <CardContent>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Execution Queue</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/executions')} className="gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentRuns.length === 0 ? (
              <EmptyState icon={Activity} title="No executions yet" description="Workflow runs will appear here once you execute them." />
            ) : recentRuns.map((run) => (
              <div key={run.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                {run.status === 'success' ? <CheckCircle2 className="h-4 w-4 text-success" />
                  : run.status === 'failed' ? <XCircle className="h-4 w-4 text-destructive" />
                  : <Play className="h-4 w-4 text-primary" />}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{(run as any).workflowName || 'Workflow'}</p>
                  <p className="text-xs text-muted-foreground">{timeAgo(run.startedAt)} · {(run.duration / 1000).toFixed(1)}s</p>
                </div>
                <StatusBadge status={run.status} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[240px] pr-3">
              <div className="space-y-3">
                {notifications.length === 0 ? (
                  <EmptyState icon={Inbox} title="No notifications" description="You're all caught up." className="py-8" />
                ) : notifications.map((n) => (
                  <div key={n.id} className="flex gap-3">
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${n.type === 'failure' ? 'bg-destructive/10 text-destructive' : n.type === 'reminder' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'}`}>
                      {n.type === 'failure' ? <AlertCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Active AI Agents</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/agents')} className="gap-1">
              Manage <ArrowRight className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeAgents.length === 0 ? (
              <EmptyState icon={Bot} title="No active agents" description="Enable AI agents from the Agents page to see them here." />
            ) : activeAgents.map((agent) => (
              <div key={agent.id} className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{agent.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{agent.model} · {agent.metrics.runs} runs</p>
                </div>
                <div className="w-20">
                  <Progress value={agent.metrics.successRate} className="h-1.5" />
                </div>
                <span className="text-xs font-medium text-success">{agent.metrics.successRate}%</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Application Funnel</CardTitle>
          </CardHeader>
          <CardContent>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'New Resume', icon: FileText, path: '/resumes' },
          { label: 'Search Jobs', icon: Briefcase, path: '/jobs' },
          { label: 'AI Copilot', icon: Sparkles, path: '/copilot' },
          { label: 'Build Workflow', icon: Activity, path: '/workflows' },
        ].map((q, i) => (
          <motion.button
            key={q.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.05 }}
            onClick={() => navigate(q.path)}
            className="glass-card flex items-center gap-3 p-4 text-left transition-colors hover:bg-accent/30"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <q.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">{q.label}</p>
              <p className="text-xs text-muted-foreground">Quick action</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
