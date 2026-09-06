import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Download, Sparkles, FileCheck, Cloud, CloudUpload, TrendingUp, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { services } from '@/services';
import { toast } from 'sonner';
import type { AtsReview, Resume } from '@/types';

export function ResumeEditor({
  resume,
  onClose,
  onResumeUpdated,
  showDriveSync = true,
  showGenerateTailored = false,
}: {
  resume: Resume | null;
  onClose: () => void;
  onResumeUpdated: () => void;
  showDriveSync?: boolean;
  showGenerateTailored?: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [atsScore, setAtsScore] = useState(0);
  const [atsReview, setAtsReview] = useState<AtsReview | undefined>();
  const [driveFileId, setDriveFileId] = useState<string | undefined>();
  const [scoring, setScoring] = useState(false);
  const [openingCopilot, setOpeningCopilot] = useState(false);
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [activeTab, setActiveTab] = useState('edit');

  useEffect(() => {
    if (!resume) return;
    setContent('');
    setAtsScore(resume.atsScore);
    setAtsReview(resume.atsReview);
    setDriveFileId(resume.driveFileId);
    setActiveTab('edit');
  }, [resume?.id, resume?.atsScore, resume?.atsReview, resume?.driveFileId]);

  if (!resume) return null;
  const displayContent = content || resume.content;

  const save = async () => {
    await services.resume.update(resume.id, displayContent);
    toast.success('Resume saved');
    qc.invalidateQueries({ queryKey: ['resumes'] });
    onResumeUpdated();
    onClose();
  };

  const scoreATS = async () => {
    setScoring(true);
    try {
      const review = await services.ats.score(displayContent);
      await services.resume.updateAtsReview(resume.id, review, displayContent);
      setAtsScore(review.score);
      setAtsReview(review);
      await qc.invalidateQueries({ queryKey: ['resumes'] });
      onResumeUpdated();
      setActiveTab('ats-review');
      toast.success(`ATS Score: ${review.score}/100`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ATS scoring failed');
    } finally {
      setScoring(false);
    }
  };

  const discussAtsReview = async () => {
    if (!atsReview) return;
    setOpeningCopilot(true);
    try {
      const conversation = await services.chat.openResumeImprovement(resume.id);
      await qc.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
      navigate(`/copilot?conversation=${encodeURIComponent(conversation.id)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the ATS review conversation');
    } finally {
      setOpeningCopilot(false);
    }
  };

  const exportResume = () => {
    const safeName = resume.name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'resume';
    const blob = new Blob([displayContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeName}.md`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Resume exported');
  };

  const downloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      if (content && content !== resume.content) {
        await services.resume.update(resume.id, displayContent);
      }
      await services.resume.downloadPdf(resume.id, displayContent);
      toast.success('PDF downloaded');
      onResumeUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PDF download failed');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const copyToDrive = async () => {
    setSyncingDrive(true);
    try {
      if (content && content !== resume.content) {
        await services.resume.update(resume.id, displayContent);
      }
      const result = await services.resume.syncToDrive(resume.id, displayContent);
      setDriveFileId(result.driveFileId);
      await qc.invalidateQueries({ queryKey: ['resumes'] });
      onResumeUpdated();
      toast.success(driveFileId ? 'Resume updated on Google Drive' : 'Resume copied to Google Drive');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Google Drive sync failed');
    } finally {
      setSyncingDrive(false);
    }
  };

  return (
    <Dialog open={!!resume} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {resume.name}
            <Badge variant="secondary" className="ml-2">ATS {atsScore}</Badge>
            {driveFileId && (
              <Badge variant="outline" className="ml-1 gap-1">
                <Cloud className="h-3 w-3" /> Drive
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="edit">Markdown Editor</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="pdf">PDF View</TabsTrigger>
            <TabsTrigger value="ats-review" disabled={!atsReview}>ATS Review</TabsTrigger>
          </TabsList>
          <TabsContent value="edit" className="mt-4">
            <Textarea
              rows={18}
              value={displayContent}
              onChange={(e) => setContent(e.target.value)}
              className="font-mono text-sm scrollbar-thin"
            />
          </TabsContent>
          <TabsContent value="preview" className="mt-4">
            <div className="max-h-[55vh] overflow-y-auto scrollbar-thin rounded-lg border border-border bg-white p-8 text-black dark:bg-white">
              <MarkdownPreview content={displayContent} />
            </div>
          </TabsContent>
          <TabsContent value="pdf" className="mt-4">
            <div className="flex h-[55vh] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
              <div className="text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">Generate and download a PDF from your resume content</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-2"
                  disabled={downloadingPdf}
                  onClick={downloadPdf}
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloadingPdf ? 'Generating…' : 'Download PDF'}
                </Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="ats-review" className="mt-4">
            {atsReview ? (
              <div className="max-h-[55vh] space-y-5 overflow-y-auto scrollbar-thin pr-1">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Latest ATS score</p>
                  <p className="mt-1 text-3xl font-semibold text-primary">{atsReview.score}<span className="text-base text-muted-foreground">/100</span></p>
                  <p className="mt-2 text-xs text-muted-foreground">Scored {new Date(atsReview.scoredAt).toLocaleString()}</p>
                </div>

                <ReviewSection title="Feedback" items={atsReview.feedback} />
                <ReviewSection title="Suggested improvements" items={atsReview.suggestions} />

                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm font-medium">Choose how to apply this review</p>
                  <p className="mt-1 text-sm text-muted-foreground">Edit the Markdown tab yourself, or continue in a resume-linked Copilot conversation. The conversation is saved so you can return to it later.</p>
                  <Button
                    className="mt-3 gap-2"
                    onClick={discussAtsReview}
                    disabled={openingCopilot}
                  >
                    <MessageSquare className="h-4 w-4" />
                    {openingCopilot ? 'Opening Copilot…' : 'Discuss in Copilot'}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Run Score ATS to save a review for this resume.</p>
            )}
          </TabsContent>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button onClick={save} className="gap-2"><FileCheck className="h-4 w-4" /> Save</Button>
          <Button variant="outline" onClick={scoreATS} disabled={scoring} className="gap-2">
            <Sparkles className="h-4 w-4" /> {scoring ? 'Scoring…' : 'Score ATS'}
          </Button>
          {showDriveSync && (
            <Button variant="outline" onClick={copyToDrive} disabled={syncingDrive} className="gap-2">
              <CloudUpload className="h-4 w-4" />
              {syncingDrive ? 'Syncing…' : driveFileId ? 'Sync to Drive' : 'Copy to Google Drive'}
            </Button>
          )}
          {showGenerateTailored && (
            <Button variant="outline" className="gap-2"><TrendingUp className="h-4 w-4" /> Generate Tailored</Button>
          )}
          <Button variant="ghost" onClick={exportResume} className="ml-auto gap-2"><Download className="h-4 w-4" /> Export</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReviewSection({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-bold">{line.slice(2)}</h1>;
        if (line.startsWith('## ')) return <h2 key={i} className="mt-4 text-lg font-semibold">{line.slice(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={i} className="mt-3 text-base font-medium">{line.slice(4)}</h3>;
        if (line.startsWith('- ')) return <li key={i} className="ml-4 list-disc text-sm">{line.slice(2)}</li>;
        if (line.trim() === '') return <div key={i} className="h-2" />;
        return <p key={i} className="text-sm leading-relaxed">{line}</p>;
      })}
    </div>
  );
}
