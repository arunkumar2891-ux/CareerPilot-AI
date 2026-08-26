import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  CheckCircle2, Circle, ChevronDown, ExternalLink, Rocket,
  User, Wrench, Copy, ArrowRight,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/store';
import { services } from '@/services';
import { USER_SETUP_STEPS, ADMIN_SETUP_STEPS, type SetupStep } from '@/constants/setup-steps';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ADMIN_DONE_KEY = 'cp-setup-admin-done';

function useAdminDone(): [Set<string>, (id: string, done: boolean) => void] {
  const [done, setDone] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(ADMIN_DONE_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });

  const toggle = (id: string, completed: boolean) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (completed) next.add(id);
      else next.delete(id);
      localStorage.setItem(ADMIN_DONE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  return [done, toggle];
}

function copyText(text: string) {
  navigator.clipboard.writeText(text);
  toast.success('Copied to clipboard');
}

function StepCard({
  step,
  index,
  completed,
  defaultOpen,
  onToggleAdmin,
  showAdminToggle,
}: {
  step: SetupStep;
  index: number;
  completed: boolean;
  defaultOpen?: boolean;
  onToggleAdmin?: (done: boolean) => void;
  showAdminToggle?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={cn('transition-colors', completed && 'border-success/40 bg-success/5')}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none pb-3">
            <div className="flex items-start gap-3">
              <div className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                completed ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
              )}>
                {completed ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{step.title}</CardTitle>
                  {completed && <Badge variant="secondary" className="bg-success/10 text-success">Done</Badge>}
                </div>
                <p className="mt-1 text-sm font-normal text-muted-foreground">{step.summary}</p>
              </div>
              <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 border-t border-border pt-4">
            <ol className="space-y-3">
              {step.substeps.map((sub, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                  <div className="space-y-2">
                    {sub.text && <span>{sub.text}</span>}
                    {sub.link && (
                      <div>
                        <a
                          href={sub.link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {sub.link.label}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {sub.code && (
                      <div className="relative">
                        <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 text-xs">{sub.code}</pre>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1 h-7 w-7"
                          onClick={() => copyText(sub.code!)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              {step.inAppLink && (
                <Button asChild size="sm" className="gap-1.5">
                  <Link to={step.inAppLink.path}>
                    {step.inAppLink.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
              {showAdminToggle && onToggleAdmin && (
                <Button
                  type="button"
                  variant={completed ? 'outline' : 'secondary'}
                  size="sm"
                  onClick={() => onToggleAdmin(!completed)}
                >
                  {completed ? 'Mark incomplete' : 'Mark complete'}
                </Button>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function SetupPage() {
  const user = useAuthStore((s) => s.user);
  const [adminDone, setAdminDone] = useAdminDone();

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => services.settings.get() });
  const { data: integrations } = useQuery({ queryKey: ['integrations'], queryFn: () => services.integration.list() });
  const { data: automations } = useQuery({ queryKey: ['automations'], queryFn: () => services.automation.list() });
  const { data: runs } = useQuery({ queryKey: ['runs'], queryFn: () => services.execution.listRuns() });
  const { data: resumes } = useQuery({ queryKey: ['resumes'], queryFn: () => services.resume.list() });

  const jobSearch = settings?.jobSearch as Record<string, string> | undefined;
  const contact = settings?.contact as Record<string, string> | undefined;
  const googleConnected = integrations?.some((i) => i.name === 'Google Drive' && i.status === 'connected');
  const corpusSeeded = Boolean(resumes?.some((r) => r.name === 'Master ATS (bullet bank)'));

  const userCompletion = useMemo(() => {
    const map: Record<string, boolean> = {
      account: Boolean(user),
      profile: Boolean(user?.fullName && user.fullName !== 'New User'),
      'resume-doc': corpusSeeded && Boolean(contact?.phone || contact?.linkedin || contact?.location),
      'job-search': Boolean(jobSearch?.query && jobSearch?.location),
      google: Boolean(googleConnected) || corpusSeeded,
      pipeline: Boolean(automations && automations.length > 0),
      'first-run': Boolean(runs && runs.length > 0),
    };
    return map;
  }, [user, jobSearch, contact, googleConnected, automations, runs, corpusSeeded]);

  const userDoneCount = USER_SETUP_STEPS.filter((s) => userCompletion[s.id]).length;
  const userProgress = Math.round((userDoneCount / USER_SETUP_STEPS.length) * 100);

  const adminDoneCount = ADMIN_SETUP_STEPS.filter((s) => adminDone.has(s.id)).length;
  const adminProgress = Math.round((adminDoneCount / ADMIN_SETUP_STEPS.length) * 100);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'YOUR_PROJECT_REF';

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Setup Guide"
        description="Step-by-step checklist to get CareerPilot running — for new users and platform admins."
        actions={
          <Button asChild variant="outline" className="gap-2">
            <Link to="/jobs">
              <Rocket className="h-4 w-4" />
              Run Job Search
            </Link>
          </Button>
        }
      />

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Your app URL</p>
            <p className="text-sm text-muted-foreground">https://careerpilot-ai-6i93.onrender.com</p>
          </div>
          <div className="text-sm text-muted-foreground">
            Supabase project: <code className="rounded bg-muted px-1.5 py-0.5">{projectRef}</code>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="user">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="user" className="gap-1.5">
            <User className="h-3.5 w-3.5" />
            Your Account ({userDoneCount}/{USER_SETUP_STEPS.length})
          </TabsTrigger>
          <TabsTrigger value="admin" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Platform Setup ({adminDoneCount}/{ADMIN_SETUP_STEPS.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="user" className="mt-6 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Account setup progress</span>
              <span className="font-medium">{userProgress}%</span>
            </div>
            <Progress value={userProgress} className="h-2" />
          </div>

          <p className="text-sm text-muted-foreground">
            Complete these steps in order. Steps with a green check are detected automatically from your account.
          </p>

          <div className="space-y-3">
            {USER_SETUP_STEPS.map((step, i) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <StepCard
                  step={step}
                  index={i}
                  completed={Boolean(userCompletion[step.id])}
                  defaultOpen={!userCompletion[step.id] && (i === 0 || Boolean(userCompletion[USER_SETUP_STEPS[i - 1]?.id]))}
                />
              </motion.div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="admin" className="mt-6 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Platform setup progress</span>
              <span className="font-medium">{adminProgress}%</span>
            </div>
            <Progress value={adminProgress} className="h-2" />
          </div>

          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              <p>
                These steps are for whoever deployed CareerPilot (Supabase + Render). API keys live in
                {' '}<strong>Supabase Edge Function secrets</strong> — never in the browser or Render env vars.
              </p>
              <p className="mt-2">
                Mark each step complete when done. Replace <code>YOUR_REF</code> with <code>{projectRef}</code> in commands.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {ADMIN_SETUP_STEPS.map((step, i) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <StepCard
                  step={step}
                  index={i}
                  completed={adminDone.has(step.id)}
                  defaultOpen={i === 0}
                  showAdminToggle
                  onToggleAdmin={(done) => setAdminDone(step.id, done)}
                />
              </motion.div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
