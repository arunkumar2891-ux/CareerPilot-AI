import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Search, FileText, Database,
  Layers, SearchX, CloudDownload,
} from 'lucide-react';
import { FadeIn, InlineLoader, StaggerItem, StaggerList } from '@/components/motion';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { services } from '@/services';
import { EmptyState } from '@/components/shared/EmptyState';
import { parseGoogleDocFileId } from '@/utils/google';
import { useToast } from '@/hooks/use-toast';

export function KnowledgeBasePage() {
  const qc = useQueryClient();
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
    mutationFn: async (rawFileId: string) => {
      const fileId = parseGoogleDocFileId(rawFileId);
      if (!fileId) throw new Error('Paste a Google Doc link or file ID');
      return services.resume.syncGoogleDocCorpus({ fileId });
    },
    onSuccess: (data) => {
      toast({
        title: 'Google Doc synced',
        description: `${data.totalExisting} career evidence chunks now match this resume.`,
      });
      refetchCollections();
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['resumes'] });
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
        description="Search quantified bullets extracted from your Google Doc resume"
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
                <Button onClick={search} disabled={searching} className="flex-1 gap-2 sm:flex-none">
                  {searching ? <InlineLoader /> : <Search className="h-4 w-4" />}
                  {searching ? 'Searching…' : 'Search'}
                </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {results && (
            <div className="space-y-3">
              {results.length === 0 ? (
                <Card><CardContent><EmptyState icon={SearchX} title="No results found" description="Try a different query, or sync a Google Doc to add evidence chunks." /></CardContent></Card>
              ) : (
              <StaggerList className="space-y-3">
              {results.map((r, i) => (
                <StaggerItem key={`${r.chunk.slice(0, 24)}-${i}`}>
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
                </StaggerItem>
              ))}
              </StaggerList>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="collections" className="space-y-4">
          {(!collections || collections.length === 0) ? (
                <Card><CardContent><EmptyState icon={BookOpen} title="No evidence yet" description="Sync a Google Doc from this page to extract quantified bullets into the knowledge base." /></CardContent></Card>
          ) : (
            <StaggerList className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {collections.map((c) => (
                <StaggerItem key={c.collection}>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Database className="h-5 w-5 text-primary" />
                      </div>
                      <p className="mt-3 font-semibold">{c.collection}</p>
                      <p className="text-xs text-muted-foreground">{c.count} evidence chunks</p>
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </TabsContent>

        <TabsContent value="google-sync" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-sm">Sync Master Resume from Google Docs</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Fetch your master resume from a Google Doc, extract quantified achievement bullets as knowledge chunks,
                  and update the master resume in one click. Requires Google OAuth (Integrations → Connect Google).
                  You can also upload or paste a resume on the Corpus page.
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
                  {syncMutation.isPending ? <InlineLoader /> : <CloudDownload className="h-4 w-4" />}
                  {syncMutation.isPending ? 'Syncing…' : 'Sync Now'}
                </Button>
              </div>

              {syncMutation.isSuccess && syncMutation.data && (
                <FadeIn className="rounded-md border border-primary/30 bg-primary/5 p-4 glow-border">
                  <p className="text-sm font-medium text-primary">Sync Complete</p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <li>Chunks extracted from doc: <strong>{syncMutation.data.chunksExtracted}</strong></li>
                    <li>Career evidence chunks stored: <strong>{syncMutation.data.totalExisting}</strong></li>
                    <li>Master resume content: <strong>{syncMutation.data.resumeUpdated ? 'Updated' : 'Unchanged'}</strong></li>
                  </ul>
                </FadeIn>
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
                <li>Quantified bullets replace the previous career evidence — leftover bullets from an old resume are not kept.</li>
                <li>The master resume in the database is updated to match the Google Doc.</li>
                <li>Next time you tailor a resume, the ATS Optimizer uses the master resume, or a matching role-specific resume if you added one on the Corpus page.</li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
