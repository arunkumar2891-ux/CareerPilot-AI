import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Mail, Sparkles, Download, Eye, Clock, FileText } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { services } from '@/services';
import { timeAgo } from '@/utils';
import { toast } from 'sonner';
import type { CoverLetter } from '@/types';

export function CoverLettersPage() {
  const qc = useQueryClient();
  const { data: letters } = useQuery({ queryKey: ['cover-letters'], queryFn: () => services.coverLetter.list() });
  const [selected, setSelected] = useState<CoverLetter | null>(null);

  const generate = async () => {
    toast.success('Generating cover letter...');
    await services.coverLetter.generate(letters?.[0]?.id || '');
    toast.success('Cover letter generated');
    qc.invalidateQueries({ queryKey: ['cover-letters'] });
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Cover Letter Studio"
        description="Generate, edit, and manage cover letters"
        actions={
          <Button onClick={generate} className="gap-2"><Sparkles className="h-4 w-4" /> Generate</Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {letters?.map((cl, i) => (
          <motion.div key={cl.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="cursor-pointer transition-colors hover:bg-accent/30" onClick={() => setSelected(cl)}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant="secondary">{cl.versions.length} v</Badge>
                </div>
                <p className="mt-3 font-semibold">{cl.name}</p>
                <p className="text-xs text-muted-foreground">{cl.companyName} · {cl.role}</p>
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{cl.content}</p>
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> {timeAgo(cl.updatedAt)}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <CoverLetterEditor letter={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function CoverLetterEditor({ letter, onClose }: { letter: CoverLetter | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [content, setContent] = useState('');
  if (!letter) return null;
  const display = content || letter.content;

  const save = async () => {
    await services.coverLetter.update(letter.id, display);
    toast.success('Cover letter saved');
    qc.invalidateQueries({ queryKey: ['cover-letters'] });
    onClose();
  };

  return (
    <Dialog open={!!letter} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /> {letter.name}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <TabsContent value="edit" className="mt-4">
            <Textarea rows={16} value={display} onChange={(e) => setContent(e.target.value)} className="scrollbar-thin" />
          </TabsContent>
          <TabsContent value="preview" className="mt-4">
            <div className="max-h-[55vh] overflow-y-auto scrollbar-thin rounded-lg border border-border bg-white p-8 text-black dark:bg-white">
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{display}</div>
            </div>
          </TabsContent>
        </Tabs>
        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Button onClick={save} className="gap-2"><FileText className="h-4 w-4" /> Save</Button>
          <Button variant="outline" className="gap-2"><Sparkles className="h-4 w-4" /> Regenerate</Button>
          <Button variant="ghost" className="ml-auto gap-2"><Download className="h-4 w-4" /> Export</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
