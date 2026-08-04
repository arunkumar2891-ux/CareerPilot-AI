import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, FileText, Play, History, Tag, Variable, FileX } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { services } from '@/services';
import { EmptyState } from '@/components/shared/EmptyState';
import { timeAgo } from '@/utils';
import { toast } from 'sonner';
import type { Prompt } from '@/types';

export function PromptsPage() {
  const qc = useQueryClient();
  const { data: prompts } = useQuery({ queryKey: ['prompts'], queryFn: () => services.prompt.list() });
  const [selected, setSelected] = useState<Prompt | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newPrompt, setNewPrompt] = useState({ name: '', category: '', content: '', variables: '' });

  const create = async () => {
    await services.prompt.create(newPrompt.name, newPrompt.category, newPrompt.content, newPrompt.variables.split(',').map((v) => v.trim()).filter(Boolean));
    toast.success('Prompt created');
    setShowCreate(false);
    setNewPrompt({ name: '', category: '', content: '', variables: '' });
    qc.invalidateQueries({ queryKey: ['prompts'] });
  };

  const categories = Array.from(new Set(prompts?.map((p) => p.category) || []));

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Prompt Library"
        description="Manage, version, and test AI prompts"
        actions={
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> New Prompt</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Prompt</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5"><Label>Name</Label><Input value={newPrompt.name} onChange={(e) => setNewPrompt({ ...newPrompt, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Category</Label><Input value={newPrompt.category} onChange={(e) => setNewPrompt({ ...newPrompt, category: e.target.value })} placeholder="Resume, Interview..." /></div>
                <div className="space-y-1.5"><Label>Variables (comma-separated)</Label><Input value={newPrompt.variables} onChange={(e) => setNewPrompt({ ...newPrompt, variables: e.target.value })} placeholder="resume, jd, role" /></div>
                <div className="space-y-1.5"><Label>Content</Label><Textarea rows={5} value={newPrompt.content} onChange={(e) => setNewPrompt({ ...newPrompt, content: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {(!prompts || prompts.length === 0) ? (
        <Card><CardContent><EmptyState icon={FileX} title="No prompts yet" description="Create your first AI prompt to start building your library." action={<Button onClick={() => setShowCreate(true)} className="gap-2"><Plus className="h-4 w-4" /> New Prompt</Button>} /></CardContent></Card>
      ) : (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {prompts.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="cursor-pointer transition-colors hover:bg-accent/30" onClick={() => setSelected(p)}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant="secondary">v{p.version}</Badge>
                </div>
                <p className="mt-3 font-semibold">{p.name}</p>
                <Badge variant="outline" className="mt-1 text-[10px]">{p.category}</Badge>
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{p.content}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.variables.map((v) => <Badge key={v} variant="secondary" className="text-[10px] gap-0.5"><Variable className="h-2.5 w-2.5" />{v}</Badge>)}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Updated {timeAgo(p.createdAt)}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
      )}

      {selected && <PromptEditor prompt={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function PromptEditor({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const qc = useQueryClient();
  const [content, setContent] = useState(prompt.content);
  const [testing, setTesting] = useState(false);

  const save = async () => {
    await services.prompt.update(prompt.id, content);
    toast.success('Prompt updated (new version)');
    qc.invalidateQueries({ queryKey: ['prompts'] });
    onClose();
  };

  const test = async () => {
    setTesting(true);
    const result = await services.prompt.test(content, {});
    setTesting(false);
    toast.success('Prompt test completed');
    console.log(result);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> {prompt.name}</DialogTitle></DialogHeader>
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="edit" className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {prompt.variables.map((v) => <Badge key={v} variant="secondary" className="gap-1"><Variable className="h-3 w-3" />{`{{${v}}}`}</Badge>)}
            </div>
            <Textarea rows={12} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-sm scrollbar-thin" />
          </TabsContent>
          <TabsContent value="history" className="space-y-2">
            {prompt.history.length === 0 ? (
              <EmptyState icon={History} title="No history yet" description="Save a new version to start tracking prompt history." className="py-8" />
            ) : prompt.history.map((h) => (
              <Card key={h.id}><CardContent className="pt-4">
                <div className="flex items-center justify-between"><Badge variant="secondary">v{h.version}</Badge><span className="text-xs text-muted-foreground">{timeAgo(h.createdAt)}</span></div>
                <p className="mt-2 line-clamp-3 font-mono text-xs text-muted-foreground">{h.content}</p>
              </CardContent></Card>
            ))}
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={test} disabled={testing} className="gap-2"><Play className="h-4 w-4" /> {testing ? 'Testing...' : 'Test'}</Button>
          <Button onClick={save} className="gap-2"><History className="h-4 w-4" /> Save New Version</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
