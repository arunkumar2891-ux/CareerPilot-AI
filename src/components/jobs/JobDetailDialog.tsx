import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MapPin, DollarSign, ExternalLink, FileText, Cloud, Gauge, Target, MessageSquare,
  Mail, Send, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { services } from '@/services';
import { formatCurrency, formatDate } from '@/utils';
import { errorMessageOr, isGmailScopeError } from '@/utils/job-filters';
import { hasUsableMasterResume } from '@/utils/resume-classification';
import { JdMatchPanel } from '@/components/resumes/JdMatchPanel';
import { invalidateAll } from '@/utils/query-keys';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Job } from '@/types';

/**
 * Job detail modal: badges, description, match panel, interview prep, and the
 * apply-via-email flow (including the confirm dialog that sends a real email).
 *
 * Extracted verbatim from `src/pages/JobsPage.tsx` (which was 1118 lines) so the
 * page is navigable. This component shares no state with the page beyond `job`
 * and `onClose`, so the move changed no behaviour.
 */

export function JobDetailDialog({ job, onClose }: { job: Job | null; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [showMatchPanel, setShowMatchPanel] = useState(false);
  const [showInterviewPrep, setShowInterviewPrep] = useState(false);
  const [generatingPrep, setGeneratingPrep] = useState(false);
  const [scoreOverride, setScoreOverride] = useState<{ jobId: string; score: number; source?: string } | null>(null);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [applyPreview, setApplyPreview] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [extractingEmail, setExtractingEmail] = useState(false);
  const [emailOverride, setEmailOverride] = useState<{ jobId: string; email: string } | null>(null);
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
  const effectiveApplyEmail = emailOverride?.jobId === job.id ? emailOverride.email : job.applyEmail;

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
      toast.success('Resume tailoring started â€” check Executions for progress');
      onClose();
      navigate(`/executions/${runId}`);
      await invalidateAll(qc, ['runs', 'jobs', 'resumes']);
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

  const extractSingleEmail = async () => {
    if (!job || extractingEmail) return;
    setExtractingEmail(true);
    try {
      const result = await services.autoApply.extractEmails([job.id]);
      if (result.extracted > 0) {
        const { data } = await supabase.from('jobs').select('apply_email').eq('id', job.id).single();
        if (data?.apply_email) {
          setEmailOverride({ jobId: job.id, email: String(data.apply_email) });
          toast.success(`Found apply email: ${data.apply_email}`);
        }
      } else {
        toast.info('No apply email found in this job description');
      }
      await qc.invalidateQueries({ queryKey: ['jobs'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Email extraction failed');
    } finally {
      setExtractingEmail(false);
    }
  };

  const openApplyPreview = async () => {
    if (!job || !effectiveApplyEmail || loadingPreview) return;
    setLoadingPreview(true);
    try {
      const preview = await services.autoApply.getApplyPreview(job.id);
      setApplyPreview(preview);
      setShowApplyConfirm(true);
    } catch (err) {
      const message = errorMessageOr(err, 'Failed to generate preview');
      if (isGmailScopeError(err)) {
        toast.error('Gmail permission needed', {
          description: 'Reconnect Google in Integrations to enable email sending.',
          action: { label: 'Go to Integrations', onClick: () => navigate('/integrations') },
        });
      } else {
        toast.error(message);
      }
    } finally {
      setLoadingPreview(false);
    }
  };

  const confirmApply = async () => {
    if (!job || applying) return;
    setApplying(true);
    try {
      const result = await services.autoApply.apply([job.id]);
      const r = result.results[0];
      if (r?.status === 'sent') {
        toast.success(`Application sent to ${effectiveApplyEmail}`);
        await invalidateAll(qc, ['jobs', 'applications']);
        setShowApplyConfirm(false);
        onClose();
      } else {
        toast.error(r?.error || 'Failed to send application');
      }
    } catch (err) {
      const message = errorMessageOr(err, 'Auto-apply failed');
      if (isGmailScopeError(err)) {
        toast.error('Gmail permission needed', {
          description: 'Reconnect Google in Integrations to enable email sending.',
          action: { label: 'Go to Integrations', onClick: () => navigate('/integrations') },
        });
      } else {
        toast.error(message);
      }
    } finally {
      setApplying(false);
    }
  };

  const saveManualEmail = async () => {
    if (!job || !manualEmail.trim()) return;
    try {
      await services.autoApply.setApplyEmail(job.id, manualEmail.trim());
      setEmailOverride({ jobId: job.id, email: manualEmail.trim() });
      await qc.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Apply email saved');
      setEditingEmail(false);
      setManualEmail('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save email');
    }
  };

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[min(85vh,56rem)] w-[calc(100%-2rem)] max-w-2xl flex-col gap-4 overflow-hidden">
        <DialogHeader className="min-w-0 shrink-0 pr-8 text-left">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl leading-snug break-words">{job.role}</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground break-words">{job.company} Â· {job.location}</p>
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
              {effectiveApplyEmail && <Badge variant="outline" className="gap-1"><Mail className="h-3 w-3" /> {effectiveApplyEmail}</Badge>}
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
            <FileText className="h-4 w-4" /> {starting ? 'Startingâ€¦' : 'Generate Resume'}
          </Button>
          <Button variant="outline" onClick={scoreMatch} disabled={scoring || starting} className="gap-2">
            <Gauge className="h-4 w-4" /> {scoring ? 'Scoringâ€¦' : 'Score match'}
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
              {generatingPrep ? 'Generatingâ€¦' : showInterviewPrep ? 'Hide Prep' : job.interviewPrep ? 'View Prep' : 'Interview Prep'}
            </Button>
          )}
          {effectiveApplyEmail && job.resumeStatus === 'ready' && job.status !== 'applied' && (
            <Button
              variant="default"
              onClick={openApplyPreview}
              disabled={loadingPreview || applying}
              className="gap-2"
            >
              {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {loadingPreview ? 'Loadingâ€¦' : 'Apply via Email'}
            </Button>
          )}
          {!effectiveApplyEmail && job.status !== 'applied' && (
            editingEmail ? (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="hiring@company.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  className="h-8 w-48 text-xs"
                />
                <Button size="sm" variant="outline" onClick={saveManualEmail} className="h-8 text-xs">Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingEmail(false); setManualEmail(''); }} className="h-8 text-xs">Cancel</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={extractSingleEmail}
                  disabled={extractingEmail}
                  className="gap-1 text-xs"
                >
                  {extractingEmail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                  {extractingEmail ? 'Extractingâ€¦' : 'Extract Email'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingEmail(true)} className="gap-1 text-xs">
                  Set Manually
                </Button>
              </div>
            )
          )}
          {job.url && (
            <Button variant="ghost" className="gap-2" onClick={() => window.open(job.url, '_blank')}>
              View Posting <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </DialogContent>

      <Dialog open={showApplyConfirm} onOpenChange={setShowApplyConfirm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Application</DialogTitle>
            <DialogDescription>
              Review the email before sending. Your tailored resume PDF will be attached.
            </DialogDescription>
          </DialogHeader>
          {applyPreview && (
            <div className="space-y-3 py-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">To</p>
                <p className="text-sm font-medium">{applyPreview.to}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subject</p>
                <p className="text-sm">{applyPreview.subject}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Body</p>
                <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border p-3">
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{applyPreview.body}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyConfirm(false)} disabled={applying}>Cancel</Button>
            <Button onClick={confirmApply} disabled={applying} className="gap-2">
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {applying ? 'Sendingâ€¦' : 'Send Application'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
