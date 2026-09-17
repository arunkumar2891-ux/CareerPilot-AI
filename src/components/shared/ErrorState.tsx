import { AlertTriangle, RefreshCw } from 'lucide-react';
import { FadeIn, IconFrame } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Pull a readable message off whatever the query layer threw. */
function errorMessage(error: unknown): string | undefined {
  if (!error) return undefined;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return undefined;
}

interface ErrorStateProps {
  title?: string;
  /** The thrown value. Its message is shown as secondary detail when readable. */
  error?: unknown;
  /** Explicit description, overriding anything derived from `error`. */
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * Failure state for a data region.
 *
 * Distinct from `EmptyState` on purpose: an empty collection and a failed fetch
 * are different facts, and rendering "No jobs yet" after a dropped request tells
 * the user their data does not exist when it merely failed to load. Toasts are
 * not sufficient here — they vanish, leaving a screen that looks authoritative
 * and is wrong.
 *
 * `role="alert"` so assistive tech announces the failure without needing focus.
 */
export function ErrorState({
  title = 'Could not load this',
  error,
  description,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  const detail = description ?? errorMessage(error);

  return (
    <FadeIn
      role="alert"
      className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}
    >
      <IconFrame icon={AlertTriangle} size="lg" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {detail && <p className="max-w-sm break-words text-xs text-muted-foreground">{detail}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2 gap-2">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          {retryLabel}
        </Button>
      )}
    </FadeIn>
  );
}
