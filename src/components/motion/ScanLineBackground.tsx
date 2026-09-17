import { cn } from '@/lib/utils';
import { useHeavyMotionEnabled } from '@/lib/motion';

interface ScanLineBackgroundProps {
  className?: string;
}

export function ScanLineBackground({ className }: ScanLineBackgroundProps) {
  /* Purely decorative full-viewport sweep — gated on `useHeavyMotionEnabled` (GPU cost)
     rather than `useReducedMotion` (user preference), matching the `backdrop-filter`
     disable in `index.css` at the same 1024px breakpoint. */
  const heavyMotion = useHeavyMotionEnabled();

  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      <div className="absolute inset-0 grid-bg opacity-40" />
      {heavyMotion && (
        <div
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent animate-scan"
          style={{ top: '20%' }}
        />
      )}
    </div>
  );
}
