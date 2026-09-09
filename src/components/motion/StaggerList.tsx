import { motion } from 'framer-motion';
import { staggerContainer, staggerItem, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface StaggerListProps {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  as?: 'div' | 'ul' | 'section';
}

export function StaggerList({ children, className, stagger = 0.04, as = 'div' }: StaggerListProps) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as];

  if (reduceMotion) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <Component
      className={cn(className)}
      variants={staggerContainer(stagger)}
      initial="initial"
      animate="animate"
    >
      {children}
    </Component>
  );
}

interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'li' | 'article';
  onClick?: () => void;
}

export function StaggerItem({ children, className, as = 'div', onClick }: StaggerItemProps) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as];

  if (reduceMotion) {
    const Tag = as;
    return <Tag className={className} onClick={onClick}>{children}</Tag>;
  }

  return (
    <Component className={cn(className)} variants={staggerItem()} onClick={onClick}>
      {children}
    </Component>
  );
}
