import { useQuery } from '@tanstack/react-query';
import {
  Briefcase, Target, TrendingUp, FileCheck, Send,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { PageHeader } from '@/components/shared/PageHeader';
import { MetricCard } from '@/components/shared/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { services } from '@/services';

export function AnalyticsPage() {
  const { data: metrics } = useQuery({ queryKey: ['metrics'], queryFn: () => services.analytics.metrics() });
  const { data: timeseries } = useQuery({ queryKey: ['timeseries'], queryFn: () => services.analytics.timeseries() });
  const { data: summary } = useQuery({ queryKey: ['analytics-summary'], queryFn: () => services.analytics.summary() });

  const funnelData = [
    { stage: 'Discovered', value: metrics?.jobsProcessed ?? 0, fill: 'hsl(var(--chart-1))' },
    { stage: 'Resume Ready', value: metrics?.applicationsReady ?? 0, fill: 'hsl(var(--chart-2))' },
    { stage: 'Applied', value: metrics?.applicationsSubmitted ?? 0, fill: 'hsl(var(--chart-3))' },
    { stage: 'Interview', value: metrics?.applicationsSubmitted ? Math.round(metrics.applicationsSubmitted * 0.32) : 0, fill: 'hsl(var(--chart-4))' },
    { stage: 'Offer', value: metrics?.applicationsSubmitted ? Math.round(metrics.applicationsSubmitted * 0.12) : 0, fill: 'hsl(var(--success))' },
  ];

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <PageHeader title="Analytics" description="Track your job search progress and pipeline performance" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Jobs Found" value={metrics?.jobsProcessed ?? 0} icon={<Briefcase className="h-5 w-5" />} accent="bg-primary/40" />
        <MetricCard label="Resumes Generated" value={metrics?.applicationsReady ?? 0} icon={<FileCheck className="h-5 w-5" />} delay={0.05} accent="bg-chart-2/40" />
        <MetricCard label="Applications Sent" value={metrics?.applicationsSubmitted ?? 0} icon={<Send className="h-5 w-5" />} delay={0.1} accent="bg-chart-3/40" />
        <MetricCard label="Success Rate" value={`${metrics?.successRate ?? 0}%`} icon={<Target className="h-5 w-5" />} delay={0.15} accent="bg-success/40" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" /> Jobs Found (14-Day Trend)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={timeseries || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="jobsFound" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} name="Jobs Found" />
                <Area type="monotone" dataKey="jobsApplied" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.1} strokeWidth={2} name="Applied" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Application Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={funnelData}>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="text-2xl font-bold">{summary?.jobsFound ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Jobs Discovered</p>
            </div>
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="text-2xl font-bold">{summary?.jobsApplied ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Applications</p>
            </div>
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="text-2xl font-bold">{summary?.offerRate ?? 0}%</p>
              <p className="text-xs text-muted-foreground mt-1">Offer Rate</p>
            </div>
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="text-2xl font-bold">{metrics?.resumeVersions ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Resume Versions</p>
            </div>
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="text-2xl font-bold">{metrics?.jobsFoundToday ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Found Today</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
