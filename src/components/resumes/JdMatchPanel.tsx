import { useMemo, useState } from 'react';
import { lexicalMatchScore, highlightTerms } from '@/utils/jd-match';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target, AlertCircle } from 'lucide-react';

interface JdMatchPanelProps {
  jd: string;
  resume: string;
}

const PREVIEW_MISSED = 24;

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  const segments = useMemo(() => highlightTerms(text, terms), [text, terms]);
  return (
    <div className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed">
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
  const [showAllMissed, setShowAllMissed] = useState(false);

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

  const visibleMissed = showAllMissed ? result.missed : result.missed.slice(0, PREVIEW_MISSED);
  const hiddenCount = result.missed.length - visibleMissed.length;

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 shrink-0 text-primary" />
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

      {result.missed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Missing Keywords ({result.missed.length})
          </p>
          <div className="max-h-32 overflow-y-auto rounded-md border border-border/60 p-2">
            <div className="flex flex-wrap gap-1.5">
              {visibleMissed.map((term) => (
                <Badge key={term} variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">
                  {term}
                </Badge>
              ))}
            </div>
          </div>
          {result.missed.length > PREVIEW_MISSED && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-0 text-xs"
              onClick={() => setShowAllMissed((open) => !open)}
            >
              {showAllMissed ? 'Show fewer keywords' : `Show ${hiddenCount} more`}
            </Button>
          )}
        </div>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Job Description</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto rounded-md border p-3">
              <HighlightedText text={jd} terms={result.matched} />
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Your Resume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto rounded-md border p-3">
              <HighlightedText text={resume} terms={result.matched} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
