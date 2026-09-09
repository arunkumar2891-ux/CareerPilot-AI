import type { Transition, Variants } from 'framer-motion';
import { useMediaQuery } from '@/hooks/use-media-query';

/** Premium decelerate — mission-control feel */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  fast: 0.2,
  base: 0.45,
  slow: 0.6,
} as const;

export const transitionBase: Transition = {
  duration: DURATION.base,
  ease: EASE_OUT,
};

export const transitionFast: Transition = {
  duration: DURATION.fast,
  ease: EASE_OUT,
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

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

export function staggerItem(distance = 8): Variants {
  return {
    initial: { opacity: 0, y: distance },
    animate: {
      opacity: 1,
      y: 0,
      transition: transitionBase,
    },
  };
}

export function collapseVariants(): Variants {
  return {
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: 'auto', transition: { ...transitionBase, duration: DURATION.fast } },
    exit: { opacity: 0, height: 0, transition: { duration: DURATION.fast } },
  };
}

/** Respects mobile + prefers-reduced-motion (matches AppLayout). */
export function useReducedMotion(): boolean {
  return useMediaQuery('(max-width: 1023px), (prefers-reduced-motion: reduce)');
}
