import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/motion';

interface LogoMarkProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

/**
 * CareerPilot mark — top-down aircraft silhouette.
 *
 * Constructed on a 32-unit grid with 4 units of padding (live area 4..28), symmetric about
 * x=16. Every vertex is grid-aligned so the shape stays crisp when pixel-snapped at 16px.
 *
 * Filled with `currentColor`, so the surrounding element controls the colour (`text-primary`,
 * `text-primary-foreground`, etc.). Do not hardcode a fill here — six call sites rely on
 * inheriting.
 */
export function LogoMark({ size = 32, className, animated = false }: LogoMarkProps) {
  const reduceMotion = useReducedMotion();
  const play = animated && !reduceMotion;

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
        d="M16 4C17.1 4 17.8 5.6 17.8 7.4V11.8L28 18.4V20.6L17.8 17.9V23.4L21.5 26.2V27.8L16 26.3L10.5 27.8V26.2L14.2 23.4V17.9L4 20.6V18.4L14.2 11.8V7.4C14.2 5.6 14.9 4 16 4Z"
        fill="currentColor"
        style={play ? { animation: 'logo-takeoff 0.55s cubic-bezier(0.22, 1, 0.36, 1) both' } : undefined}
      />
      {play && (
        <style>{`
          @keyframes logo-takeoff {
            from { opacity: 0; transform: translateY(2.5px) scale(0.94); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>
      )}
    </svg>
  );
}
