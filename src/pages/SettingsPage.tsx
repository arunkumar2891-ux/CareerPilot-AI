import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  User, Bell, CreditCard, Shield, Palette, Key, Database,
  Sun, Moon, Mail, Chrome, Github, Check,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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

  const saveProfile = async () => {
    await services.user.updateProfile({ fullName: name, title, email });
    qc.invalidateQueries({ queryKey: ['profile'] });
    toast.success('Profile saved');
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Settings" description="Manage your account, preferences, and configuration" />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5"><User className="h-3.5 w-3.5" /> Profile</TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5"><Palette className="h-3.5 w-3.5" /> Appearance</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5"><Bell className="h-3.5 w-3.5" /> Notifications</TabsTrigger>
          <TabsTrigger value="billing" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Billing</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Security</TabsTrigger>
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
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <Button onClick={saveProfile} className="gap-2"><Check className="h-4 w-4" /> Save Changes</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Connected Accounts</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { name: 'Google', icon: Chrome, connected: true },
                { name: 'GitHub', icon: Github, connected: true },
                { name: 'Email', icon: Mail, connected: true },
              ].map((a) => (
                <div key={a.name} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <a.icon className="h-5 w-5 text-muted-foreground" />
                  <span className="flex-1 text-sm font-medium">{a.name}</span>
                  {a.connected ? <Badge variant="secondary" className="gap-1 text-success"><Check className="h-3 w-3" /> Connected</Badge> : <Button variant="outline" size="sm">Connect</Button>}
                </div>
              ))}
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
                    <p className="text-xs text-muted-foreground">Toggle between light and dark themes</p>
                  </div>
                </div>
                <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Notification Preferences</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Email notifications', desc: 'Receive notifications via email' },
                { label: 'Push notifications', desc: 'Browser push notifications' },
                { label: 'Daily summaries', desc: 'Daily job search summary at 9am' },
                { label: 'Application reminders', desc: 'Reminders for pending applications' },
                { label: 'Interview reminders', desc: 'Reminders before scheduled interviews' },
                { label: 'Workflow failures', desc: 'Alerts when workflows fail' },
                { label: 'Slack notifications', desc: 'Send critical alerts to Slack' },
              ].map((n, i) => (
                <div key={n.label} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div><p className="text-sm font-medium">{n.label}</p><p className="text-xs text-muted-foreground">{n.desc}</p></div>
                  <Switch defaultChecked={i < 5} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Subscription</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div>
                  <Badge variant="secondary" className="mb-2 bg-primary/15 text-primary">Pro Plan</Badge>
                  <p className="text-sm text-muted-foreground">5,000 AI credits / month</p>
                </div>
                <p className="text-2xl font-semibold">$29<span className="text-sm text-muted-foreground">/mo</span></p>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">AI Credits Used</span><span className="font-medium">{user?.aiCreditsUsed} / {user?.aiCreditsTotal}</span></div>
                <div className="mt-2 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${((user?.aiCreditsUsed || 0) / (user?.aiCreditsTotal || 1)) * 100}%` }} /></div>
              </div>
              <Button variant="outline" className="mt-4">Upgrade to Enterprise</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Security</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5"><Label>Current Password</Label><Input type="password" placeholder="••••••••" /></div>
              <div className="space-y-1.5"><Label>New Password</Label><Input type="password" placeholder="••••••••" /></div>
              <Button>Update Password</Button>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div><p className="text-sm font-medium">Two-Factor Authentication</p><p className="text-xs text-muted-foreground">Add an extra layer of security</p></div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">API Keys</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { name: 'Production API Key', key: 'cp_live_xxxxxxxxxxxx', created: '2024-01-15' },
                { name: 'Development API Key', key: 'cp_test_xxxxxxxxxxxx', created: '2024-03-20' },
              ].map((k) => (
                <div key={k.name} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{k.name}</p>
                    <Button variant="ghost" size="sm">Revoke</Button>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{k.key}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Created {k.created}</p>
                </div>
              ))}
              <Button variant="outline" className="gap-2"><Key className="h-4 w-4" /> Generate New Key</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
