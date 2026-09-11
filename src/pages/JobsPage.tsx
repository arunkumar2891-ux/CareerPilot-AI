import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  MapPin, DollarSign, Filter, Search, LayoutGrid,
  Table as TableIcon, Zap, ExternalLink, Copy, FileText, SearchX, Trash2, Cloud, Link2, Gauge, Plus, Target, MessageSquare,
} from 'lucide-react';
import { InlineLoader, SkeletonCard, StaggerItem } from '@/components/motion';
import { transitionFast } from '@/lib/motion';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { services } from '@/services';
import { EXPERIENCE_LEVELS } from '@/constants';
import { formatCurrency, formatDate, timeAgo } from '@/utils';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { ApplicationPackageWizard } from '@/components/jobs/ApplicationPackageWizard';
import { JdMatchPanel } from '@/components/resumes/JdMatchPanel';
import { hasUsableMasterResume } from '@/utils/resume-classification';
import type { Job } from '@/types';

export function JobsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPasteJd, setShowPasteJd] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [bulkTailoring, setBulkTailoring] = useState(false);
  const [bulkScoring, setBulkScoring] = useState(false);
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
  const { data: corpusResumes } = useQuery({
    queryKey: ['resumes', 'corpus'],
    queryFn: () => services.resume.list({ kind: 'corpus' }),
  });
  const hasMaster = hasUsableMasterResume(corpusResumes || []);

  const filtered = (jobs || []).filter((j) => {
    if (search && !j.role.toLowerCase().includes(search.toLowerCase()) && !j.company.toLowerCase().includes(search.toLowerCase())) return false;
    if (filters.remote && !j.remote) return false;
    if (filters.hybrid && !j.hybrid) return false;
    if (filters.experience && j.experience !== filters.experience) return false;
    if (filters.salaryMin && (j.salaryMin || 0) < parseInt(filters.salaryMin)) return false;
    return true;
  });

  const runSearch = async () => {
    if (!hasMaster) {
      toast.error('Add a master resume on the Corpus page before running job search');
      navigate('/corpus');
      return;
    }
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
    { key: 'rejected', label: 'Rejected', status: 'rejected' },
    { key: 'withdrawn', label: 'Withdrawn', status: 'withdrawn' },
  ] as const;
  const knownStatuses = new Set(columns.map((col) => col.status));
  const kanbanJobs = filtered.filter((job) => knownStatuses.has(job.status));
  const unfiledJobs = filtered.filter((job) => !knownStatuses.has(job.status));
  const kanbanVisibleCount = kanbanJobs.length + unfiledJobs.length;

  const toggleSelected = (id: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedJobIds(new Set(filtered.map((job) => job.id)));
  };

  const bulkGenerateResumes = async () => {
    const ids = Array.from(selectedJobIds);
    if (ids.length === 0 || bulkTailoring) return;
    if (!hasMaster) {
      toast.error('Add a master resume on the Corpus page before generating tailored resumes');
      navigate('/corpus');
      return;
    }
    setBulkTailoring(true);
    try {
      toast.success(`Starting resume tailoring for ${ids.length} job${ids.length === 1 ? '' : 's'}...`);
      const { runId } = await services.resume.startResumeTailoring(ids);
      toast.success('Resume tailoring started — check Executions for progress');
      setSelectedJobIds(new Set());
      navigate(`/executions/${runId}`);
      await qc.invalidateQueries({ queryKey: ['runs'] });
      await qc.invalidateQueries({ queryKey: ['jobs'] });
      await qc.invalidateQueries({ queryKey: ['resumes'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resume generation failed');
    } finally {
      setBulkTailoring(false);
    }
  };

  const bulkScoreMatch = async () => {
    const ids = Array.from(selectedJobIds);
    if (ids.length === 0 || bulkScoring || bulkTailoring) return;
    setBulkScoring(true);
    try {
      toast.success(`Scoring ${ids.length} job${ids.length === 1 ? '' : 's'}…`);
      const { results, errors } = await services.jobSearch.scoreMatchMany(ids);
      await qc.invalidateQueries({ queryKey: ['jobs'] });
      const failed = errors?.length ?? 0;
      if (failed && results.length) {
        toast.success(`Scored ${results.length} job${results.length === 1 ? '' : 's'}`, {
          description: `${failed} could not be scored`,
        });
      } else if (failed && !results.length) {
        toast.error(errors?.[0]?.error || 'Match scoring failed');
      } else {
        toast.success(`Scored ${results.length} job${results.length === 1 ? '' : 's'}`);
      }
      setSelectedJobIds(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Match scoring failed');
    } finally {
      setBulkScoring(false);
    }
  };

  const repairSync = async () => {
    setRepairing(true);
    try {
      const result = await services.resume.repairSync();
      await qc.invalidateQueries({ queryKey: ['jobs', 'resumes', 'integrations'] });
      toast.success('Sync repair complete', {
        description: `Linked ${result.resumesLinkedToJobs + result.jobsLinkedToResumes} resume-job pairs, matched ${result.driveFilesMatched} Drive files. ${result.jobsWithoutResume} jobs still need resumes.${result.driveError ? ` Drive: ${result.driveError}` : ''}`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync repair failed');
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <PageHeader
        title="Job Discovery"
        description="Autonomous job search across multiple boards"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowPasteJd(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add Job
            </Button>
            <Button variant="outline" onClick={repairSync} disabled={repairing} className="gap-2">
              <Link2 className="h-4 w-4" />
              {repairing ? 'Repairing…' : 'Repair Sync'}
            </Button>
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
              {clearing ? <InlineLoader /> : <Trash2 className="h-4 w-4" />}
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

      {isLoading ? (
        <SkeletonCard count={6} columns={3} />
      ) : jobs && jobs.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Showing {filtered.length} of {jobs.length} jobs
          {view === 'kanban' && kanbanVisibleCount < filtered.length && (
            <span> · {filtered.length - kanbanVisibleCount} hidden from kanban</span>
          )}
          {filtered.length < jobs.length && (
            <Button
              variant="link"
              className="h-auto p-0 pl-1 text-sm"
              onClick={() => {
                setSearch('');
                setFilters({
                  keywords: '',
                  location: '',
                  remote: false,
                  hybrid: false,
                  experience: '',
                  salaryMin: '',
                  companies: '',
                  jobBoards: [],
                  maxJobs: '30',
                });
              }}
            >
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
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={transitionFast} className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
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

      {selectedJobIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <span className="text-sm text-muted-foreground">
            {selectedJobIds.size} selected
            {filtered.length > selectedJobIds.size && (
              <Button variant="link" className="h-auto p-0 pl-1 text-sm" onClick={selectAllFiltered}>
                Select all {filtered.length}
              </Button>
            )}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={bulkTailoring || bulkScoring}
            onClick={bulkScoreMatch}
          >
            <Gauge className="h-4 w-4" />
            {bulkScoring ? 'Scoring…' : `Score match (${selectedJobIds.size})`}
          </Button>
          <Button
            size="sm"
            className="gap-2"
            disabled={bulkTailoring || bulkScoring}
            onClick={bulkGenerateResumes}
          >
            <FileText className="h-4 w-4" />
            {bulkTailoring ? 'Starting…' : `Generate Resumes (${selectedJobIds.size})`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedJobIds(new Set())} disabled={bulkTailoring || bulkScoring}>Clear</Button>
        </div>
      )}

      {!isLoading && (view === 'kanban' ? (
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
                        <JobCard
                          key={job.id}
                          job={job}
                          selected={selectedJobIds.has(job.id)}
                          onToggleSelect={() => toggleSelected(job.id)}
                          onClick={() => setSelectedJob(job)}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
            {unfiledJobs.length > 0 && (
              <div className="w-72 shrink-0">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Other</span>
                  <Badge variant="secondary">{unfiledJobs.length}</Badge>
                </div>
                <ScrollArea className="h-[calc(100vh-340px)]">
                  <div className="space-y-2 pr-2">
                    {unfiledJobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        selected={selectedJobIds.has(job.id)}
                        onToggleSelect={() => toggleSelected(job.id)}
                        onClick={() => setSelectedJob(job)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && filtered.every((job) => selectedJobIds.has(job.id))}
                      onCheckedChange={(checked) => {
                        if (checked) selectAllFiltered();
                        else setSelectedJobIds(new Set());
                      }}
                      aria-label="Select all visible jobs"
                    />
                  </TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Resume</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((job) => (
                  <TableRow
                    key={job.id}
                    className={`cursor-pointer ${selectedJobIds.has(job.id) ? 'bg-primary/5' : ''}`}
                    onClick={() => setSelectedJob(job)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedJobIds.has(job.id)}
                        onCheckedChange={() => toggleSelected(job.id)}
                        aria-label={`Select ${job.company} ${job.role}`}
                      />
                    </TableCell>
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
                    <TableCell>
                      {job.resumeId ? (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <FileText className="h-3 w-3" />
                          {job.driveFileId ? 'Drive' : 'In app'}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge status={job.status} /></TableCell>
                    <TableCell><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      ))}

      <JobDetailDialog job={selectedJob} onClose={() => setSelectedJob(null)} />
      <ApplicationPackageWizard open={showPasteJd} onOpenChange={setShowPasteJd} />
    </div>
  );
}

function JobCard({
  job,
  selected,
  onToggleSelect,
  onClick,
}: {
  job: Job;
  selected: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
}) {
  return (
    <StaggerItem
      as="article"
      className={`glass-card cursor-pointer p-3 transition-colors hover:bg-accent/30 hover:shadow-glow-sm ${selected ? 'ring-2 ring-primary' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${job.company} ${job.role}`}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{job.role}</p>
            <p className="truncate text-xs text-muted-foreground">{job.company}</p>
          </div>
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
      <div className="mt-2 flex flex-wrap gap-1">
        {job.resumeId && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <FileText className="h-2.5 w-2.5" /> Resume
          </Badge>
        )}
        {job.driveFileId && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <Cloud className="h-2.5 w-2.5" /> Drive
          </Badge>
        )}
        {!job.resumeId && job.resumeStatus === 'ready' && (
          <Badge variant="secondary" className="text-[10px]">Resume missing</Badge>
        )}
      </div>
    </StaggerItem>
  );
}

function JobDetailDialog({ job, onClose }: { job: Job | null; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [showMatchPanel, setShowMatchPanel] = useState(false);
  const [showInterviewPrep, setShowInterviewPrep] = useState(false);
  const [generatingPrep, setGeneratingPrep] = useState(false);
  const [scoreOverride, setScoreOverride] = useState<{ jobId: string; score: number; source?: string } | null>(null);
  const { data: corpusResumes } = useQuery({
    queryKey: ['resumes', 'corpus'],
    queryFn: () => services.resume.list({ kind: 'corpus' }),
  });
  const { data: linkedResume } = useQuery({
    queryKey: ['resume', job?.resumeId],
    queryFn: async () => {
      if (!job?.resumeId) return null;
      const { data } = await supabase.from('resumes').select('content').eq('id', job.resumeId).single();
      return data?.content || null;
    },
    enabled: !!job?.resumeId,
  });
  if (!job) return null;

  const matchScore = scoreOverride?.jobId === job.id ? scoreOverride.score : job.matchScore;
  const matchSource = scoreOverride?.jobId === job.id ? scoreOverride.source : job.matchScoreSource;

  const generateResume = async () => {
    if (starting) return;
    if (!hasUsableMasterResume(corpusResumes || [])) {
      toast.error('Add a master resume on the Corpus page before generating a tailored resume');
      navigate('/corpus');
      return;
    }
    setStarting(true);
    try {
      toast.success('Starting resume tailoring...');
      const { runId } = await services.resume.startResumeTailoring(job.id);
      toast.success('Resume tailoring started — check Executions for progress');
      onClose();
      navigate(`/executions/${runId}`);
      await qc.invalidateQueries({ queryKey: ['runs'] });
      await qc.invalidateQueries({ queryKey: ['jobs'] });
      await qc.invalidateQueries({ queryKey: ['resumes'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resume generation failed');
    } finally {
      setStarting(false);
    }
  };

  const scoreMatch = async () => {
    if (scoring) return;
    setScoring(true);
    try {
      const result = await services.jobSearch.scoreMatch(job.id);
      setScoreOverride({ jobId: job.id, score: result.score, source: result.source });
      toast.success(`Match score ${result.score} using ${result.source || 'your resume'}`);
      await qc.invalidateQueries({ queryKey: ['jobs'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Match scoring failed');
    } finally {
      setScoring(false);
    }
  };

  const generateInterviewPrep = async () => {
    if (generatingPrep) return;
    setGeneratingPrep(true);
    try {
      const prep = await services.jobSearch.generateInterviewPrep(job.id);
      if (prep) {
        await qc.invalidateQueries({ queryKey: ['jobs'] });
        setShowInterviewPrep(true);
        toast.success('Interview prep generated');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Interview prep failed');
    } finally {
      setGeneratingPrep(false);
    }
  };

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[min(85vh,56rem)] w-[calc(100%-2rem)] max-w-2xl flex-col gap-4 overflow-hidden">
        <DialogHeader className="min-w-0 shrink-0 pr-8 text-left">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl leading-snug break-words">{job.role}</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground break-words">{job.company} · {job.location}</p>
            </div>
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-xl font-bold text-primary">
              {matchScore}
            </div>
          </div>
        </DialogHeader>
        <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden pr-3">
          <div className="min-w-0 max-w-full space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1"><MapPin className="h-3 w-3" />{job.location}</Badge>
              {job.remote && <Badge variant="secondary">Remote</Badge>}
              {job.hybrid && <Badge variant="secondary">Hybrid</Badge>}
              {job.salaryMin && <Badge variant="secondary" className="gap-1"><DollarSign className="h-3 w-3" />{formatCurrency(job.salaryMin)} - {formatCurrency(job.salaryMax || 0)}</Badge>}
              <Badge variant="secondary">{job.source}</Badge>
              {job.duplicate && <Badge variant="destructive">Duplicate</Badge>}
              {job.resumeId && <Badge variant="outline" className="gap-1"><FileText className="h-3 w-3" /> Resume linked</Badge>}
              {job.driveFileId && <Badge variant="outline" className="gap-1"><Cloud className="h-3 w-3" /> On Drive</Badge>}
              {!job.resumeId && job.resumeStatus === 'ready' && <Badge variant="secondary">Resume not linked</Badge>}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {job.skills.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}
              </div>
            </div>
            <div className="min-w-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{job.description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Posted: {formatDate(job.postingDate)}</span>
              <span>Experience: {job.experience || 'Any'}</span>
              {matchSource && <span className="break-words">Scored with: {matchSource}</span>}
            </div>
            {showMatchPanel && (
              <div className="mt-4 border-t border-border pt-4">
                <JdMatchPanel jd={job.description} resume={linkedResume || ''} />
              </div>
            )}
            {showInterviewPrep && job.interviewPrep && (
              <div className="mt-4 border-t border-border pt-4 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Interview Prep</p>
                {job.interviewPrep.talkingPoints.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-medium">Talking Points</p>
                    <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                      {job.interviewPrep.talkingPoints.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {job.interviewPrep.technicalQuestions.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-medium">Technical Questions</p>
                    <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                      {job.interviewPrep.technicalQuestions.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {job.interviewPrep.behavioralQuestions.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-medium">Behavioral Questions</p>
                    <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                      {job.interviewPrep.behavioralQuestions.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {job.interviewPrep.questionsToAsk.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-medium">Questions to Ask</p>
                    <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                      {job.interviewPrep.questionsToAsk.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {job.interviewPrep.researchNotes && (
                  <div>
                    <p className="mb-1 text-sm font-medium">Research Notes</p>
                    <p className="text-sm text-muted-foreground">{job.interviewPrep.researchNotes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button onClick={generateResume} disabled={starting || scoring} className="gap-2">
            <FileText className="h-4 w-4" /> {starting ? 'Starting…' : 'Generate Resume'}
          </Button>
          <Button variant="outline" onClick={scoreMatch} disabled={scoring || starting} className="gap-2">
            <Gauge className="h-4 w-4" /> {scoring ? 'Scoring…' : 'Score match'}
          </Button>
          {matchScore > 0 && (
            <Button
              variant={showMatchPanel ? 'secondary' : 'outline'}
              onClick={() => setShowMatchPanel(!showMatchPanel)}
              className="gap-2"
            >
              <Target className="h-4 w-4" /> {showMatchPanel ? 'Hide Match' : 'View Match'}
            </Button>
          )}
          {(job.resumeId || job.interviewPrep) && (
            <Button
              variant={showInterviewPrep ? 'secondary' : 'outline'}
              onClick={() => job.interviewPrep ? setShowInterviewPrep(!showInterviewPrep) : generateInterviewPrep()}
              disabled={generatingPrep}
              className="gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              {generatingPrep ? 'Generating…' : showInterviewPrep ? 'Hide Prep' : job.interviewPrep ? 'View Prep' : 'Interview Prep'}
            </Button>
          )}
          {job.url && (
            <Button variant="ghost" className="gap-2" onClick={() => window.open(job.url, '_blank')}>
              View Posting <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
