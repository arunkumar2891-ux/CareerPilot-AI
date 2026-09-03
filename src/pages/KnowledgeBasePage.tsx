import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BookOpen, Search, FileText, Database,
  Layers, SearchX, RefreshCw, CloudDownload,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { services } from '@/services';
import { EmptyState } from '@/components/shared/EmptyState';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

export function KnowledgeBasePage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ chunk: string; score: number; collection: string; tags: string[] }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [collection, setCollection] = useState('all');
  const [googleDocId, setGoogleDocId] = useState('');
  const { toast } = useToast();

  const { data: collections, refetch: refetchCollections } = useQuery({
    queryKey: ['knowledge-collections'],
    queryFn: () => services.embedding.collections(),
  });

  const syncMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const res = await supabase.functions.invoke('ai-chat', {
        body: { mode: 'sync_google_doc_chunks', fileId },
      });
      if (res.error) throw new Error(res.error.message);
      return res.data as { chunksExtracted: number; newChunksAdded: number; totalExisting: number; resumeUpdated: boolean };
    },
    onSuccess: (data) => {
      toast({ title: 'Google Doc synced', description: `${data.newChunksAdded} new chunks added (${data.totalExisting} total). Master ATS resume updated.` });
      refetchCollections();
    },
    onError: (err) => {
      toast({ title: 'Sync failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    },
  });

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await services.embedding.search(query, collection === 'all' ? undefined : collection);
      setResults(res);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <PageHeader
        title="Knowledge Base"
        description="Resume-safe career evidence used when tailoring resumes (metrics, architecture, achievements)"
      />

      <Tabs defaultValue="search">
        <TabsList>
          <TabsTrigger value="search" className="gap-1.5"><Search className="h-3.5 w-3.5" /> Search</TabsTrigger>
          <TabsTrigger value="collections" className="gap-1.5"><Layers className="h-3.5 w-3.5" /> Collections</TabsTrigger>
          <TabsTrigger value="google-sync" className="gap-1.5"><CloudDownload className="h-3.5 w-3.5" /> Google Doc Sync</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search metrics, SnapLogic, BigQuery, Gemini…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} className="pl-9" />
                </div>
                <div className="flex gap-3">
                <Select value={collection} onValueChange={setCollection}>
                  <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Collections</SelectItem>
                    {(collections || []).map((c) => <SelectItem key={c.collection} value={c.collection}>{c.collection}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={search} disabled={searching} className="flex-1 gap-2 sm:flex-none"><Search className="h-4 w-4" /> {searching ? 'Searching...' : 'Search'}</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {results && (
            <div className="space-y-3">
              {results.length === 0 ? (
                <Card><CardContent><EmptyState icon={SearchX} title="No results found" description="Try a different search query or wait for the career corpus to seed on login." /></CardContent></Card>
              ) : results.map((r, i) => (
                <motion.div key={`${r.chunk.slice(0, 24)}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" />{r.collection}</Badge>
                        <Badge variant="outline" className="text-success">Score: {(r.score * 100).toFixed(0)}%</Badge>
                        {r.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                      </div>
                      <p className="text-sm leading-relaxed">{r.chunk}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="collections" className="space-y-4">
          {(!collections || collections.length === 0) ? (
            <Card><CardContent><EmptyState icon={BookOpen} title="Corpus seeding" description="Sign in and wait a moment — evidence chunks seed automatically from your Master ATS." /></CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {collections.map((c, i) => (
                <motion.div key={c.collection} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Database className="h-5 w-5 text-primary" />
                      </div>
                      <p className="mt-3 font-semibold">{c.collection}</p>
                      <p className="text-xs text-muted-foreground">{c.count} evidence chunks</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="google-sync" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-sm">Sync Master Resume from Google Docs</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Fetch your master resume from a Google Doc, extract quantified achievement bullets as knowledge chunks,
                  and update the Master ATS bullet bank in one click. Requires Google OAuth connection (Integrations → Connect Google).
                </p>
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Google Doc ID</label>
                  <Input
                    placeholder="e.g. 1A2b3C4d5E6f7G8h9I0j (from the doc URL)"
                    value={googleDocId}
                    onChange={(e) => setGoogleDocId(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Find this in your Google Doc URL: docs.google.com/document/d/<strong>THIS_PART</strong>/edit
                  </p>
                </div>
                <Button
                  onClick={() => syncMutation.mutate(googleDocId)}
                  disabled={!googleDocId.trim() || syncMutation.isPending}
                  className="gap-2"
                >
                  {syncMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
                  {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
                </Button>
              </div>

              {syncMutation.isSuccess && syncMutation.data && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-md border border-primary/30 bg-primary/5 p-4">
                  <p className="text-sm font-medium text-primary">Sync Complete</p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <li>Chunks extracted from doc: <strong>{syncMutation.data.chunksExtracted}</strong></li>
                    <li>New chunks added: <strong>{syncMutation.data.newChunksAdded}</strong></li>
                    <li>Total chunks in knowledge base: <strong>{syncMutation.data.totalExisting}</strong></li>
                    <li>Master ATS resume content: <strong>{syncMutation.data.resumeUpdated ? 'Updated' : 'Unchanged'}</strong></li>
                  </ul>
                </motion.div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h4 className="text-sm font-medium mb-2">How it works</h4>
              <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
                <li>Your Google Doc is fetched via the Google Drive API (uses your connected OAuth token).</li>
                <li>Bullet points (lines starting with - or •) with quantifiable metrics and achievement verbs are extracted.</li>
                <li>Each bullet is tagged automatically based on keywords (e.g. SnapLogic, BigQuery, performance, security).</li>
                <li>Only <em>new</em> bullets are inserted — existing chunks are never duplicated.</li>
                <li>The Master ATS resume content in the database is updated to match the Google Doc.</li>
                <li>Next time you tailor a resume, the ATS Optimizer uses the updated bullet bank.</li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
