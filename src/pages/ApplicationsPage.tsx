import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Plus, FileText, Building2, Calendar, User, StickyNote,
  Paperclip, ChevronRight, Filter, Inbox,
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { services } from '@/services';
import { APPLICATION_STATUSES } from '@/constants';
import { formatDate, timeAgo } from '@/utils';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import type { Application } from '@/types';

export function ApplicationsPage() {
  const qc = useQueryClient();
  const { data: apps } = useQuery({ queryKey: ['applications'], queryFn: () => services.application.list() });
  const [selected, setSelected] = useState<Application | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newApp, setNewApp] = useState({ company: '', role: '', recruiter: '', notes: '' });

  const create = async () => {
    await services.application.create({ company: newApp.company, role: newApp.role, recruiter: newApp.recruiter, notes: newApp.notes });
    toast.success('Application created');
    setShowCreate(false);
    setNewApp({ company: '', role: '', recruiter: '', notes: '' });
    qc.invalidateQueries({ queryKey: ['applications'] });
  };

  const statusCounts = APPLICATION_STATUSES.map((s) => ({ status: s, count: (apps || []).filter((a) => a.status === s).length }));

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Applications"
        description="Track every application from submission to offer"
        actions={
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Add Application</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Application</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5"><Label>Company</Label><Input value={newApp.company} onChange={(e) => setNewApp({ ...newApp, company: e.target.value })} placeholder="Stripe" /></div>
                <div className="space-y-1.5"><Label>Role</Label><Input value={newApp.role} onChange={(e) => setNewApp({ ...newApp, role: e.target.value })} placeholder="Senior Frontend Engineer" /></div>
                <div className="space-y-1.5"><Label>Recruiter (optional)</Label><Input value={newApp.recruiter} onChange={(e) => setNewApp({ ...newApp, recruiter: e.target.value })} placeholder="Sarah Chen" /></div>
                <div className="space-y-1.5"><Label>Notes</Label><Textarea value={newApp.notes} onChange={(e) => setNewApp({ ...newApp, notes: e.target.value })} rows={3} /></div>
              </div>
              <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {statusCounts.map((s, i) => (
          <motion.div key={s.status} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground capitalize">{s.status}</p>
              <p className="mt-1 text-xl font-semibold">{s.count}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">All Applications</TabsTrigger>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-2">
          {(!apps || apps.length === 0) ? (
            <Card><CardContent><EmptyState icon={Inbox} title="No applications yet" description="Add your first application to start tracking your job search progress." /></CardContent></Card>
          ) : apps.map((app, i) => (
            <motion.div key={app.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="cursor-pointer transition-colors hover:bg-accent/30" onClick={() => setSelected(app)}>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{app.company}</p>
                      <span className="text-muted-foreground">·</span>
                      <p className="text-sm text-muted-foreground">{app.role}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(app.applicationDate)}</span>
                      {app.recruiter && <span className="flex items-center gap-1"><User className="h-3 w-3" />{app.recruiter}</span>}
                      <span>{app.timeline.length} events</span>
                    </div>
                  </div>
                  <StatusBadge status={app.status} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </TabsContent>

        <TabsContent value="board" className="overflow-x-auto">
          {(!apps || apps.length === 0) ? (
            <Card><CardContent><EmptyState icon={Inbox} title="No applications yet" description="Add an application to see it on the board." /></CardContent></Card>
          ) : (
          <div className="flex gap-4">
            {APPLICATION_STATUSES.slice(0, 6).map((status) => (
              <div key={status} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{status}</span>
                  <Badge variant="secondary">{(apps || []).filter((a) => a.status === status).length}</Badge>
                </div>
                <div className="space-y-2">
                  {(apps || []).filter((a) => a.status === status).map((app) => (
                    <Card key={app.id} className="cursor-pointer p-3 transition-colors hover:bg-accent/30" onClick={() => setSelected(app)}>
                      <p className="text-sm font-semibold">{app.company}</p>
                      <p className="text-xs text-muted-foreground">{app.role}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{timeAgo(app.applicationDate)}</p>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
          )}
        </TabsContent>

        <TabsContent value="stats">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Applications Over Time</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={Array.from({ length: 14 }, (_, i) => ({ day: `${i + 1}`, apps: Math.floor(Math.random() * 5) }))}>
                    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} /><stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="apps" stroke="hsl(var(--chart-1))" fill="url(#ag)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Status Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={statusCounts.filter((s) => s.count > 0)} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                      {['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--success))', 'hsl(var(--destructive))'].map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {selected && <ApplicationDetail app={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ApplicationDetail({ app, onClose }: { app: Application; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(app.status);

  const updateStatus = async (newStatus: Application['status']) => {
    await services.application.updateStatus(app.id, newStatus);
    setStatus(newStatus);
    toast.success(`Status updated to ${newStatus}`);
    qc.invalidateQueries({ queryKey: ['applications'] });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> {app.company}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{app.role}</span>
            <StatusBadge status={status} />
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-muted-foreground">Applied</p><p className="font-medium">{formatDate(app.applicationDate)}</p></div>
            <div><p className="text-xs text-muted-foreground">Recruiter</p><p className="font-medium">{app.recruiter || '—'}</p></div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Update Status</p>
            <Select value={status} onValueChange={(v) => updateStatus(v as Application['status'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{APPLICATION_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeline</p>
            <div className="space-y-2">
              {app.timeline.map((ev) => (
                <div key={ev.id} className="flex gap-3 rounded-lg border border-border p-3">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{ev.label}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(ev.date)}</p>
                    {ev.description && <p className="mt-1 text-xs text-muted-foreground">{ev.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {app.notes && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
              <p className="rounded-lg border border-border p-3 text-sm">{app.notes}</p>
            </div>
          )}
          {app.attachments.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attachments</p>
              <div className="flex flex-wrap gap-2">
                {app.attachments.map((a) => <Badge key={a} variant="secondary" className="gap-1"><Paperclip className="h-3 w-3" />{a}</Badge>)}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
