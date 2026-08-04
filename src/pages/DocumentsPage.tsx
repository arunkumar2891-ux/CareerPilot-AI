import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Plus, FileText, Download, Upload, Search, FolderOpen, Tag,
  Eye, Trash2, File as FileIcon, Image, FileType,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { services } from '@/services';
import { formatBytes, timeAgo } from '@/utils';
import { toast } from 'sonner';
import type { Document } from '@/types';

const FILE_ICONS = {
  pdf: FileType, docx: FileText, txt: FileText, md: FileText, image: Image,
};

export function DocumentsPage() {
  const qc = useQueryClient();
  const { data: docs } = useQuery({ queryKey: ['documents'], queryFn: () => services.document.list() });
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('all');
  const [selected, setSelected] = useState<Document | null>(null);

  const folders = Array.from(new Set(docs?.map((d) => d.folder) || []));

  const filtered = (docs || []).filter((d) => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (folder !== 'all' && d.folder !== folder) return false;
    return true;
  });

  const upload = async () => {
    await services.document.create(`New Document ${Date.now()}.pdf`, 'pdf', 120000, 'Uploads');
    toast.success('Document uploaded');
    qc.invalidateQueries({ queryKey: ['documents'] });
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Documents"
        description="Manage resumes, cover letters, and supporting documents"
        actions={
          <Button onClick={upload} className="gap-2"><Upload className="h-4 w-4" /> Upload</Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Button variant={folder === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFolder('all')}>All</Button>
          {folders.map((f) => (
            <Button key={f} variant={folder === f ? 'default' : 'outline'} size="sm" onClick={() => setFolder(f)} className="gap-1.5"><FolderOpen className="h-3.5 w-3.5" />{f}</Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {filtered.map((doc, i) => {
          const Icon = FILE_ICONS[doc.type] || FileIcon;
          return (
            <motion.div key={doc.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="cursor-pointer transition-colors hover:bg-accent/30" onClick={() => setSelected(doc)}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <Badge variant="secondary" className="uppercase">{doc.type}</Badge>
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">{doc.folder} · {formatBytes(doc.size)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {doc.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]"><Tag className="mr-1 h-2.5 w-2.5" />{t}</Badge>)}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{timeAgo(doc.updatedAt)} · v{doc.versions.length}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {selected && (
        <Dialog open onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{selected.name}</DialogTitle></DialogHeader>
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
              <div className="text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">Preview not available in demo</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="gap-2"><Download className="h-4 w-4" /> Download</Button>
              <Button variant="ghost" className="gap-2 text-destructive" onClick={async () => {
                await services.document.delete(selected.id);
                toast.success('Document deleted');
                qc.invalidateQueries({ queryKey: ['documents'] });
                setSelected(null);
              }}><Trash2 className="h-4 w-4" /> Delete</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
