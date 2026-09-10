import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Clock, Plus, Trash2 } from 'lucide-react';
import { InlineLoader, SkeletonCard, StaggerItem, StaggerList } from '@/components/motion';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { ResumeEditor } from '@/components/resumes/ResumeEditor';
import { services } from '@/services';
import { timeAgo } from '@/utils';
import { corpusGroup } from '@/utils/resume-classification';
import { EmptyState } from '@/components/shared/EmptyState';
import { parseGoogleDocFileId } from '@/utils/google';
import { toast } from 'sonner';
import type { Resume } from '@/types';

const GROUP_LABELS = {
  master: 'Master resume',
  role_specific: 'Role-specific resumes',
  other: 'Other corpus',
} as const;

function sourceLabel(resume: Resume): string {
  if (resume.corpusSource === 'google_doc') return 'Google Doc';
  if (resume.corpusSource === 'upload') return 'Uploaded file';
  if (resume.corpusSource === 'paste') return 'Pasted';
  return 'In app';
}

export function CorpusPage() {
  const qc = useQueryClient();
  const { data: resumes, isLoading } = useQuery({
    queryKey: ['resumes', 'corpus'],
    queryFn: () => services.resume.list({ kind: 'corpus' }),
  });
  const [selected, setSelected] = useState<Resume | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<'all' | { ids: string[]; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addOpen, setAddOpen] = useState<'master' | 'role_specific' | null>(null);

  const grouped = {
    master: (resumes || []).filter((r) => corpusGroup(r) === 'master'),
    role_specific: (resumes || []).filter((r) => corpusGroup(r) === 'role_specific'),
    other: (resumes || []).filter((r) => corpusGroup(r) === 'other'),
  };
  const hasMaster = grouped.master.length > 0;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const count = deleteTarget === 'all'
        ? await services.resume.deleteAllCorpusResumes()
        : await services.resume.deleteCorpusResumes(deleteTarget.ids);
      await qc.invalidateQueries({ queryKey: ['resumes'] });
      await qc.invalidateQueries({ queryKey: ['settings'] });
      await qc.invalidateQueries({ queryKey: ['knowledge-collections'] });
      const deletedIds = deleteTarget === 'all'
        ? new Set(resumes?.map((resume) => resume.id) ?? [])
        : new Set(deleteTarget.ids);
      if (selected && deletedIds.has(selected.id)) setSelected(null);
      toast.success(`Deleted ${count} corpus document${count === 1 ? '' : 's'}`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete corpus');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <PageHeader
        title="Career Corpus"
        description="Your master resume and optional role-specific resumes used for job tailoring"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setAddOpen('master')} className="gap-2">
              <Plus className="h-4 w-4" /> {hasMaster ? 'Replace master' : 'Add master resume'}
            </Button>
            <Button onClick={() => setAddOpen('role_specific')} className="gap-2">
              <Plus className="h-4 w-4" /> Add role resume
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget('all')}
              disabled={!resumes?.length || deleting}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" /> Delete All
            </Button>
          </div>
        }
      />

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4 text-sm text-muted-foreground">
          Tailoring uses your master resume unless a role-specific resume matches the job title.
          Job-specific outputs appear on the{' '}
          <Link to="/resumes" className="font-medium text-primary underline-offset-4 hover:underline">Resumes</Link> page.
          Contact details in <Link to="/settings" className="font-medium text-primary underline-offset-4 hover:underline">Settings</Link> overlay the header.
        </CardContent>
      </Card>

      {isLoading ? (
        <SkeletonCard count={6} columns={3} />
      ) : !resumes?.length ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={BookOpen}
              title="Add your master resume"
              description="Sync a Google Doc, upload a PDF/DOCX/MD file, or paste resume text. Role-specific resumes are optional."
              action={
                <Button onClick={() => setAddOpen('master')} className="gap-2">
                  <Plus className="h-4 w-4" /> Add master resume
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        (['master', 'role_specific', 'other'] as const).map((groupKey) => {
          const items = grouped[groupKey];
          if (items.length === 0) return null;
          return (
            <section key={groupKey} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {GROUP_LABELS[groupKey]}
              </h2>
              <StaggerList className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {items.map((r) => (
                  <StaggerItem key={r.id}>
                    <Card
                      className="cursor-pointer transition-colors hover:bg-accent/30"
                      onClick={() => setSelected(r)}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <BookOpen className="h-5 w-5 text-primary" />
                          </div>
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
                            <Badge variant="secondary">{sourceLabel(r)}</Badge>
                          </div>
                        </div>
                        <p className="mt-3 font-semibold">{r.name}</p>
                        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                          {r.content.replace(/\s+/g, ' ').slice(0, 180) || 'No content yet'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Updated {timeAgo(r.updatedAt)}</p>
                        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> {r.versions.length} versions
                        </div>
                      </CardContent>
                    </Card>
                  </StaggerItem>
                ))}
              </StaggerList>
            </section>
          );
        })
      )}

      <AddCorpusDialog
        kind={addOpen}
        onClose={() => setAddOpen(null)}
        onSaved={async () => {
          await qc.invalidateQueries({ queryKey: ['resumes'] });
          await qc.invalidateQueries({ queryKey: ['settings'] });
          await qc.invalidateQueries({ queryKey: ['knowledge-collections'] });
          setAddOpen(null);
        }}
      />

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteTarget === 'all'
                ? 'Delete all corpus documents?'
                : `Delete ${deleteTarget?.label ?? 'this document'}?`}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget === 'all'
                ? 'This permanently deletes your master resume, role-specific resumes, career evidence chunks, and the Google Doc ID in Settings. Job-tailored resumes are kept.'
                : 'This permanently deletes this corpus document and its version history. Deleting the master resume also clears career evidence chunks. Job-tailored resumes are kept.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting} className="gap-2">
              {deleting ? <InlineLoader /> : <Trash2 className="h-4 w-4" />}
              {deleteTarget === 'all' ? 'Delete all corpus' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResumeEditor
        resume={selected}
        onClose={() => setSelected(null)}
        onResumeUpdated={() => qc.invalidateQueries({ queryKey: ['resumes'] })}
        showDriveSync={false}
      />
    </div>
  );
}

