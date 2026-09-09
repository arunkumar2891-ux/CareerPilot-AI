import { useEffect, useState } from 'react';
import { LogoMark } from '@/components/brand/LogoMark';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/motion';

const STATUS_MESSAGES = ['Initializing…', 'Syncing auth…', 'Loading workspace…'];

interface AppLoaderProps {
  className?: string;
  message?: string;
}

export function AppLoader({ className, message }: AppLoaderProps) {
  const reduceMotion = useReducedMotion();
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion || message) return;
    const id = window.setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [reduceMotion, message]);

  const statusText = message ?? STATUS_MESSAGES[statusIndex];

  return (
    <div className={cn('flex h-screen flex-col items-center justify-center bg-background', className)}>
      <div className="relative flex h-16 w-16 items-center justify-center">
        {!reduceMotion && (
          <>
            <span className="absolute inset-0 rounded-full border border-primary/15" />
            <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-orbit" />
            <span className="absolute inset-1 rounded-full border border-transparent border-b-primary/60 animate-orbit-reverse" />
          </>
        )}
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-chart-4 text-primary-foreground shadow-glow-primary">
          <LogoMark size={22} animated={!reduceMotion} />
        </div>
      </div>
      <p className="mt-6 text-sm font-medium text-foreground">CareerPilot AI</p>
      <p className="mt-1 status-label">{statusText}</p>
    </div>
  );
}
