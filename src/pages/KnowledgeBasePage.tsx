import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BookOpen, Search, FileText, Database,
  Layers, SearchX,
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

export function KnowledgeBasePage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ chunk: string; score: number; collection: string; tags: string[] }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [collection, setCollection] = useState('all');

  const { data: collections } = useQuery({
    queryKey: ['knowledge-collections'],
    queryFn: () => services.embedding.collections(),
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
    <div className="space-y-6 p-6">
      <PageHeader
        title="Knowledge Base"
        description="Resume-safe career evidence used when tailoring resumes (metrics, architecture, achievements)"
      />

      <Tabs defaultValue="search">
        <TabsList>
          <TabsTrigger value="search" className="gap-1.5"><Search className="h-3.5 w-3.5" /> Search</TabsTrigger>
          <TabsTrigger value="collections" className="gap-1.5"><Layers className="h-3.5 w-3.5" /> Collections</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search metrics, SnapLogic, BigQuery, Gemini…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} className="pl-9" />
                </div>
                <Select value={collection} onValueChange={setCollection}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Collections</SelectItem>
                    {(collections || []).map((c) => <SelectItem key={c.collection} value={c.collection}>{c.collection}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={search} disabled={searching} className="gap-2"><Search className="h-4 w-4" /> {searching ? 'Searching...' : 'Search'}</Button>
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
      </Tabs>
    </div>
  );
}
