import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/motion';

/** Shared with LogoMark — top-down aircraft silhouette on a 32-unit grid, symmetric about x=16. */
const PLANE =
  'M16 4C17.1 4 17.8 5.6 17.8 7.4V11.8L28 18.4V20.6L17.8 17.9V23.4L21.5 26.2V27.8L16 26.3L10.5 27.8V26.2L14.2 23.4V17.9L4 20.6V18.4L14.2 11.8V7.4C14.2 5.6 14.9 4 16 4Z';

/**
 * `rotate`/`scale` about the plane's own centre rather than the viewBox origin.
 * The silhouette's nose points up (−y), so `rotate(90)` points it right; angles below 90
 * read as climbing.
 */
function planeAt(cx: number, cy: number, scale: number, rotate: number) {
  return `translate(${cx} ${cy}) rotate(${rotate}) scale(${scale}) translate(-16 -16)`;
}

const SIZES = {
  sm: { word: 'text-lg', ai: 'text-[0.7rem]' },
  md: { word: 'text-2xl', ai: 'text-[0.95rem]' },
  lg: { word: 'text-4xl', ai: 'text-[1.4rem]' },
} as const;

interface LogoLockupProps {
  size?: keyof typeof SIZES;
  className?: string;
  animated?: boolean;
}

/**
 * Full horizontal lockup — origin plane, dashed climbing trajectory, destination plane, over a
 * measured baseline, with the wordmark beneath.
 *
 * Light/dark is handled by theme tokens rather than by swapping two images. Per the brand sheet
 * only the *wordmark and baseline* invert between backgrounds; the planes stay the same jade, so
 * they use the fixed `--brand-jade` token and NOT `--primary` (which is darker in light mode and
 * lighter in dark mode, and would shift the mark).
 *
 * Layout note: the graphic is `w-full` inside a grid column sized by the wordmark, so the
 * baseline always spans exactly the wordmark's width — as in the artwork — at any `size`.
 *
 * The wordmark is real text, not SVG `<text>` or outlined paths, so it stays selectable and does
 * not depend on a webfont having loaded. The SVG is `aria-hidden`; screen readers get the
 * wordmark, so pair this with an `<h1>`/`sr-only` where it acts as a heading.
 */
export function LogoLockup({ size = 'md', className, animated = false }: LogoLockupProps) {
  const reduceMotion = useReducedMotion();
  const play = animated && !reduceMotion;
  const s = SIZES[size];

  return (
    <span className={cn('inline-grid justify-items-center', className)}>
      <svg
        viewBox="0 0 300 68"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-auto w-full"
        aria-hidden
      >
        {/* Measured baseline with end ticks — the "route" reference line. */}
        <path
          d="M4 46V64M4 55H296M296 46V64"
          className="stroke-foreground/75"
          strokeWidth="3"
          strokeLinecap="square"
        />
        {/* Trajectory: origin → destination, climbing then levelling off.
            No `pathLength` here — normalising it to 1 would make `strokeDasharray` exceed the
            path length and render the line solid. The dash offset is animated in absolute units
            via a large `stroke-dashoffset` start instead. */}
        <path
          d="M50 30C112 2 208 0 254 16"
          className="stroke-foreground/45"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="7 9"
          style={play ? { animation: 'lockup-trace 1s ease-out both' } : undefined}
        />
        {/* Origin (lower, climbing) and destination (higher, levelling). */}
        <path
          d={PLANE}
          transform={planeAt(26, 30, 1, 58)}
          className="fill-brand-jade"
          style={play ? { animation: 'lockup-fade 0.45s ease-out both' } : undefined}
        />
        <path
          d={PLANE}
          transform={planeAt(272, 18, 1.2, 80)}
          className="fill-brand-jade"
          style={play ? { animation: 'lockup-fade 0.45s ease-out 0.6s both' } : undefined}
        />
        {play && (
          <style>{`
            @keyframes lockup-trace {
              from { stroke-dashoffset: 260; opacity: 0; }
              to   { stroke-dashoffset: 0; opacity: 1; }
            }
            @keyframes lockup-fade {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
          `}</style>
        )}
      </svg>

      <span className="inline-flex items-baseline gap-[0.3em] leading-none">
        <span className={cn('font-bold tracking-[-0.03em] text-foreground', s.word)}>
          CareerPilot
        </span>
        <span
          className={cn('font-bold uppercase tracking-[0.02em] text-muted-foreground', s.ai)}
        >
          AI
        </span>
      </span>
    </span>
  );
}
