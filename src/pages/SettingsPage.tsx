import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User, Bell, Palette, Key, Sun, Moon, Check, Briefcase, Shield,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
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
import { parseGoogleDocFileId, parseGoogleDriveFolderId } from '@/utils/google';
import { toast } from 'sonner';

export function SettingsPage() {
  const { theme, toggleTheme } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [name, setName] = useState(user?.fullName || '');
  const [title, setTitle] = useState(user?.title || '');
  const [email, setEmail] = useState(user?.email || '');
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
    toast.success('Profile and contact saved — Master ATS header updated');
  };

  const saveContact = async () => {
    await services.settings.update({
      contact: { phone, location, linkedin, github, startDate, email: user?.email || email },
    });
    await services.settings.applyContactToSeededResumes();
    toast.success('Contact written into Master ATS and the 2-page template');
    qc.invalidateQueries({ queryKey: ['settings'] });
    qc.invalidateQueries({ queryKey: ['resumes'] });
  };

  const saveJobSearch = async () => {
    const parsedResumeId = parseGoogleDocFileId(resumeFileId);
    const parsedFolderId = parseGoogleDriveFolderId(driveFolderId);
    setResumeFileId(parsedResumeId);
    setDriveFolderId(parsedFolderId);
    await services.settings.update({
      jobSearch: {
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
        const res = await supabase.functions.invoke('ai-chat', {
          body: { mode: 'sync_google_doc_chunks', fileId },
        });
        if (res.error) throw new Error(res.error.message);
        qc.invalidateQueries({ queryKey: ['resumes'] });
        qc.invalidateQueries({ queryKey: ['knowledge-collections'] });
        toast.success('Job search saved — Google Doc synced to Master ATS');
        return;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Google Doc sync failed — check Integrations');
      }
    }
    toast.success('Job search settings saved');
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Settings" description="Manage your account, preferences, and configuration" />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5"><User className="h-3.5 w-3.5" /> Profile</TabsTrigger>
          <TabsTrigger value="jobsearch" className="gap-1.5"><Briefcase className="h-3.5 w-3.5" /> Job Search</TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5"><Palette className="h-3.5 w-3.5" /> Appearance</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5"><Bell className="h-3.5 w-3.5" /> Notifications</TabsTrigger>
          <TabsTrigger value="api" className="gap-1.5"><Key className="h-3.5 w-3.5" /> API Keys</TabsTrigger>
          <TabsTrigger value="account" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Account</TabsTrigger>
        </TabsList>

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
              <p className="text-xs text-muted-foreground">Save writes these into the Master ATS and 2-page template headers (phone, location, LinkedIn, GitHub, email). Empty fields stay as placeholders.</p>
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
                <p className="text-xs text-muted-foreground">Paste a Google Doc link or the file ID. Synced before each pipeline run.</p>
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
                Searches all work types (on-site, remote, hybrid) in your location. Tailoring uses the in-app Master ATS corpus.
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
                <li><code>GEMINI_API_KEY</code> — Google Gemini API key</li>
                <li><code>GEMINI_MODEL</code> — optional; defaults to <code>gemini-3.6-flash</code></li>
                <li><code>GEMINI_TIMEOUT_MS</code> — optional; default 180000 (3 min)</li>
                <li><code>GEMINI_ATS_TIMEOUT_MS</code> — optional ATS timeout; default 180000, retries once on timeout</li>
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
    </div>
  );
}
