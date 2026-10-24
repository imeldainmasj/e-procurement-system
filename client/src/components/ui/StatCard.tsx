import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

export type StatTone = 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'error';

const toneClass: Record<StatTone, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  error: 'text-error',
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Secondary line under the value (e.g. a comparison). */
  description?: ReactNode;
  /** Top-right note, e.g. a % change with a trend icon. */
  trend?: ReactNode;
  icon?: LucideIcon;
  /** Colour of the soft icon tile. */
  tone?: StatTone;
  /** Adds a link under the value. */
  to?: string;
  linkLabel?: string;
}

/** Velzon KPI tile: label + trend, big value, link, and a soft icon tile (CLAUDE.md §8). */
export function StatCard({
  label,
  value,
  description,
  trend,
  icon: Icon,
  tone = 'primary',
  to,
  linkLabel = 'Lihat detail',
}: StatCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="stat-label">{label}</span>
        {trend && <span className="text-sm font-medium">{trend}</span>}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          {description && <div className="text-base-content/60 mt-1 text-xs">{description}</div>}
          {to && (
            <Link to={to} className="link link-primary mt-3 block text-sm">
              {linkLabel}
            </Link>
          )}
        </div>
        {Icon && (
          <span className={cn('icon-soft shrink-0', toneClass[tone])}>
            <Icon className="size-6" aria-hidden />
          </span>
        )}
      </div>
    </div>
  );
}
