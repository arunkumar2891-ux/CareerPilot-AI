import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BookOpen, FileText, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ResumeEditor } from '@/components/resumes/ResumeEditor';
import { services } from '@/services';
import { timeAgo } from '@/utils';
import { corpusGroup } from '@/utils/resume-classification';
import { MASTER_RESUME_NAME, TWO_PAGE_RESUME_NAME } from '@/content/career-corpus';
import { EmptyState } from '@/components/shared/EmptyState';
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

  const grouped = {
    core: (resumes || []).filter((r) => corpusGroup(r.name) === 'core'),
    'role-bank': (resumes || []).filter((r) => corpusGroup(r.name) === 'role-bank'),
    other: (resumes || []).filter((r) => corpusGroup(r.name) === 'other'),
  };

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <PageHeader
        title="Career Corpus"
        description="Master ATS bullet bank, 2-page template, and role-focused banks used for job tailoring"
        actions={
          <Button variant="outline" asChild>
            <Link to="/knowledge">Sync from Google Doc</Link>
          </Button>
        }
      />

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4 text-sm text-muted-foreground">
          These documents power ATS optimization and tailored resumes. Job-specific outputs appear on the{' '}
          <Link to="/resumes" className="font-medium text-primary underline-offset-4 hover:underline">Resumes</Link> page.
          Edit contact details in <Link to="/settings" className="font-medium text-primary underline-offset-4 hover:underline">Settings</Link> to update headers across the corpus.
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading corpus…</p>
      ) : !resumes?.length ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={BookOpen}
              title="Corpus seeding"
              description="Master ATS, the 2-page template, and role banks are created automatically on login. Refresh in a moment."
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
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {items.map((r, i) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <Card
                      className="cursor-pointer transition-colors hover:bg-accent/30"
                      onClick={() => setSelected(r)}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <BookOpen className="h-5 w-5 text-primary" />
                          </div>
                          <Badge variant="secondary" className="capitalize">{r.type}</Badge>
                        </div>
                        <p className="mt-3 font-semibold">{r.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.name === MASTER_RESUME_NAME && 'Full bullet bank for RAG tailoring'}
                          {r.name === TWO_PAGE_RESUME_NAME && 'Length and layout target for PDFs'}
                          {r.name.startsWith('ATS Bank:') && 'Focused excerpt for this role family'}
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
                  </motion.div>
                ))}
              </div>
            </section>
          );
        })
      )}

      <ResumeEditor
        resume={selected}
        onClose={() => setSelected(null)}
        onResumeUpdated={() => qc.invalidateQueries({ queryKey: ['resumes'] })}
        showDriveSync={false}
      />
    </div>
  );
}
