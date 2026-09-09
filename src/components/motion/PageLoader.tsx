import { InlineLoader } from './InlineLoader';
import { cn } from '@/lib/utils';

interface PageLoaderProps {
  className?: string;
  label?: string;
  variant?: 'inline' | 'centered' | 'overlay';
}

export function PageLoader({ className, label = 'Loading…', variant = 'centered' }: PageLoaderProps) {
  if (variant === 'inline') {
    return (
      <span className={cn('inline-flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <InlineLoader size="sm" />
        <span className="status-label normal-case tracking-wide">{label}</span>
      </span>
    );
  }

  const content = (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <InlineLoader size="md" />
      <p className="status-label">{label}</p>
    </div>
  );

  if (variant === 'overlay') {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        {content}
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-[40vh] items-center justify-center', className)}>
      {content}
    </div>
  );
}