function AddCorpusDialog({
  kind,
  onClose,
  onSaved,
}: {
  kind: 'master' | 'role_specific' | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [roleName, setRoleName] = useState('');
  const [googleDocId, setGoogleDocId] = useState('');
  const [pasted, setPasted] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    setRoleName('');
    setGoogleDocId('');
    setPasted('');
    setSaving(false);
    setUploadError('');
  }, [kind]);

  const save = async (content: string, source: 'google_doc' | 'upload' | 'paste') => {
    if (!kind) return;
    if (kind === 'role_specific' && !roleName.trim()) {
      toast.error('Enter a role name, for example Forward Deployment Engineer');
      return;
    }
    setSaving(true);
    try {
      await services.resume.createCorpus({
        name: roleName,
        content,
        corpusType: kind,
        corpusSource: source,
      });
      toast.success(kind === 'master' ? 'Master resume saved' : 'Role resume saved');
      setRoleName('');
      setGoogleDocId('');
      setPasted('');
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save resume');
    } finally {
      setSaving(false);
    }
  };

  const syncDoc = async () => {
    const fileId = parseGoogleDocFileId(googleDocId);
    if (!fileId) {
      toast.error('Paste a Google Doc link or file ID');
      return;
    }
    if (kind === 'role_specific' && !roleName.trim()) {
      toast.error('Enter a role name, for example Forward Deployment Engineer');
      return;
    }
    setSaving(true);
    try {
      await services.resume.syncGoogleDocCorpus({
        fileId,
        corpusType: kind || 'master',
        name: kind === 'role_specific' ? roleName.trim() : undefined,
      });
      toast.success('Google Doc synced');
      setRoleName('');
      setGoogleDocId('');
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Google Doc sync failed');
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (kind === 'role_specific' && !roleName.trim()) {
      toast.error('Enter a role name, for example Forward Deployment Engineer');
      return;
    }
    setUploadError('');
    setSaving(true);
    try {
      const text = await services.resume.parseUploadedResume(file);
      await save(text, 'upload');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(message);
      toast.error(message);
      setSaving(false);
    }
  };

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{kind === 'role_specific' ? 'Add role-specific resume' : 'Add master resume'}</DialogTitle>
          <DialogDescription>
            {kind === 'role_specific'
              ? 'Used when the job title matches this role (for example FDE). Other jobs use the master resume.'
              : 'Required for resume tailoring. Sync a Google Doc, upload a file, or paste text.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {kind === 'role_specific' && (
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Role name</Label>
              <Input
                id="role-name"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="Forward Deployment Engineer"
              />
            </div>
          )}
          <Tabs defaultValue="upload">
            <TabsList>
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="gdoc">Google Doc</TabsTrigger>
              <TabsTrigger value="paste">Paste</TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="pt-3">
              <FileDropzone disabled={saving} uploading={saving} error={uploadError} onFile={uploadFile} />
            </TabsContent>
            <TabsContent value="gdoc" className="space-y-3 pt-3">
              <Label htmlFor="gdoc-id">Google Doc link or ID</Label>
              <Input
                id="gdoc-id"
                value={googleDocId}
                onChange={(e) => setGoogleDocId(e.target.value)}
                placeholder="docs.google.com/document/d/FILE_ID/edit"
              />
              <p className="text-xs text-muted-foreground">
                Paste a Google Docs or Drive file link. Native Docs work best; PDF and Word files on Drive are also accepted.
              </p>
              <Button onClick={syncDoc} disabled={saving} className="gap-2">
                {saving ? <InlineLoader /> : null}
                Sync Google Doc
              </Button>
            </TabsContent>
            <TabsContent value="paste" className="space-y-3 pt-3">
              <Label htmlFor="paste-resume">Resume text</Label>
              <Textarea
                id="paste-resume"
                rows={10}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste your resume..."
              />
              <Button onClick={() => save(pasted, 'paste')} disabled={saving || !pasted.trim()}>
                Save pasted resume
              </Button>
            </TabsContent>
          </Tabs>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
