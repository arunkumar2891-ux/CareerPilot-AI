import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonCardProps {
  count?: number;
  className?: string;
  columns?: 1 | 2 | 3;
}

export function SkeletonCard({ count = 3, className, columns = 1 }: SkeletonCardProps) {
  const gridClass = columns === 3
    ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
    : columns === 2
      ? 'grid gap-4 sm:grid-cols-2'
      : 'space-y-3';

  return (
    <div className={cn(gridClass, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-5 w-2/3 animate-shimmer" />
            <Skeleton className="h-5 w-16 shrink-0" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
