import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen, Upload, Search, FileText, Sparkles, Database,
  Layers, Tag,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { services } from '@/services';
import { toast } from 'sonner';

const COLLECTIONS = ['Resumes', 'Job Descriptions', 'Cover Letters', 'Interview Notes', 'Career Strategy', 'Industry Research'];

const SAMPLE_CHUNKS = [
  { id: '1', content: 'Led migration from monolith to microservices, reducing API latency by 40% and improving developer velocity.', score: 0.94, collection: 'Resumes' },
  { id: '2', content: 'Architected real-time collaboration platform serving 2M+ concurrent users with WebSocket and CRDT.', score: 0.91, collection: 'Resumes' },
  { id: '3', content: 'Strong experience with React, TypeScript, Node.js, PostgreSQL, and distributed systems design.', score: 0.89, collection: 'Resumes' },
  { id: '4', content: 'Job requires expertise in frontend performance optimization, accessibility, and design systems.', score: 0.87, collection: 'Job Descriptions' },
  { id: '5', content: 'STAR method: Situation, Task, Action, Result — structure behavioral interview answers.', score: 0.85, collection: 'Interview Notes' },
];

export function KnowledgeBasePage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<typeof SAMPLE_CHUNKS | null>(null);
  const [searching, setSearching] = useState(false);
  const [collection, setCollection] = useState('all');

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    const res = await services.embedding.search(query, collection === 'all' ? undefined : collection);
    setResults(res.map((r, i) => ({ ...SAMPLE_CHUNKS[i % SAMPLE_CHUNKS.length], content: r.chunk, score: r.score })));
    setSearching(false);
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Knowledge Base"
        description="RAG-ready document store with semantic search"
        actions={
          <Button className="gap-2"><Upload className="h-4 w-4" /> Add Document</Button>
        }
      />

      <Tabs defaultValue="search">
        <TabsList>
          <TabsTrigger value="search" className="gap-1.5"><Search className="h-3.5 w-3.5" /> Semantic Search</TabsTrigger>
          <TabsTrigger value="collections" className="gap-1.5"><Layers className="h-3.5 w-3.5" /> Collections</TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Pipeline</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search your knowledge base semantically..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} className="pl-9" />
                </div>
                <Select value={collection} onValueChange={setCollection}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Collections</SelectItem>
                    {COLLECTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={search} disabled={searching} className="gap-2"><Search className="h-4 w-4" /> {searching ? 'Searching...' : 'Search'}</Button>
              </div>
            </CardContent>
          </Card>

          {results && (
            <div className="space-y-3">
              {results.map((r, i) => (
                <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="mb-2 flex items-center gap-2">
                            <Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" />{r.collection}</Badge>
                            <Badge variant="outline" className="text-success">Score: {(r.score * 100).toFixed(0)}%</Badge>
                          </div>
                          <p className="text-sm leading-relaxed">{r.content}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="collections" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {COLLECTIONS.map((c, i) => (
              <motion.div key={c} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="cursor-pointer transition-colors hover:bg-accent/30">
                  <CardContent className="pt-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Database className="h-5 w-5 text-primary" />
                    </div>
                    <p className="mt-3 font-semibold">{c}</p>
                    <p className="text-xs text-muted-foreground">{Math.floor(Math.random() * 50 + 5)} chunks · {Math.floor(Math.random() * 10 + 1)} documents</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">RAG Pipeline</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { step: '1', label: 'Document Upload', desc: 'PDF, DOCX, TXT, Markdown files', icon: Upload },
                  { step: '2', label: 'Chunking', desc: 'Split documents into 512-token chunks with overlap', icon: Layers },
                  { step: '3', label: 'Embedding', desc: 'Generate 384-dim embeddings via Gemini', icon: Sparkles },
                  { step: '4', label: 'Vector Store', desc: 'Store in pgvector with HNSW index', icon: Database },
                  { step: '5', label: 'Semantic Search', desc: 'Cosine similarity retrieval with citations', icon: Search },
                ].map((s) => (
                  <div key={s.step} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">{s.step}</div>
                    <s.icon className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
