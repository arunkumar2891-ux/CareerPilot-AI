import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IconFrameProps {
  icon: LucideIcon;
  className?: string;
  glow?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: { frame: 'h-8 w-8', icon: 'h-4 w-4' },
  md: { frame: 'h-9 w-9', icon: 'h-5 w-5' },
  lg: { frame: 'h-14 w-14', icon: 'h-7 w-7' },
};

export function IconFrame({ icon: Icon, className, glow = false, size = 'md' }: IconFrameProps) {
  const s = sizes[size];
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50',
        s.frame,
        glow && 'shadow-glow-sm border-primary/30',
        className,
      )}
    >
      <Icon className={cn(s.icon, 'text-muted-foreground')} />
    </div>
  );
}
