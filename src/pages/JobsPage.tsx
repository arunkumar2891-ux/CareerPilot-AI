import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Briefcase, MapPin, DollarSign, Star, Filter, Search, LayoutGrid,
  Table as TableIcon, Zap, RefreshCw, ExternalLink, Copy, FileText, SearchX, Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { services } from '@/services';
import { JOB_BOARDS, EXPERIENCE_LEVELS } from '@/constants';
import { formatCurrency, formatDate, timeAgo } from '@/utils';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import type { Job } from '@/types';

export function JobsPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [filters, setFilters] = useState({
    keywords: '',
    location: '',
    remote: false,
    hybrid: false,
    experience: '',
    salaryMin: '',
    companies: '',
    jobBoards: [] as string[],
    maxJobs: '30',
  });

  const { data: jobs, isLoading, error: jobsError } = useQuery({ queryKey: ['jobs'], queryFn: () => services.jobSearch.list() });

  const filtered = (jobs || []).filter((j) => {
    if (search && !j.role.toLowerCase().includes(search.toLowerCase()) && !j.company.toLowerCase().includes(search.toLowerCase())) return false;
    if (filters.remote && !j.remote) return false;
    if (filters.hybrid && !j.hybrid) return false;
    if (filters.experience && j.experience !== filters.experience) return false;
    if (filters.salaryMin && (j.salaryMin || 0) < parseInt(filters.salaryMin)) return false;
    return true;
  });

  const runSearch = async () => {
    try {
      toast.success('Starting job search pipeline...');
      const wf = await services.workflow.ensureDefaultPipeline();
      await services.execution.runWorkflow(wf.id);
      await qc.invalidateQueries({ queryKey: ['jobs', 'runs', 'workflows'] });
      toast.success('Job search pipeline started — check Executions for progress');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Pipeline failed to start');
    }
  };

  const clearAllJobs = async () => {
    setClearing(true);
    try {
      const count = await services.jobSearch.deleteAll();
      await qc.invalidateQueries({ queryKey: ['jobs', 'applications', 'metrics'] });
      toast.success(`Deleted ${count} job${count === 1 ? '' : 's'} from Supabase`);
      setShowClearConfirm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete jobs');
    } finally {
      setClearing(false);
    }
  };

  const columns = [
    { key: 'discovered', label: 'Discovered', status: 'discovered' },
    { key: 'queued', label: 'Queued', status: 'queued' },
    { key: 'resume_ready', label: 'Resume Ready', status: 'resume_ready' },
    { key: 'applied', label: 'Applied', status: 'applied' },
    { key: 'interview', label: 'Interview', status: 'interview' },
    { key: 'offer', label: 'Offer', status: 'offer' },
  ] as const;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Job Discovery"
        description="Autonomous job search across multiple boards"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowClearConfirm(true)} className="gap-2" disabled={!jobs?.length}>
              <Trash2 className="h-4 w-4" /> Clear All Jobs
            </Button>
            <Button onClick={runSearch} className="gap-2">
              <Zap className="h-4 w-4" /> Run Search
            </Button>
          </div>
        }
      />

      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all jobs?</DialogTitle>
            <DialogDescription>
              This removes every job from the app and Supabase for your account, including linked applications. Tailored resumes are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearConfirm(false)} disabled={clearing}>Cancel</Button>
            <Button variant="destructive" onClick={clearAllJobs} disabled={clearing} className="gap-2">
              {clearing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete all jobs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {jobsError && (
        <Card className="border-destructive/50">
          <CardContent className="py-3 text-sm text-destructive">
            Could not load jobs: {jobsError instanceof Error ? jobsError.message : 'Unknown error'}
          </CardContent>
        </Card>
      )}

      {!isLoading && jobs && jobs.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Showing {filtered.length} of {jobs.length} jobs
          {filtered.length < jobs.length && (
            <Button variant="link" className="h-auto p-0 pl-1 text-sm" onClick={() => setFilters({ ...filters, remote: false, hybrid: false })}>
              Clear filters
            </Button>
          )}
        </p>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search jobs by role or company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2">
              <Filter className="h-4 w-4" /> Filters
              {(filters.remote || filters.hybrid) && (
                <Badge variant="secondary" className="ml-1">Active</Badge>
              )}
            </Button>
            <Tabs value={view} onValueChange={(v) => setView(v as 'kanban' | 'table')}>
              <TabsList>
                <TabsTrigger value="kanban" className="gap-1.5"><LayoutGrid className="h-3.5 w-3.5" />Kanban</TabsTrigger>
                <TabsTrigger value="table" className="gap-1.5"><TableIcon className="h-3.5 w-3.5" />Table</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {showFilters && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Keywords</Label>
                <Input placeholder="React, Senior, Frontend" value={filters.keywords} onChange={(e) => setFilters({ ...filters, keywords: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input placeholder="San Francisco, Remote" value={filters.location} onChange={(e) => setFilters({ ...filters, location: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Experience</Label>
                <Select value={filters.experience} onValueChange={(v) => setFilters({ ...filters, experience: v })}>
                  <SelectTrigger><SelectValue placeholder="Any level" /></SelectTrigger>
                  <SelectContent>{EXPERIENCE_LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Min Salary</Label>
                <Input type="number" placeholder="120000" value={filters.salaryMin} onChange={(e) => setFilters({ ...filters, salaryMin: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Companies</Label>
                <Input placeholder="Stripe, Linear" value={filters.companies} onChange={(e) => setFilters({ ...filters, companies: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Max Jobs</Label>
                <Input type="number" value={filters.maxJobs} onChange={(e) => setFilters({ ...filters, maxJobs: e.target.value })} />
              </div>
              <div className="flex items-center gap-4 pt-6">
                <div className="flex items-center gap-2"><Switch checked={filters.remote} onCheckedChange={(c) => setFilters({ ...filters, remote: c })} /><Label className="text-xs">Remote only</Label></div>
                <div className="flex items-center gap-2"><Switch checked={filters.hybrid} onCheckedChange={(c) => setFilters({ ...filters, hybrid: c })} /><Label className="text-xs">Hybrid only</Label></div>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {view === 'kanban' ? (
        filtered.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={SearchX}
                title={jobs?.length ? 'No jobs match your filters' : 'No jobs found'}
                description={
                  jobs?.length
                    ? 'Turn off Remote/Hybrid filters or clear filters to see all jobs.'
                    : 'Run a search to discover jobs, or check that jobs in Supabase belong to your signed-in user.'
                }
                action={<Button onClick={runSearch} className="gap-2"><Zap className="h-4 w-4" /> Run Search</Button>}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
            {columns.map((col) => {
              const colJobs = filtered.filter((j) => j.status === col.status);
              return (
                <div key={col.key} className="w-72 shrink-0">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{col.label}</span>
                    <Badge variant="secondary">{colJobs.length}</Badge>
                  </div>
                  <ScrollArea className="h-[calc(100vh-340px)]">
                    <div className="space-y-2 pr-2">
                      {colJobs.map((job) => (
                        <JobCard key={job.id} job={job} onClick={() => setSelectedJob(job)} />
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <Card>
          {filtered.length === 0 ? (
            <CardContent>
              <EmptyState icon={SearchX} title="No jobs found" description="Run a search or adjust your filters to discover jobs." />
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((job) => (
                  <TableRow key={job.id} className="cursor-pointer" onClick={() => setSelectedJob(job)}>
                    <TableCell className="font-medium">{job.company}</TableCell>
                    <TableCell>{job.role}</TableCell>
                    <TableCell>
                      <span className={`font-semibold ${job.matchScore >= 85 ? 'text-success' : job.matchScore >= 70 ? 'text-warning' : 'text-muted-foreground'}`}>
                        {job.matchScore}%
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{job.salaryMin ? `${formatCurrency(job.salaryMin)}+` : '—'}</TableCell>
                    <TableCell className="text-xs">{job.location}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{job.source}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{timeAgo(job.postingDate)}</TableCell>
                    <TableCell><StatusBadge status={job.status} /></TableCell>
                    <TableCell><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <JobDetailDialog job={selectedJob} onClose={() => setSelectedJob(null)} />
    </div>
  );
}

function JobCard({ job, onClick }: { job: Job; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="glass-card cursor-pointer p-3 transition-colors hover:bg-accent/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{job.role}</p>
          <p className="truncate text-xs text-muted-foreground">{job.company}</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
          {job.matchScore}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {job.skills.slice(0, 3).map((s) => (
          <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location.split(',')[0]}</span>
        <span>{job.salaryMin ? formatCurrency(job.salaryMin) : ''}</span>
      </div>
      {job.duplicate && <Badge variant="destructive" className="mt-2 text-[10px]"><Copy className="mr-1 h-2.5 w-2.5" />Duplicate</Badge>}
    </motion.div>
  );
}

function JobDetailDialog({ job, onClose }: { job: Job | null; onClose: () => void }) {
  const qc = useQueryClient();
  if (!job) return null;

  const generateResume = async () => {
    toast.success('Generating tailored resume from Master ATS corpus...');
    await services.resume.generateTailored(job.id);
    toast.success('Resume generated — check Resume Studio');
    await qc.invalidateQueries({ queryKey: ['resumes'] });
    onClose();
  };

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl">{job.role}</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">{job.company} · {job.location}</p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-xl font-bold text-primary">
              {job.matchScore}
            </div>
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1"><MapPin className="h-3 w-3" />{job.location}</Badge>
              {job.remote && <Badge variant="secondary">Remote</Badge>}
              {job.hybrid && <Badge variant="secondary">Hybrid</Badge>}
              {job.salaryMin && <Badge variant="secondary" className="gap-1"><DollarSign className="h-3 w-3" />{formatCurrency(job.salaryMin)} - {formatCurrency(job.salaryMax || 0)}</Badge>}
              <Badge variant="secondary">{job.source}</Badge>
              {job.duplicate && <Badge variant="destructive">Duplicate</Badge>}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {job.skills.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{job.description}</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Posted: {formatDate(job.postingDate)}</span>
              <span>Experience: {job.experience || 'Any'}</span>
            </div>
          </div>
        </ScrollArea>
        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Button onClick={generateResume} className="gap-2"><FileText className="h-4 w-4" /> Generate Resume</Button>
          <Button variant="outline" className="gap-2"><Star className="h-4 w-4" /> Save</Button>
          <Button variant="ghost" className="ml-auto gap-2" onClick={() => window.open(job.url, '_blank')}>
            View Posting <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
