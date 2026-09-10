import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  User, Bell, Palette, Key, Sun, Moon, Check, Briefcase, Shield,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FadeIn } from '@/components/motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUIStore, useAuthStore } from '@/store';
import { services } from '@/services';
import { supabase } from '@/lib/supabase';
import { JOB_POSTED_WITHIN_OPTIONS, DEFAULT_JOB_POSTED_WITHIN } from '@/constants';
import { parseGoogleDocFileId, parseGoogleDriveFolderId, googleDocResumeFileId } from '@/utils/google';
import { toast } from 'sonner';

export function SettingsPage() {
  const { theme, toggleTheme } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [name, setName] = useState(user?.fullName || '');
  const [title, setTitle] = useState(user?.title || '');
  const [email] = useState(user?.email || '');
  const [jobQuery, setJobQuery] = useState('AI Product Manager');
  const [jobLocation, setJobLocation] = useState('San Francisco, CA');
  const [maxJobs, setMaxJobs] = useState('5');
  const [postedWithin, setPostedWithin] = useState(DEFAULT_JOB_POSTED_WITHIN);
  const [resumeFileId, setResumeFileId] = useState('');
  const [driveFolderId, setDriveFolderId] = useState('');
  const [notifyEmail, setNotifyEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [github, setGithub] = useState('');
  const [startDate, setStartDate] = useState('');

  const [searchParams, setSearchParams] = useSearchParams();
  const settingsTab = searchParams.get('tab') || 'profile';

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => services.settings.get() });

  useEffect(() => {
    if (settings) {
      const js = settings.jobSearch as Record<string, string> | undefined;
      const notif = settings.notifications as Record<string, string> | undefined;
      if (js?.query) setJobQuery(js.query);
      if (js?.location) setJobLocation(js.location);
      if (js?.maxJobs) setMaxJobs(js.maxJobs);
      if (js?.postedWithin) setPostedWithin(js.postedWithin);
      else setPostedWithin(DEFAULT_JOB_POSTED_WITHIN);
      if (js?.resumeFileId) setResumeFileId(js.resumeFileId);
      else setResumeFileId('');
      setDriveFolderId(js?.driveFolderId ?? '');
      if (notif?.email) setNotifyEmail(notif.email);
      const contact = settings.contact as Record<string, string> | undefined;
      if (contact?.phone) setPhone(contact.phone);
      if (contact?.location) setLocation(contact.location);
      if (contact?.linkedin) setLinkedin(contact.linkedin);
      if (contact?.github) setGithub(contact.github);
      if (contact?.startDate) setStartDate(contact.startDate);
    }
  }, [settings]);

  const saveProfile = async () => {
    await services.user.updateProfile({ fullName: name, title });
    await services.settings.update({
      contact: { phone, location, linkedin, github, startDate, email: user?.email || email },
    });
    await services.settings.applyContactToSeededResumes();
    qc.invalidateQueries({ queryKey: ['profile'] });
    qc.invalidateQueries({ queryKey: ['settings'] });
    qc.invalidateQueries({ queryKey: ['resumes'] });
    toast.success('Profile and contact saved — master resume header updated');
  };

  const saveContact = async () => {
    await services.settings.update({
      contact: { phone, location, linkedin, github, startDate, email: user?.email || email },
    });
    await services.settings.applyContactToSeededResumes();
    toast.success('Contact written into the master resume');
    qc.invalidateQueries({ queryKey: ['settings'] });
    qc.invalidateQueries({ queryKey: ['resumes'] });
  };

  const saveJobSearch = async () => {
    const parsedResumeId = parseGoogleDocFileId(resumeFileId);
    const parsedFolderId = parseGoogleDriveFolderId(driveFolderId);
    setResumeFileId(parsedResumeId);
    setDriveFolderId(parsedFolderId);
    const previousJobSearch = (settings?.jobSearch as Record<string, unknown> | undefined) || {};
    const previousId = googleDocResumeFileId(settings);
    const fileIdChanged = Boolean(parsedResumeId) && parsedResumeId !== previousId;
    await services.settings.update({
      jobSearch: {
        ...previousJobSearch,
        query: jobQuery,
        location: jobLocation,
        maxJobs,
        postedWithin,
        resumeFileId: parsedResumeId,
        driveFolderId: parsedFolderId,
      },
      notifications: { email: notifyEmail },
      userEmail: notifyEmail,
    });
    const fileId = parsedResumeId;
    if (fileId) {
      try {
        await services.resume.syncGoogleDocCorpus({ fileId });
        qc.invalidateQueries({ queryKey: ['resumes'] });
        qc.invalidateQueries({ queryKey: ['knowledge-collections'] });
        qc.invalidateQueries({ queryKey: ['settings'] });
        toast.success(
          fileIdChanged
            ? 'Job search saved — Google Doc synced to your master resume'
            : 'Job search saved — Google Doc synced',
        );
        return;
      } catch (err) {
        toast.error(
          `${err instanceof Error ? err.message : 'Google Doc sync failed — check Integrations'} Job search settings were still saved.`,
        );
        return;
      }
    }
    toast.success('Job search settings saved');
  };

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <PageHeader title="Settings" description="Manage your account, preferences, and configuration" />

      <FadeIn>
      <Tabs
        value={settingsTab}
        onValueChange={(value) => {
          if (value === 'profile') setSearchParams({});
          else setSearchParams({ tab: value });
        }}
      >
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="inline-flex w-max min-w-full sm:min-w-0">
          <TabsTrigger value="profile" className="gap-1.5"><User className="h-3.5 w-3.5" /> Profile</TabsTrigger>
          <TabsTrigger value="jobsearch" className="gap-1.5"><Briefcase className="h-3.5 w-3.5" /> Job Search</TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5"><Palette className="h-3.5 w-3.5" /> Appearance</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5"><Bell className="h-3.5 w-3.5" /> Notifications</TabsTrigger>
          <TabsTrigger value="api" className="gap-1.5"><Key className="h-3.5 w-3.5" /> API Keys</TabsTrigger>
          <TabsTrigger value="account" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Account</TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Profile Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Full Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} disabled /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 …" /></div>
                <div className="space-y-1.5"><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, State" /></div>
                <div className="space-y-1.5"><Label>LinkedIn URL</Label><Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/…" /></div>
                <div className="space-y-1.5"><Label>GitHub URL</Label><Input value={github} onChange={(e) => setGithub(e.target.value)} placeholder="https://github.com/…" /></div>
                <div className="space-y-1.5"><Label>PANW start date</Label><Input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="e.g. Jan 2021" /></div>
              </div>
              <p className="text-xs text-muted-foreground">Save writes these into the master resume header (phone, location, LinkedIn, GitHub, email). Empty fields stay as placeholders.</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveProfile} className="gap-2"><Check className="h-4 w-4" /> Save Profile</Button>
                <Button variant="outline" onClick={saveContact} className="gap-2"><Check className="h-4 w-4" /> Save Contact for Resumes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobsearch" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Job Search Pipeline Config</CardTitle>
              <p className="text-sm text-muted-foreground">Used by the built-in Daily Job Search Pipeline (auto-provisioned on login).</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Search Query</Label>
                <Input value={jobQuery} onChange={(e) => setJobQuery(e.target.value)} placeholder="Forward Deployed Engineer" />
                <p className="text-xs text-muted-foreground">
                  Job title keywords sent to LinkedIn (e.g. Forward Deployed Engineer). Short aliases like FDE work too. Irrelevant results are filtered after scrape.
                </p>
              </div>
              <div className="space-y-1.5"><Label>Location</Label><Input value={jobLocation} onChange={(e) => setJobLocation(e.target.value)} placeholder="San Francisco, CA" /></div>
              <div className="space-y-1.5">
                <Label>Posted within</Label>
                <Select value={postedWithin} onValueChange={setPostedWithin}>
                  <SelectTrigger><SelectValue placeholder="Past 24 hours" /></SelectTrigger>
                  <SelectContent>
                    {JOB_POSTED_WITHIN_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">LinkedIn time filter for each pipeline run. Default is past 24 hours.</p>
              </div>
              <div className="space-y-1.5"><Label>Max Jobs Per Run</Label><Input value={maxJobs} onChange={(e) => setMaxJobs(e.target.value)} type="number" /></div>
              <div className="space-y-1.5">
                <Label>Google Doc Resume ID</Label>
                <Input value={resumeFileId} onChange={(e) => setResumeFileId(e.target.value)} placeholder="docs.google.com/document/d/FILE_ID/edit" />
                <p className="text-xs text-muted-foreground">Paste a Google Docs link (docs.google.com/document/d/…), a Drive file link, or the file ID. Native Docs work best. A Drive PDF or Word file is also accepted. Saving replaces your master resume and career evidence chunks.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Google Drive folder for PDFs</Label>
                <Input
                  value={driveFolderId}
                  onChange={(e) => setDriveFolderId(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/FOLDER_ID"
                />
                <p className="text-xs text-muted-foreground">
                  Paste a folder link or folder ID — same as the resume Doc field. PDFs are named Company_YourName_Role_ddmmyyyy.pdf. Change anytime and Save.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Searches all work types (on-site, remote, hybrid) in your location. Tailoring uses your master resume, or a matching role-specific resume when one exists.
              </p>
              <Button onClick={saveJobSearch} className="gap-2"><Check className="h-4 w-4" /> Save Job Search Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Theme</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="flex items-center gap-3">
                  {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                  <div>
                    <p className="text-sm font-medium">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
                  </div>
                </div>
                <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Email Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5"><Label>Summary Email</Label><Input type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} /></div>
              <Button onClick={saveJobSearch} className="gap-2"><Check className="h-4 w-4" /> Save</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Server-Side API Keys</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Configure these as Supabase Edge Function secrets (Dashboard → Edge Functions → Secrets):</p>
              <ul className="list-disc space-y-1 pl-5">
                <li><code>APIFY_TOKEN</code> — Apify API token</li>
                <li><code>GEMINI_API_KEY</code> — Google Gemini API key (primary account)</li>
                <li><code>GEMINI_API_KEY_FALLBACK</code> — second Gemini key (second account; used when primary is rate-limited)</li>
                <li><code>GEMINI_MODEL</code> — optional; defaults to <code>gemini-3.6-flash</code></li>
                <li><code>GROQ_API_KEY</code> — Groq API key (third fallback after both Gemini keys)</li>
                <li><code>GROQ_MODEL</code> — optional; defaults to <code>openai/gpt-oss-120b</code></li>
                <li><code>AI_TIMEOUT_MS</code> — optional chat timeout; default 30000</li>
                <li><code>AI_ATS_TIMEOUT_MS</code> — optional ATS timeout; default 40000 (keep total under 150s edge limit)</li>
                <li><code>AI_FORCE_GROQ</code> — set to <code>true</code> to use Groq after both Gemini keys (timeout / 429 / 5xx). Requires <code>GROQ_API_KEY</code></li>
                <li><code>AI_MAX_RETRIES</code> — optional; only used when <code>AI_GEMINI_RETRY_ENABLED=true</code></li>
                <li><code>AI_GEMINI_RETRY_ENABLED</code> — optional; default off — one Gemini attempt per key, then next provider</li>
                <li><code>RESEND_API_KEY</code> — Resend email API key</li>
                <li><code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> — Google OAuth</li>
                <li><code>SUPABASE_SERVICE_ROLE_KEY</code> — Service role key</li>
                <li><code>WORKFLOW_SCHEDULER_SECRET</code> — Cron auth token</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Your Account</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{user?.fullName || 'User'}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary capitalize">{user?.plan || 'free'} plan</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Change Password</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Send a password reset link to your email address.</p>
              <Button
                variant="outline"
                onClick={async () => {
                  if (!user?.email) return;
                  const { error } = await supabase.auth.resetPasswordForEmail(user.email);
                  if (error) toast.error(error.message);
                  else toast.success('Password reset link sent to ' + user.email);
                }}
              >
                Send Reset Link
              </Button>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader><CardTitle className="text-base text-destructive">Danger Zone</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-4">
                <div>
                  <p className="text-sm font-medium">Sign Out of All Devices</p>
                  <p className="text-xs text-muted-foreground">Invalidate all active sessions.</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    await supabase.auth.signOut({ scope: 'global' });
                    toast.success('Signed out everywhere');
                    window.location.href = '/auth';
                  }}
                >
                  Sign Out All
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </FadeIn>
    </div>
  );
}
