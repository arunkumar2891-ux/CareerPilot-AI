import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ExternalLink, Rocket } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface SetupStep {
  title: string;
  time: string;
  description: string;
  details: string[];
  action?: { label: string; path: string };
}

const ACCOUNT_STEPS: SetupStep[] = [
  {
    title: 'Sign in',
    time: '1 min',
    description: 'Create an account or log in. CareerPilot provisions your pipeline and automation automatically — resume content comes from your Google Doc.',
    details: [
      'Go to /auth and sign up with email/password, Google, GitHub, or a magic link.',
      'Wait until the dashboard loads. In the background we create: Daily Job Search Pipeline and Daily 7 AM automation.',
      'Empty "Master ATS (bullet bank)" and "2-page template" placeholders are created in Resume Studio — you populate them by syncing your Google Doc.',
    ],
    action: { label: 'Go to Dashboard', path: '/' },
  },
  {
    title: 'Name, title, and contact for resumes',
    time: '2 min',
    description: 'These values are written into the Master ATS and 2-page template headers. Do this before generating a PDF.',
    details: [
      'Settings → Profile → Full Name and Title (e.g. Integration Architect).',
      'On the same page fill Phone, Location, LinkedIn URL, GitHub URL, and PANW start date.',
      'Click Save Profile (writes name/title plus contact) or Save Contact for Resumes. Then open Resume Studio — Master ATS should show real phone/LinkedIn/GitHub, not [Phone Number].',
      'Skip any field you do not want on the resume; blank fields stay as placeholders.',
    ],
    action: { label: 'Open Profile & Contact', path: '/settings' },
  },
  {
    title: 'Confirm the Master ATS corpus',
    time: '1 min',
    description: 'After syncing your Google Doc, confirm chunks appear. The optimizer selects from your real bullets.',
    details: [
      'Open Knowledge Base → Google Doc Sync tab. Paste your Google Doc ID and click Sync Now.',
      'After sync completes, switch to the Search tab — search "66%" or any metric to confirm evidence chunks loaded.',
      'Open Resume Studio → Master ATS (bullet bank) should now show your full resume content.',
      'The ATS optimizer picks 4–6 bullets per project from your synced bullet bank when tailoring.',
    ],
    action: { label: 'Open Knowledge Base', path: '/knowledge' },
  },
  {
    title: 'Set what to search for',
    time: '1 min',
    description: 'Used by Jobs → Run Search and the daily 7 AM automation.',
    details: [
      'Settings → Job Search.',
      'Search Query — match how you want LinkedIn scraped, e.g. "Integration Architect" or "Forward Deployment Engineer".',
      'Location — e.g. "San Francisco, CA" or "Remote".',
      'Max Jobs Per Run — start with 3–5 while you test tailoring.',
      'Settings → Notifications → Summary Email (where daily results go).',
      'Click Save Job Search Settings (and Save on Notifications).',
    ],
    action: { label: 'Job Search Settings', path: '/settings' },
  },
  {
    title: 'Connect Google',
    time: '3 min',
    description: 'Required to sync your master resume from Google Docs and generate knowledge chunks for tailoring.',
    details: [
      'Integrations → Connect Google. Use the Gmail that owns the resume Google Doc.',
      'If you see 403 access_denied, an admin must add your Gmail as an OAuth test user (Google Cloud Console → OAuth consent screen).',
      'Unverified-app warning: Advanced → Go to CareerPilot (unsafe). Normal while the OAuth app is in Testing.',
      'After connecting, go to Knowledge Base → Google Doc Sync and paste your resume Doc ID to pull in your bullets.',
    ],
    action: { label: 'Open Integrations', path: '/integrations' },
  },
  {
    title: 'Check the daily automation',
    time: '1 min',
    description: 'Confirm the built-in workflow exists so a schedule or Run Search can fire.',
    details: [
      'The "Daily Job Search Pipeline" workflow is auto-provisioned on first login.',
      'The "Daily 7 AM Job Search" automation is created with an active status.',
      'ATS Optimizer uses the corpus even if Google Docs is skipped.',
      'Use Jobs → Run Search when you want an immediate pipeline run (needs Apify + Gemini secrets on the server).',
    ],
    action: { label: 'View Executions', path: '/executions' },
  },
  {
    title: 'Tailor one resume, then run search',
    time: '5–15 min',
    description: 'Prove bullet selection on a real JD first; then turn on discovery.',
    details: [
      'Fast path (no scrape): if a job is already on the Jobs board, open it → Generate tailored resume. A new resume named "Tailored: Company Role" appears in Resume Studio.',
      'Full path: Jobs → Run Search. Execution History shows Apify scrape → ATS optimizer → PDF. First scrape can take several minutes.',
      'Sanity-check the tailored text: lead project should match the JD type (e.g. FW-Flex for Integration Architect, Portal for FDE). Numbers like 66% / 278 to 94 must still appear — never invented.',
      'If tailoring fails with "Career corpus not seeded", refresh the app once while signed in, then retry.',
    ],
    action: { label: 'Open Jobs', path: '/jobs' },
  },
];

function StepAccordion({ step, index }: { step: SetupStep; index: number }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-4 px-6 py-5 text-left transition-colors hover:bg-accent/30"
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{step.title}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Done</Badge>
            <span className="text-xs text-muted-foreground">{step.time}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{step.description}</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-6 pb-5 pl-[60px]">
              {step.details.map((detail, i) => (
                <div key={i} className="flex gap-3">
                  <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border border-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{detail}</p>
                </div>
              ))}
              {step.action && (
                <Button
                  size="sm"
                  className="mt-3 gap-1.5"
                  onClick={() => navigate(step.action!.path)}
                >
                  {step.action.label} <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SetupPage() {
  const accountDone = ACCOUNT_STEPS.length;

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Setup Guide" description="Step-by-step instructions for getting CareerPilot AI fully configured" />

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-medium">Your app URL</p>
            <p className="text-xs text-muted-foreground">https://careerpilot-ai-6i93.onrender.com</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Supabase project</p>
            <code className="text-xs font-mono text-muted-foreground">qcywswmrknzwovva1xj1</code>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Rocket className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Your Account ({accountDone}/{accountDone})</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground shrink-0">Account setup progress</span>
          <Progress value={100} className="flex-1 h-2" />
          <span className="text-xs font-semibold text-primary">100%</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Required path: sign in → connect Google → sync resume Doc → contact info → job search query → tailor or Run Search. Expand a step for exact clicks.
        </p>
        <Card>
          <CardContent className="p-0">
            {ACCOUNT_STEPS.map((step, i) => (
              <StepAccordion key={i} step={step} index={i} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
