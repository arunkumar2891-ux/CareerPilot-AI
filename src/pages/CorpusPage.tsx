import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Clock, Trash2 } from 'lucide-react';
import { InlineLoader, SkeletonCard, StaggerItem, StaggerList } from '@/components/motion';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { ResumeEditor } from '@/components/resumes/ResumeEditor';
import { services } from '@/services';
import { timeAgo } from '@/utils';
import { corpusGroup } from '@/utils/resume-classification';
import { MASTER_RESUME_NAME, TWO_PAGE_RESUME_NAME } from '@/content/career-corpus';
import { EmptyState } from '@/components/shared/EmptyState';
import { RoleBanksStatusBanner } from '@/components/RoleBanksStatusBanner';
import { toast } from 'sonner';
import type { Resume } from '@/types';

const GROUP_LABELS = {
  core: 'Core templates',
  'role-bank': 'Role banks',
  other: 'Other corpus',
} as const;

export function CorpusPage() {
  const qc = useQueryClient();
  const { data: resumes, isLoading } = useQuery({
    queryKey: ['resumes', 'corpus'],
    queryFn: () => services.resume.list({ kind: 'corpus' }),
  });
  const [selected, setSelected] = useState<Resume | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<'all' | { ids: string[]; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const grouped = {
    core: (resumes || []).filter((r) => corpusGroup(r.name) === 'core'),
    'role-bank': (resumes || []).filter((r) => corpusGroup(r.name) === 'role-bank'),
    other: (resumes || []).filter((r) => corpusGroup(r.name) === 'other'),
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const count = deleteTarget === 'all'
        ? await services.resume.deleteAllCorpusResumes()
        : await services.resume.deleteCorpusResumes(deleteTarget.ids);
      await qc.invalidateQueries({ queryKey: ['resumes'] });
      await qc.invalidateQueries({ queryKey: ['settings'] });
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
        description="Master ATS bullet bank, 2-page template, and role-focused banks used for job tailoring"
        actions={
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
            <RoleBanksStatusBanner />
            <Button
              variant="outline"
              onClick={() => setDeleteTarget('all')}
              disabled={!resumes?.length || deleting}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" /> Delete All
            </Button>
            <Button variant="outline" asChild>
              <Link to="/knowledge">Sync from Google Doc</Link>
            </Button>
          </div>
        }
      />

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4 text-sm text-muted-foreground">
          These documents power ATS optimization and tailored resumes. Delete stale banks here, then sync from Google Doc to refresh.
          Job-specific outputs appear on the{' '}
          <Link to="/resumes" className="font-medium text-primary underline-offset-4 hover:underline">Resumes</Link> page.
          Edit contact details in <Link to="/settings" className="font-medium text-primary underline-offset-4 hover:underline">Settings</Link> to update headers across the corpus.
        </CardContent>
      </Card>

      {isLoading ? (
        <SkeletonCard count={6} columns={3} />
      ) : !resumes?.length ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={BookOpen}
              title="Corpus empty"
              description="Master ATS and the 2-page template seed on login. Role banks are generated after you sync a Google Doc Resume ID."
              action={
                <Button asChild className="gap-2">
                  <Link to="/knowledge">Sync from Google Doc</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        (['core', 'role-bank', 'other'] as const).map((groupKey) => {
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
                            <Badge variant="secondary" className="capitalize">{r.type}</Badge>
                          </div>
                        </div>
                        <p className="mt-3 font-semibold">{r.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.name === MASTER_RESUME_NAME && 'Full bullet bank for RAG tailoring'}
                          {r.name === TWO_PAGE_RESUME_NAME && 'Length and layout target for PDFs'}
                          {r.name.startsWith('ATS Bank:') && 'Comprehensive role corpus for JD tailoring'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Updated {timeAgo(r.updatedAt)}</p>
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
            </section>
          );
        })
      )}

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
                ? 'This permanently deletes Master ATS, the 2-page template, role banks, and their version history. Job-tailored resumes are kept. Sync from Google Doc afterward to rebuild the corpus.'
                : 'This permanently deletes this corpus document and its version history. Job-tailored resumes are kept. You can regenerate it by syncing from Google Doc (role banks) or signing in again (core templates).'}
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
