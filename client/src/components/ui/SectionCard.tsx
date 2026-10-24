import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface SectionCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right side of the header, e.g. a badge or `btn-xs btn-soft` buttons. */
  actions?: ReactNode;
  className?: string;
  /** Drops the default body padding, e.g. for edge-to-edge tables. */
  flush?: boolean;
  /** Extra body layout classes (padding included only when `flush`). */
  bodyClassName?: string;
  children: ReactNode;
}

/** Velzon card: `.card-header` (title + actions) above the body (CLAUDE.md §8). */
export function SectionCard({
  title,
  description,
  actions,
  className,
  flush,
  bodyClassName,
  children,
}: SectionCardProps) {
  return (
    <section className={cn('card', className)}>
      <div className="card-header flex-wrap gap-2">
        <div className="min-w-0">
          <h2 className="card-title">{title}</h2>
          {description && <p className="text-base-content/60 text-xs">{description}</p>}
        </div>
        {actions}
      </div>
      {/* cn is plain clsx, so padding must not be overridden via bodyClassName. */}
      <div className={cn(!flush && 'p-4', bodyClassName)}>{children}</div>
    </section>
  );
}
