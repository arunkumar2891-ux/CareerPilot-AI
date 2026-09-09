import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/motion';

interface InlineLoaderProps {
  className?: string;
  size?: 'sm' | 'md';
}

export function InlineLoader({ className, size = 'sm' }: InlineLoaderProps) {
  const reduceMotion = useReducedMotion();
  const dim = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  if (reduceMotion) {
    return (
      <span
        className={cn('inline-block rounded-full border-2 border-primary/30 border-t-primary', dim, className)}
        aria-hidden
      />
    );
  }

  return (
    <span className={cn('relative inline-flex items-center justify-center', dim, className)} aria-hidden>
      <span className={cn('absolute inset-0 rounded-full border border-primary/20', dim)} />
      <span className={cn('absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-orbit', dim)} />
    </span>
  );
}
