import { useMemo } from 'react';
import { lexicalMatchScore, highlightTerms } from '@/utils/jd-match';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Target, AlertCircle } from 'lucide-react';

interface JdMatchPanelProps {
  jd: string;
  resume: string;
}

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  const segments = useMemo(() => highlightTerms(text, terms), [text, terms]);
  return (
    <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
      {segments.map((seg, i) =>
        seg.isMatch ? (
          <mark key={i} className="rounded bg-emerald-500/20 px-0.5 text-emerald-700 dark:text-emerald-400">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </div>
  );
}

export function JdMatchPanel({ jd, resume }: JdMatchPanelProps) {
  const result = useMemo(() => lexicalMatchScore(jd, resume), [jd, resume]);

  if (!jd.trim() || !resume.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          Both a job description and resume content are required to show keyword matching.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with score */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <span className="font-medium">Keyword Match</span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="gap-1">
            {result.matched.length}/{result.totalTerms} terms
          </Badge>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-lg font-bold text-primary">
            {result.score}
          </div>
        </div>
      </div>

      {/* Missed keywords */}
      {result.missed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Missing Keywords ({result.missed.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.missed.map((term) => (
              <Badge key={term} variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">
                {term}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Side-by-side comparison */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Job Description</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] rounded-md border p-3">
              <HighlightedText text={jd} terms={result.matched} />
            </ScrollArea>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Your Resume</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] rounded-md border p-3">
              <HighlightedText text={resume} terms={result.matched} />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
