import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Plus, FileText, GitCompare,
  Clock, Sparkles, FileX, Cloud, CloudUpload, Trash2,
} from 'lucide-react';
import { InlineLoader, SkeletonCard, StaggerItem, StaggerList } from '@/components/motion';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { ResumeEditor } from '@/components/resumes/ResumeEditor';
import { services } from '@/services';
import { formatDate, timeAgo } from '@/utils';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import type { Resume } from '@/types';

export function ResumesPage() {
  const qc = useQueryClient();
  const { data: resumes, isLoading } = useQuery({
    queryKey: ['resumes', 'job'],
    queryFn: () => services.resume.list({ kind: 'job' }),
  });
  const [selected, setSelected] = useState<Resume | null>(null);
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [compareResult, setCompareResult] = useState<string[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<Resume['type']>('general');
  const [newContent, setNewContent] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<'all' | { ids: string[]; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkSyncToDrive = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkSyncing(true);
    try {
      const { results, errors } = await services.resume.syncManyToDrive(ids);
      await qc.invalidateQueries({ queryKey: ['resumes'] });
      if (results.length > 0) {
        toast.success(`Copied ${results.length} resume${results.length === 1 ? '' : 's'} to Google Drive`);
      }
      if (errors?.length) {
        toast.error(`${errors.length} resume${errors.length === 1 ? '' : 's'} failed to sync`, {
          description: errors[0]?.error,
        });
      }
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Google Drive sync failed');
    } finally {
      setBulkSyncing(false);
    }
  };

  const create = async () => {
    await services.resume.create(newName, newType, newContent || `# ${newName}\n\nNew resume content...`);
    toast.success('Resume created');
    setShowCreate(false);
    setNewName('');
    setNewContent('');
    qc.invalidateQueries({ queryKey: ['resumes'] });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const count = deleteTarget === 'all'
        ? await services.resume.deleteAllJobResumes()
        : await services.resume.deleteJobResumes(deleteTarget.ids);
      await qc.invalidateQueries({ queryKey: ['resumes'] });
      await qc.invalidateQueries({ queryKey: ['jobs'] });
      const deletedIds = deleteTarget === 'all'
        ? new Set(resumes?.map((resume) => resume.id) ?? [])
        : new Set(deleteTarget.ids);
      if (selected && deletedIds.has(selected.id)) setSelected(null);
      setSelectedIds((prev) => new Set([...prev].filter((id) => !deletedIds.has(id))));
      toast.success(`Deleted ${count} job resume${count === 1 ? '' : 's'}`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete resumes');
    } finally {
      setDeleting(false);
    }
  };

  const compare = async () => {
    if (!compareA || !compareB || compareA === compareB) {
      toast.error('Select two different resumes to compare');
      return;
    }
    const res = await services.resume.compare(compareA, compareB);
    setCompareResult(res.diff);
  };

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <PageHeader
        title="Resumes"
        description="Job-tailored resumes from search pipelines and manual generation"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget('all')} disabled={!resumes?.length} className="gap-2">
              <Trash2 className="h-4 w-4" /> Delete All
            </Button>
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> New Resume</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Resume</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5"><Label>Name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Senior Frontend Resume" /></div>
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={newType} onValueChange={(v) => setNewType(v as Resume['type'])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="technical">Technical</SelectItem>
                        <SelectItem value="executive">Executive</SelectItem>
                        <SelectItem value="creative">Creative</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Content (Markdown)</Label><Textarea rows={6} value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="# Your Name..." /></div>
                </div>
                <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <p className="text-sm text-muted-foreground">
        Master ATS, templates, and role banks live on the{' '}
        <Link to="/corpus" className="font-medium text-primary underline-offset-4 hover:underline">Corpus</Link> page.
      </p>

      <Tabs defaultValue="resumes">
        <TabsList>
          <TabsTrigger value="resumes">Job Resumes</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="versions">Version History</TabsTrigger>
        </TabsList>

        <TabsContent value="resumes" className="space-y-4">
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
              <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
              <Button
                size="sm"
                className="gap-2"
                disabled={bulkSyncing || deleting}
                onClick={bulkSyncToDrive}
              >
                <CloudUpload className="h-4 w-4" />
                {bulkSyncing ? 'Copying…' : 'Copy to Google Drive'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-2"
                disabled={deleting}
                onClick={() => {
                  const ids = Array.from(selectedIds);
                  const label = ids.length === 1
                    ? resumes?.find((resume) => resume.id === ids[0])?.name || 'this resume'
                    : `${ids.length} selected resumes`;
                  setDeleteTarget({ ids, label });
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete selected
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
            </div>
          )}
          {isLoading ? (
            <SkeletonCard count={6} columns={3} />
          ) : !resumes || resumes.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={FileX}
                  title="No job resumes yet"
                  description='Run a job search pipeline or open a job and click "Generate Resume". Tailored resumes appear here as "Tailored: Company Role (job id)".'
                  action={
                    <Button asChild className="gap-2">
                      <Link to="/jobs"><Sparkles className="h-4 w-4" /> Go to Job Discovery</Link>
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
          <StaggerList className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {resumes.map((r) => (
              <StaggerItem key={r.id}>
                <Card
                  className={`cursor-pointer transition-colors hover:bg-accent/30 ${selectedIds.has(r.id) ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setSelected(r)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedIds.has(r.id)}
                          onCheckedChange={() => toggleSelected(r.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${r.name}`}
                        />
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${r.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({ ids: [r.id], label: r.name });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Badge variant="secondary" className="capitalize">{r.type}</Badge>
                        </div>
                        {r.jobId && <Badge variant="outline" className="text-xs">Job linked</Badge>}
                        {r.driveFileId && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Cloud className="h-3 w-3" /> On Drive
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="mt-3 font-semibold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">Updated {timeAgo(r.updatedAt)}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">ATS Score</span>
                          <span className={`font-semibold ${r.atsScore >= 85 ? 'text-success' : 'text-warning'}`}>{r.atsScore}</span>
                        </div>
                        <Progress value={r.atsScore} className="mt-1 h-1.5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> {r.versions.length} versions
                    </div>
                  </CardContent>
                </Card>
              </StaggerItem>
            ))}
          </StaggerList>
          )}
        </TabsContent>

        <TabsContent value="compare" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Resume A</Label>
                  <Select value={compareA} onValueChange={setCompareA}>
                    <SelectTrigger><SelectValue placeholder="Select resume" /></SelectTrigger>
                    <SelectContent>{resumes?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Resume B</Label>
                  <Select value={compareB} onValueChange={setCompareB}>
                    <SelectTrigger><SelectValue placeholder="Select resume" /></SelectTrigger>
                    <SelectContent>{resumes?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={compare} className="mt-4 gap-2"><GitCompare className="h-4 w-4" /> Compare</Button>
            </CardContent>
          </Card>
          {compareResult && (
            <Card>
              <CardHeader><CardTitle className="text-base">Comparison Results</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {compareResult.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                    <GitCompare className="h-4 w-4 text-primary" /> {d}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="versions" className="space-y-4">
          {(!resumes || resumes.length === 0) ? (
            <Card><CardContent><EmptyState icon={FileX} title="No versions yet" description="Generate a tailored resume to start tracking version history." /></CardContent></Card>
          ) : resumes.map((r) => (
            <Card key={r.id}>
              <CardHeader><CardTitle className="text-base">{r.name}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {r.versions.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-xs font-bold">v{v.version}</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Version {v.version} {v.note && <span className="text-muted-foreground">— {v.note}</span>}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(v.createdAt)} · ATS {v.atsScore}</p>
                    </div>
                    <Badge variant="secondary">{v.atsScore}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteTarget === 'all'
                ? 'Delete all job resumes?'
                : deleteTarget && deleteTarget.ids.length === 1
                  ? `Delete ${deleteTarget.label}?`
                  : `Delete ${deleteTarget?.ids.length ?? 0} selected resumes?`}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget === 'all'
                ? 'This permanently deletes all tailored job resumes and their version history from the database. Corpus resumes (master ATS, templates, role banks) are kept. Linked jobs will have their resume status reset so you can regenerate them from the Job Discovery page.'
                : 'This permanently deletes the selected job resume(s) and their version history. Linked jobs will have their resume status reset so you can regenerate them from the Job Discovery page.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting} className="gap-2">
              {deleting ? <InlineLoader /> : <Trash2 className="h-4 w-4" />}
              {deleteTarget === 'all' ? 'Delete all job resumes' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResumeEditor
        resume={selected}
        onClose={() => setSelected(null)}
        onResumeUpdated={() => qc.invalidateQueries({ queryKey: ['resumes'] })}
        showGenerateTailored
      />
    </div>
  );
}
