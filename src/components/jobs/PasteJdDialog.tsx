import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { services } from '@/services';
import { toast } from 'sonner';
import { Loader2, FileText } from 'lucide-react';

interface PasteJdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PasteJdDialog({ open, onOpenChange }: PasteJdDialogProps) {
  const navigate = useNavigate();
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [jd, setJd] = useState('');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = company.trim() && role.trim() && jd.trim().length >= 50;

  const reset = () => {
    setCompany('');
    setRole('');
    setJd('');
    setUrl('');
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Paste Job Description
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paste-company">Company</Label>
              <Input
                id="paste-company"
                placeholder="e.g. Acme Corp"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paste-role">Role</Label>
              <Input
                id="paste-role"
                placeholder="e.g. Senior Software Engineer"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="paste-url">Job URL (optional)</Label>
            <Input
              id="paste-url"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paste-jd">Job Description</Label>
            <Textarea
              id="paste-jd"
              placeholder="Paste the full job description here..."
              className="min-h-[200px] font-mono text-sm"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Minimum 50 characters. The resume will be tailored to this description.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="gap-2">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating & Tailoring...
              </>
            ) : (
              'Create & Tailor Resume'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
