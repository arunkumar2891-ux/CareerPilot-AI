import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus, FileText, Download, GitCompare,
  Clock, Sparkles, FileX, Cloud, CloudUpload,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
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
                disabled={bulkSyncing}
                onClick={bulkSyncToDrive}
              >
                <CloudUpload className="h-4 w-4" />
                {bulkSyncing ? 'Copying…' : 'Copy to Google Drive'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
            </div>
          )}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading resumes…</p>
          ) : !resumes || resumes.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={FileX}
                  title="No job resumes yet"
                  description='Run a job search pipeline or open a job and click "Generate Resume". Tailored resumes appear here as "Tailored: Company Role".'
                  action={
                    <Button asChild className="gap-2">
                      <Link to="/jobs"><Sparkles className="h-4 w-4" /> Go to Job Discovery</Link>
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {resumes.map((r, i) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
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
                        <Badge variant="secondary" className="capitalize">{r.type}</Badge>
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
              </motion.div>
            ))}
          </div>
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

      <ResumeEditor
        resume={selected}
        onClose={() => setSelected(null)}
        onResumeUpdated={() => qc.invalidateQueries({ queryKey: ['resumes'] })}
        showGenerateTailored
      />
    </div>
  );
}
