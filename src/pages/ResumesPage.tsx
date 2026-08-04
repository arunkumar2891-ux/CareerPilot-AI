import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Plus, FileText, Upload, Download, GitCompare, Eye, Star,
  TrendingUp, Clock, Sparkles, FileCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { services } from '@/services';
import { formatDate, timeAgo } from '@/utils';
import { toast } from 'sonner';
import type { Resume } from '@/types';

export function ResumesPage() {
  const qc = useQueryClient();
  const { data: resumes, isLoading } = useQuery({ queryKey: ['resumes'], queryFn: () => services.resume.list() });
  const [selected, setSelected] = useState<Resume | null>(null);
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [compareResult, setCompareResult] = useState<string[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<Resume['type']>('general');
  const [newContent, setNewContent] = useState('');

  const create = async () => {
    await services.resume.create(newName, newType, newContent || `# ${newName}\n\nNew resume content...`);
    toast.success('Resume created');
    setShowCreate(false);
    setNewName('');
    setNewContent('');
    qc.invalidateQueries({ queryKey: ['resumes'] });
  };

  const compare = async () => {
    if (!compareA || !compareB || compareA === compareB) {
      toast.error('Select two different resumes to compare');
      return;
    }
    const res = await services.resume.compare(compareA, compareB);
    setCompareResult(res.diff);
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Resume Studio"
        description="Create, tailor, and optimize resumes with AI"
        actions={
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> New Resume</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Resume</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5"><Label>Name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Senior Frontend Resume" /></div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={newType} onValueChange={(v) => setNewType(v as Resume['type'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technical">Technical</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                      <SelectItem value="creative">Creative</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Content (Markdown)</Label><Textarea rows={6} value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="# Your Name..." /></div>
              </div>
              <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs defaultValue="resumes">
        <TabsList>
          <TabsTrigger value="resumes">My Resumes</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="versions">Version History</TabsTrigger>
        </TabsList>

        <TabsContent value="resumes" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {resumes?.map((r, i) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="cursor-pointer transition-colors hover:bg-accent/30" onClick={() => setSelected(r)}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <Badge variant="secondary" className="capitalize">{r.type}</Badge>
                    </div>
                    <p className="mt-3 font-semibold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">Updated {timeAgo(r.updatedAt)}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">ATS Score</span>
                          <span className={`font-semibold ${r.atsScore >= 85 ? 'text-success' : 'text-warning'}`}>{r.atsScore}</span>
                        </div>
                        <Progress value={r.atsScore} className="mt-1 h-1.5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> {r.versions.length} versions
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="compare" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Resume A</Label>
                  <Select value={compareA} onValueChange={setCompareA}>
                    <SelectTrigger><SelectValue placeholder="Select resume" /></SelectTrigger>
                    <SelectContent>{resumes?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Resume B</Label>
                  <Select value={compareB} onValueChange={setCompareB}>
                    <SelectTrigger><SelectValue placeholder="Select resume" /></SelectTrigger>
                    <SelectContent>{resumes?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={compare} className="mt-4 gap-2"><GitCompare className="h-4 w-4" /> Compare</Button>
            </CardContent>
          </Card>
          {compareResult && (
            <Card>
              <CardHeader><CardTitle className="text-base">Comparison Results</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {compareResult.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                    <GitCompare className="h-4 w-4 text-primary" /> {d}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="versions" className="space-y-4">
          {resumes?.map((r) => (
            <Card key={r.id}>
              <CardHeader><CardTitle className="text-base">{r.name}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {r.versions.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-xs font-bold">v{v.version}</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Version {v.version} {v.note && <span className="text-muted-foreground">— {v.note}</span>}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(v.createdAt)} · ATS {v.atsScore}</p>
                    </div>
                    <Badge variant="secondary">{v.atsScore}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <ResumeEditor resume={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ResumeEditor({ resume, onClose }: { resume: Resume | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [content, setContent] = useState('');
  const [activeTab, setActiveTab] = useState('edit');

  if (!resume) return null;
  const displayContent = content || resume.content;

  const save = async () => {
    await services.resume.update(resume.id, displayContent);
    toast.success('Resume saved');
    qc.invalidateQueries({ queryKey: ['resumes'] });
    onClose();
  };

  const scoreATS = async () => {
    toast.success('Scoring resume...');
    const { score, feedback } = await services.ats.score(displayContent);
    toast.success(`ATS Score: ${score}/100`);
    console.log(feedback);
  };

  return (
    <Dialog open={!!resume} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {resume.name}
            <Badge variant="secondary" className="ml-2">ATS {resume.atsScore}</Badge>
          </DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="edit">Markdown Editor</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="pdf">PDF View</TabsTrigger>
          </TabsList>
          <TabsContent value="edit" className="mt-4">
            <Textarea
              rows={18}
              value={displayContent}
              onChange={(e) => setContent(e.target.value)}
              className="font-mono text-sm scrollbar-thin"
            />
          </TabsContent>
          <TabsContent value="preview" className="mt-4">
            <div className="max-h-[55vh] overflow-y-auto scrollbar-thin rounded-lg border border-border bg-white p-8 text-black dark:bg-white">
              <MarkdownPreview content={displayContent} />
            </div>
          </TabsContent>
          <TabsContent value="pdf" className="mt-4">
            <div className="flex h-[55vh] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
              <div className="text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">PDF preview</p>
                <Button variant="outline" size="sm" className="mt-3 gap-2"><Download className="h-3.5 w-3.5" /> Download PDF</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Button onClick={save} className="gap-2"><FileCheck className="h-4 w-4" /> Save</Button>
          <Button variant="outline" onClick={scoreATS} className="gap-2"><Sparkles className="h-4 w-4" /> Score ATS</Button>
          <Button variant="outline" className="gap-2"><TrendingUp className="h-4 w-4" /> Generate Tailored</Button>
          <Button variant="ghost" className="ml-auto gap-2"><Download className="h-4 w-4" /> Export</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-bold">{line.slice(2)}</h1>;
        if (line.startsWith('## ')) return <h2 key={i} className="mt-4 text-lg font-semibold">{line.slice(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={i} className="mt-3 text-base font-medium">{line.slice(4)}</h3>;
        if (line.startsWith('- ')) return <li key={i} className="ml-4 list-disc text-sm">{line.slice(2)}</li>;
        if (line.trim() === '') return <div key={i} className="h-2" />;
        return <p key={i} className="text-sm leading-relaxed">{line}</p>;
      })}
    </div>
  );
}
