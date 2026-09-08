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
import { hasGoogleDocResumeId } from '@/utils/google';

const EXEMPT_PREFIXES = ['/settings', '/setup'];

export function RequireGoogleDocGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: settings, isFetched } = useQuery({
    queryKey: ['settings'],
    queryFn: () => services.settings.get(),
  });

  const exempt = EXEMPT_PREFIXES.some((path) => location.pathname.startsWith(path));
  const missing = isFetched && !hasGoogleDocResumeId(settings);
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
          <DialogTitle>Google Doc Resume ID required</DialogTitle>
          <DialogDescription>
            CareerPilot needs your Master ATS Google Doc as the source of truth before job search,
            workflows, or resume tailoring can run. Add the document ID in Settings → Job Search.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => navigate('/settings?tab=jobsearch')}>
            Add Google Doc ID
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
