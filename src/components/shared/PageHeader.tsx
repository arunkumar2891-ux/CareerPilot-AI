import { type ReactNode } from 'react';
import { FadeIn } from '@/components/motion';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * Page-level heading. Renders the page's single `<h1>`.
 *
 * Section headings below this should use `<SectionHeading>` (h2), not `CardTitle`
 * (h3) alone — jumping h1 → h3 leaves screen-reader users without a section tier
 * to navigate by.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <FadeIn as="header" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </FadeIn>
  );
}

interface SectionHeadingProps {
  children: ReactNode;
  description?: string;
  actions?: ReactNode;
  className?: string;
  /** Set when the section is labelled by an element elsewhere (e.g. a tab). */
  id?: string;
}

/**
 * The h2 tier between `PageHeader` (h1) and `CardTitle` (h3).
 *
 * Use for named regions of a page — "Pipeline", "Recent activity", "Danger zone".
 * Visually lighter than the page title on purpose: it is a wayfinding aid, not a
 * second headline.
 */
export function SectionHeading({
  children,
  description,
  actions,
  className,
  id,
}: SectionHeadingProps) {
  return (
    <div className={cn('flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div>
        <h2 id={id} className="text-sm font-semibold tracking-tight text-foreground">
          {children}
        </h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
