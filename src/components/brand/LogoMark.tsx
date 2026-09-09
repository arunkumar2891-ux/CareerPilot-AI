import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/motion';

interface LogoMarkProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

/** Trajectory arc + node — career path / pilot metaphor */
export function LogoMark({ size = 32, className, animated = false }: LogoMarkProps) {
  const reduceMotion = useReducedMotion();
  const draw = animated && !reduceMotion;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <path
        d="M6 24 C10 14, 18 10, 26 8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray={draw ? '40' : undefined}
        strokeDashoffset={draw ? '40' : undefined}
        className={draw ? 'animate-[draw_0.8s_ease-out_forwards]' : undefined}
        style={draw ? { animation: 'logo-draw 0.8s ease-out forwards' } : undefined}
      />
      <circle cx="26" cy="8" r="3" fill="currentColor" className="opacity-90" />
      <circle cx="6" cy="24" r="2" fill="currentColor" className="opacity-50" />
      {draw && (
        <style>{`
          @keyframes logo-draw {
            to { stroke-dashoffset: 0; }
          }
        `}</style>
      )}
    </svg>
  );
}
