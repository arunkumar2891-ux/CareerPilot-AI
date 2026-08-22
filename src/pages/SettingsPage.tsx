import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User, Bell, Palette, Key, Sun, Moon, Check, Briefcase,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useUIStore, useAuthStore } from '@/store';
import { services } from '@/services';
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
  const [resumeFileId, setResumeFileId] = useState('');
  const [notifyEmail, setNotifyEmail] = useState(user?.email || '');

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => services.settings.get() });

  useEffect(() => {
    if (settings) {
      const js = settings.jobSearch as Record<string, string> | undefined;
      const notif = settings.notifications as Record<string, string> | undefined;
      if (js?.query) setJobQuery(js.query);
      if (js?.location) setJobLocation(js.location);
      if (js?.maxJobs) setMaxJobs(js.maxJobs);
      if (js?.resumeFileId) setResumeFileId(js.resumeFileId);
      if (notif?.email) setNotifyEmail(notif.email);
    }
  }, [settings]);

  const saveProfile = async () => {
    await services.user.updateProfile({ fullName: name, title });
    qc.invalidateQueries({ queryKey: ['profile'] });
    toast.success('Profile saved');
  };

  const saveJobSearch = async () => {
    await services.settings.update({
      jobSearch: { query: jobQuery, location: jobLocation, maxJobs, resumeFileId },
      notifications: { email: notifyEmail },
      userEmail: notifyEmail,
    });
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
              <Button onClick={saveProfile} className="gap-2"><Check className="h-4 w-4" /> Save Changes</Button>
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
              <div className="space-y-1.5"><Label>Search Query</Label><Input value={jobQuery} onChange={(e) => setJobQuery(e.target.value)} placeholder="AI Product Manager" /></div>
              <div className="space-y-1.5"><Label>Location</Label><Input value={jobLocation} onChange={(e) => setJobLocation(e.target.value)} placeholder="San Francisco, CA" /></div>
              <div className="space-y-1.5"><Label>Max Jobs Per Run</Label><Input value={maxJobs} onChange={(e) => setMaxJobs(e.target.value)} type="number" /></div>
              <div className="space-y-1.5"><Label>Google Doc Resume ID</Label><Input value={resumeFileId} onChange={(e) => setResumeFileId(e.target.value)} placeholder="YOUR_GOOGLE_DOC_RESUME_ID" /></div>
              <p className="text-xs text-muted-foreground">API keys (Apify, Gemini, Resend) are configured as Supabase Edge Function secrets — not stored in the browser.</p>
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
                <li><code>RESEND_API_KEY</code> — Resend email API key</li>
                <li><code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> — Google OAuth</li>
                <li><code>SUPABASE_SERVICE_ROLE_KEY</code> — Service role key</li>
                <li><code>WORKFLOW_SCHEDULER_SECRET</code> — Cron auth token</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
