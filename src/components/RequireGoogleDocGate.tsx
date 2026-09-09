import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { services } from '@/services';
import { hasUsableMasterResume } from '@/utils/resume-classification';

const EXEMPT_PREFIXES = ['/settings', '/setup', '/corpus'];

export function RequireGoogleDocGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: resumes, isFetched } = useQuery({
    queryKey: ['resumes', 'corpus'],
    queryFn: () => services.resume.list({ kind: 'corpus' }),
  });

  const exempt = EXEMPT_PREFIXES.some((path) => location.pathname.startsWith(path));
  const missing = isFetched && !hasUsableMasterResume(resumes || []);
  const open = missing && !exempt;

  return (
    <Dialog open={open}>
      <DialogContent
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="[&>button]:hidden"
      >
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Master resume required</DialogTitle>
          <DialogDescription>
            Add a master resume before job search, workflows, or resume tailoring.
            Sync a Google Doc, upload a PDF/DOCX/MD file, or paste the text on the Corpus page.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => navigate('/corpus')}>
            Add master resume
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
