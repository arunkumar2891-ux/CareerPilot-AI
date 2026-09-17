import { motion } from 'framer-motion';
import { fadeUp, transitionBase, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'header';
  /** Forwarded to the rendered element — e.g. `role`, `aria-*`, `id`. */
  role?: React.AriaRole;
  'aria-label'?: string;
  'aria-live'?: 'off' | 'polite' | 'assertive';
  id?: string;
}

export function FadeIn({
  children,
  className,
  delay = 0,
  as = 'div',
  ...rest
}: FadeInProps) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as];

  if (reduceMotion) {
    // Render the requested tag, not a hardcoded div: `as="header"` must stay a
    // landmark element when motion is off, and forwarded a11y props must survive.
    const Tag = as;
    return (
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    );
  }

  return (
    <Component
      className={cn(className)}
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{ ...transitionBase, delay }}
      {...rest}
    >
      {children}
    </Component>
  );
}
