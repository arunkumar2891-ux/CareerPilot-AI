import { motion } from 'framer-motion';
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: number;
  accent?: string;
  delay?: number;
}

export function MetricCard({ label, value, icon, trend, accent, delay = 0 }: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="glass-card relative overflow-hidden p-5"
    >
      <div className={cn('absolute inset-x-0 top-0 h-1', accent || 'bg-primary/40')} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        )}
      </div>
      {trend !== undefined && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          <span className={cn('font-medium', trend >= 0 ? 'text-success' : 'text-destructive')}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
          <span className="text-muted-foreground">vs last week</span>
        </div>
      )}
    </motion.div>
  );
}
