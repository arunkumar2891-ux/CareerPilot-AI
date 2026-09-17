import { type ReactNode } from 'react';
import { StaggerItem } from '@/components/motion';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: number;
  accent?: string;
}

export function MetricCard({ label, value, icon, trend, accent }: MetricCardProps) {
  return (
    <StaggerItem className="glass-card relative overflow-hidden p-4 sm:p-5">
      <div className={cn('absolute inset-x-0 top-0 h-1', accent || 'bg-primary/40')} />
      <div className="flex items-start justify-between gap-2">
        {/* `min-w-0` is required: without it this div's min-content width is the longest
            unbreakable label run, so at 320px (two columns of ~136px, minus padding) the card's
            own `overflow-hidden` clips the label instead of reflowing it. */}
        <div className="min-w-0 flex-1">
          <p className="status-label break-words">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        </div>
        {/* Decorative only — the label already names the metric. At 320px a two-column card
            leaves ~104px of content width, and a 40px icon plus its gap would squeeze the
            10px mono label ("APPLICATIONS" needs ~84px) into a mid-word break. Dropping the
            icon is the better trade than mangling the label. */}
        {icon && (
          <div
            aria-hidden
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-glow-sm sm:flex"
          >
            {icon}
          </div>
        )}
      </div>
      {trend !== undefined && (
        <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs">
          <span className={cn('font-medium', trend >= 0 ? 'text-success' : 'text-destructive')}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
          <span className="text-muted-foreground">vs last week</span>
        </div>
      )}
    </StaggerItem>
  );
}
