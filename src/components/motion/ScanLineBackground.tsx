import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/motion';

interface ScanLineBackgroundProps {
  className?: string;
}

export function ScanLineBackground({ className }: ScanLineBackgroundProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      <div className="absolute inset-0 grid-bg opacity-40" />
      {!reduceMotion && (
        <div
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent animate-scan"
          style={{ top: '20%' }}
        />
      )}
    </div>
  );
}
