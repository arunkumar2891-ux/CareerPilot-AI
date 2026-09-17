import type { Transition, Variants } from 'framer-motion';
import { useMediaQuery } from '@/hooks/use-media-query';

/** Premium decelerate — mission-control feel. Entrances and on-screen moves. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * Accelerate — for exits only. Elements leaving should start gently and depart
 * quickly; reusing EASE_OUT on an exit makes dismissals feel like they are
 * being dragged off screen.
 */
export const EASE_IN = [0.3, 0, 1, 1] as const;

export const DURATION = {
  /** Micro-feedback: presses, toggles, colour changes. */
  fast: 0.18,
  /** Cards, list rows, panels. Kept in the 200-350ms band for list-weight elements. */
  base: 0.28,
  /** Modals, page transitions, focus shifts. */
  slow: 0.42,
} as const;

export const transitionBase: Transition = {
  duration: DURATION.base,
  ease: EASE_OUT,
};

export const transitionFast: Transition = {
  duration: DURATION.fast,
  ease: EASE_OUT,
};

/** Exits are ~30% shorter than entrances: users care more about what arrives. */
export const transitionExit: Transition = {
  duration: DURATION.fast,
  ease: EASE_IN,
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: transitionBase },
  exit: { opacity: 0, y: -4, transition: transitionExit },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transitionBase },
  exit: { opacity: 0, transition: transitionExit },
};

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: transitionBase },
  exit: { opacity: 0, y: -4, transition: transitionExit },
};

/**
 * Upper bound on how many children may be staggered.
 *
 * `staggerChildren` multiplies by index with no ceiling, so an unbounded server
 * list (jobs, resumes, runs) would push the last row far past the 500ms
 * choreography budget — 50 rows at 40ms each is a 2s tail that reads as jank,
 * not sequence. Items beyond this index all share the cap's delay, so the
 * head of the list still cascades and the tail simply arrives together.
 */
export const MAX_STAGGER_INDEX = 8;

/** Total cascade length in seconds for a given per-item delay. */
export function staggerWindow(stagger: number): number {
  return stagger * MAX_STAGGER_INDEX;
}

export function staggerContainer(stagger = 0.04, delayChildren = 0): Variants {
  return {
    initial: {},
    animate: {
      transition: {
        staggerChildren: stagger,
        delayChildren,
      },
    },
  };
}

/**
 * Per-item entrance.
 *
 * `index` is optional so existing call sites keep working, but passing it is
 * what enforces `MAX_STAGGER_INDEX`: the delay is computed here and clamped,
 * rather than left to the parent's unbounded `staggerChildren`.
 *
 * The `filter`/`y` pair gives the entrance a secondary layer — the row lifts
 * *and* resolves from a slight blur, so it reads as arriving rather than just
 * appearing. Both are compositor-friendly (no layout).
 */
export function staggerItem(distance = 8, index?: number, stagger = 0.04): Variants {
  const delay = index === undefined ? 0 : Math.min(index, MAX_STAGGER_INDEX) * stagger;

  return {
    initial: { opacity: 0, y: distance, filter: 'blur(2px)' },
    animate: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { ...transitionBase, delay },
    },
    exit: { opacity: 0, y: -4, transition: transitionExit },
  };
}

/**
 * Collapse/expand without animating `height`.
 *
 * Animating `height: 0 -> 'auto'` triggers layout on every frame. `scaleY` runs
 * on the compositor instead; `transformOrigin: top` keeps it anchored, and
 * `height` is left to CSS. Callers must set `overflow: hidden` (or `overflow-hidden`)
 * on the animated element so content does not spill during the transition.
 */
export function collapseVariants(): Variants {
  return {
    initial: { opacity: 0, scaleY: 0.85, transformOrigin: 'top' },
    animate: {
      opacity: 1,
      scaleY: 1,
      transformOrigin: 'top',
      transition: transitionFast,
    },
    exit: {
      opacity: 0,
      scaleY: 0.85,
      transformOrigin: 'top',
      transition: transitionExit,
    },
  };
}

/**
 * Honours the user's OS-level motion preference.
 *
 * Deliberately does NOT include a viewport width. An earlier version matched
 * `(max-width: 1023px)` too, which silenced every animation on phones and
 * tablets — including press feedback — so the app felt inert on the majority
 * form factor. Viewport-based *performance* trimming belongs in
 * `useHeavyMotionEnabled`, which is about GPU cost, not user preference.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * Gate for expensive *ambient* effects only — backdrop blur companions, scan
 * lines, orbiting rings, large parallax. These are decorative, so they are the
 * right thing to drop on small/low-power viewports (matching the
 * `backdrop-filter` disable in `index.css` at the same breakpoint).
 *
 * Never gate interaction feedback on this.
 */
export function useHeavyMotionEnabled(): boolean {
  return !useMediaQuery('(max-width: 1023px), (prefers-reduced-motion: reduce)');
}

/** Press feedback shared by interactive cards and rows. */
export const pressable = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.985, y: 0 },
  transition: transitionFast,
} as const;
