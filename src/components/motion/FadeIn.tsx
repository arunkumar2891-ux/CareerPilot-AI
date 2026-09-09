import { motion } from 'framer-motion';
import { fadeUp, transitionBase, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'header';
}

export function FadeIn({ children, className, delay = 0, as = 'div' }: FadeInProps) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as];

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <Component
      className={cn(className)}
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{ ...transitionBase, delay }}
    >
      {children}
    </Component>
  );
}
