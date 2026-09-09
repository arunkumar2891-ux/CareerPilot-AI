import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonMetricGridProps {
  count?: number;
  className?: string;
}

export function SkeletonMetricGrid({ count = 4, className }: SkeletonMetricGridProps) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-card p-4 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-16 animate-shimmer" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
