import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { services } from '@/services';
import { toast } from 'sonner';
import { lexicalMatchScore } from '@/utils/jd-match';
import { JdMatchPanel } from '@/components/resumes/JdMatchPanel';
import {
  Loader2, FileText, ChevronRight, ChevronLeft, Target, Mail, MessageSquare, CheckCircle2, ExternalLink,
} from 'lucide-react';

interface ApplicationPackageWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'paste' | 'score' | 'generate' | 'results';

interface GeneratedResults {
  runId?: string;
  coverLetterId?: string;
  coverLetterContent?: string;
  interviewPrep?: {
    talkingPoints: string[];
    technicalQuestions: string[];
    behavioralQuestions: string[];
    questionsToAsk: string[];
    researchNotes: string;
  };
  jobId: string;
  company: string;
  role: string;
}

export function ApplicationPackageWizard({ open, onOpenChange }: ApplicationPackageWizardProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('paste');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [jd, setJd] = useState('');
  const [url, setUrl] = useState('');
  const [masterResume, setMasterResume] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState('');

  const [includeResume, setIncludeResume] = useState(true);
  const [includeCoverLetter, setIncludeCoverLetter] = useState(true);
  const [includeInterviewPrep, setIncludeInterviewPrep] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedResults | null>(null);

  const canProceedFromPaste = company.trim() && role.trim() && jd.trim().length >= 50;

  const scoreResult = useMemo(() => {
    if (!jd.trim() || !masterResume.trim()) return null;
    return lexicalMatchScore(jd, masterResume);
  }, [jd, masterResume]);

  const reset = () => {
    setStep('paste');
    setCompany('');
    setRole('');
    setJd('');
    setUrl('');
    setMasterResume('');
    setJobId('');
    setIncludeResume(true);
    setIncludeCoverLetter(true);
    setIncludeInterviewPrep(false);
    setGenerating(false);
    setResults(null);
  };

  const handlePasteNext = async () => {
    if (!canProceedFromPaste) return;
    setSubmitting(true);
    try {
      // Load master resume for scoring
      const corpusRows = await services.resume.list({ kind: 'corpus' });
      const master = corpusRows?.find((r) => r.corpusType === 'master' || r.name === 'Master ATS (bullet bank)');
      if (master?.content) setMasterResume(master.content);

      const job = await services.jobSearch.createManual({
        company: company.trim(),
        role: role.trim(),
        description: jd.trim(),
        url: url.trim() || undefined,
      });
      setJobId(job.id);
      setStep('score');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerate = async () => {
    if (!jobId) return;
    setGenerating(true);
    const out: GeneratedResults = { jobId, company, role };

    try {
      if (includeResume) {
        const { runId } = await services.resume.startResumeTailoring(jobId);
        out.runId = runId;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resume tailoring failed to start');
    }

    try {
      if (includeCoverLetter) {
        const cl = await services.coverLetter.generate(jobId);
        out.coverLetterId = cl.id;
        out.coverLetterContent = cl.content;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cover letter generation failed');
    }

    try {
      if (includeInterviewPrep) {
        const prep = await services.jobSearch.generateInterviewPrep(jobId);
        if (prep) out.interviewPrep = prep;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Interview prep generation failed');
    }

    setResults(out);
    setStep('results');
    setGenerating(false);
  };

  const handleQuickGenerate = async () => {
    if (!canProceedFromPaste) return;
    setSubmitting(true);
    try {
      const job = await services.jobSearch.createManual({
        company: company.trim(),
        role: role.trim(),
        description: jd.trim(),
        url: url.trim() || undefined,
      });
      toast.success(`Job created: ${role.trim()} at ${company.trim()}`);
      const { runId } = await services.resume.startResumeTailoring(job.id);
      reset();
      onOpenChange(false);
      navigate(`/executions/${runId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create job and start tailoring');
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitles: Record<Step, string> = {
    paste: 'Paste Job Description',
    score: 'Pre-flight Match Score',
    generate: 'Generate Package',
    results: 'Results',
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="flex h-[min(90vh,56rem)] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden">
        <DialogHeader className="min-w-0 shrink-0 pr-8">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 shrink-0" />
            Application Package Wizard
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {(['paste', 'score', 'generate', 'results'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    step === s
                      ? 'bg-primary text-primary-foreground'
                      : i < ['paste', 'score', 'generate', 'results'].indexOf(step)
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i < ['paste', 'score', 'generate', 'results'].indexOf(step) ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={`text-xs ${step === s ? 'font-medium' : 'text-muted-foreground'}`}>{stepTitles[s]}</span>
                {i < 3 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <ScrollArea className="min-h-0 min-w-0 flex-1 pr-4">
          {step === 'paste' && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wiz-company">Company</Label>
                  <Input id="wiz-company" placeholder="e.g. Acme Corp" value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wiz-role">Role</Label>
                  <Input id="wiz-role" placeholder="e.g. Senior Software Engineer" value={role} onChange={(e) => setRole(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wiz-url">Job URL (optional)</Label>
                <Input id="wiz-url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wiz-jd">Job Description</Label>
                <Textarea
                  id="wiz-jd"
                  placeholder="Paste the full job description here..."
                  className="min-h-[200px] font-mono text-sm"
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Minimum 50 characters.</p>
              </div>
            </div>
          )}

          {step === 'score' && (
            <div className="space-y-4 py-2">
              {scoreResult ? (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-primary" />
                      <span className="font-medium">Pre-flight Keyword Match</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">{scoreResult.matched.length}/{scoreResult.totalTerms} terms</Badge>
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-lg font-bold text-primary">
                        {scoreResult.score}
                      </div>
                    </div>
                  </div>
                  {scoreResult.missed.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Missing Keywords ({scoreResult.missed.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {scoreResult.missed.slice(0, 20).map((term) => (
                          <Badge key={term} variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">{term}</Badge>
                        ))}
                        {scoreResult.missed.length > 20 && <Badge variant="outline">+{scoreResult.missed.length - 20} more</Badge>}
                      </div>
                    </div>
                  )}
                  <JdMatchPanel jd={jd} resume={masterResume} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Loading master resume for scoring...</p>
              )}
            </div>
          )}

          {step === 'generate' && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Select what to generate for <strong>{role}</strong> at <strong>{company}</strong>.
              </p>
              <div className="space-y-3">
                <div className="flex items-center space-x-2 rounded-lg border border-border p-3">
                  <Checkbox id="gen-resume" checked={includeResume} onCheckedChange={(c) => setIncludeResume(!!c)} disabled />
                  <Label htmlFor="gen-resume" className="flex items-center gap-2 font-normal">
                    <FileText className="h-4 w-4" /> Tailored Resume (PDF) — always included
                  </Label>
                </div>
                <div className="flex items-center space-x-2 rounded-lg border border-border p-3">
                  <Checkbox id="gen-cl" checked={includeCoverLetter} onCheckedChange={(c) => setIncludeCoverLetter(!!c)} />
                  <Label htmlFor="gen-cl" className="flex items-center gap-2 font-normal">
                    <Mail className="h-4 w-4" /> Cover Letter
                  </Label>
                </div>
                <div className="flex items-center space-x-2 rounded-lg border border-border p-3">
                  <Checkbox id="gen-prep" checked={includeInterviewPrep} onCheckedChange={(c) => setIncludeInterviewPrep(!!c)} />
                  <Label htmlFor="gen-prep" className="flex items-center gap-2 font-normal">
                    <MessageSquare className="h-4 w-4" /> Interview Prep Notes
                  </Label>
                </div>
              </div>
            </div>
          )}

          {step === 'results' && results && (
            <div className="space-y-4 py-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Package Generated for {results.role} at {results.company}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {results.runId && (
                    <div className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="text-sm">Tailored Resume</span>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); navigate(`/executions/${results.runId}`); }}>
                        View Execution <ExternalLink className="ml-1 h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {results.coverLetterId && (
                    <div className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-primary" />
                        <span className="text-sm">Cover Letter</span>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); navigate('/cover-letters'); }}>
                        View in Studio <ExternalLink className="ml-1 h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {results.interviewPrep && (
                    <div className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Interview Prep</span>
                      </div>
                      {results.interviewPrep.talkingPoints.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-medium">Talking Points</p>
                          <ul className="list-disc pl-4 text-xs text-muted-foreground">
                            {results.interviewPrep.talkingPoints.slice(0, 3).map((p, i) => <li key={i}>{p}</li>)}
                          </ul>
                        </div>
                      )}
                      <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); navigate('/jobs'); }}>
                        View Full Prep <ExternalLink className="ml-1 h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </ScrollArea>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <div>
            {step === 'score' && (
              <Button variant="outline" onClick={() => setStep('paste')} className="gap-2">
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            )}
            {step === 'generate' && (
              <Button variant="outline" onClick={() => setStep('score')} className="gap-2">
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 'paste' && (
              <>
                <Button variant="outline" onClick={handleQuickGenerate} disabled={!canProceedFromPaste || submitting} className="gap-2">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Quick Generate
                </Button>
                <Button onClick={handlePasteNext} disabled={!canProceedFromPaste || submitting} className="gap-2">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  Next: Score Match
                </Button>
              </>
            )}
            {step === 'score' && (
              <Button onClick={() => setStep('generate')} className="gap-2">
                Continue to Generate <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            {step === 'generate' && (
              <Button onClick={handleGenerate} disabled={generating} className="gap-2">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {generating ? 'Generating...' : 'Generate Package'}
              </Button>
            )}
            {step === 'results' && (
              <Button onClick={() => { reset(); onOpenChange(false); }} className="gap-2">
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
