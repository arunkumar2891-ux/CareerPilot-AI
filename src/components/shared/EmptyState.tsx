import { type LucideIcon } from 'lucide-react';
import { FadeIn, IconFrame } from '@/components/motion';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <FadeIn className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}>
      <div className="relative">
        {!className?.includes('no-orbit') && (
          <svg
            className="absolute -inset-3 h-[calc(100%+24px)] w-[calc(100%+24px)] text-primary/20"
            viewBox="0 0 80 80"
            aria-hidden
          >
            <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 6" />
          </svg>
        )}
        <IconFrame icon={icon} size="lg" glow />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </FadeIn>
  );
}
