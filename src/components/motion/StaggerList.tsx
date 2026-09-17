import { Children, isValidElement, cloneElement, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  pressable,
  staggerItem,
  useReducedMotion,
} from '@/lib/motion';
import { cn } from '@/lib/utils';

interface StaggerListProps {
  children: ReactNode;
  className?: string;
  stagger?: number;
  /**
   * Use `'ul'` for collections of peer items so assistive tech can announce the
   * item count. `StaggerItem` then needs `as="li"`.
   */
  as?: 'div' | 'ul' | 'section';
  /** Accessible name for the collection. Required when `as="ul"`. */
  label?: string;
}

/**
 * Staggered container.
 *
 * The per-item delay is computed by `StaggerItem` from its index rather than by
 * framer-motion's `staggerChildren`, because `staggerChildren` has no ceiling:
 * on an unbounded server list it produces a multi-second tail. Indices are
 * injected here and clamped to `MAX_STAGGER_INDEX` in `staggerItem`.
 */
export function StaggerList({
  children,
  className,
  stagger = 0.04,
  as = 'div',
  label,
}: StaggerListProps) {
  const Component = as === 'ul' ? motion.ul : as === 'section' ? motion.section : motion.div;

  // Inject the positional index so each item can clamp its own delay.
  const indexed = Children.map(children, (child, i) =>
    isValidElement<{ index?: number; stagger?: number }>(child)
      ? cloneElement(child, { index: i, stagger })
      : child,
  );

  return (
    <Component className={cn(className)} initial="initial" animate="animate" aria-label={label}>
      {indexed}
    </Component>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li' | 'article';
  onClick?: () => void;
  /** Injected by `StaggerList`. Drives the clamped entrance delay. */
  index?: number;
  /** Injected by `StaggerList`. */
  stagger?: number;
  /**
   * Adds hover-lift and press-scale feedback. Set this on items that are
   * themselves clickable so the row acknowledges the press.
   */
  interactive?: boolean;
}

export function StaggerItem({
  children,
  className,
  as = 'div',
  onClick,
  index,
  stagger = 0.04,
  interactive,
}: StaggerItemProps) {
  const reduceMotion = useReducedMotion();
  const Component = as === 'li' ? motion.li : as === 'article' ? motion.article : motion.div;

  // A clickable row must be reachable and operable by keyboard. When `onClick`
  // is present but the element is not natively interactive, add button
  // semantics rather than leaving a mouse-only target.
  const interactiveProps = onClick
    ? {
        onClick,
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};

  if (reduceMotion) {
    const Tag = as;
    return (
      <Tag className={className} {...interactiveProps}>
        {children}
      </Tag>
    );
  }

  const press = interactive || onClick ? pressable : {};

  return (
    <Component
      className={cn(className)}
      variants={staggerItem(8, index, stagger)}
      {...press}
      {...interactiveProps}
    >
      {children}
    </Component>
  );
}
