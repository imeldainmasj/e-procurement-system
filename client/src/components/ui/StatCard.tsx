import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Secondary line under the value (e.g. a comparison). */
  description?: ReactNode;
  icon?: LucideIcon;
  /** Makes the whole tile a link. */
  to?: string;
}

/** KPI tile: the number is the chart. */
export function StatCard({ label, value, description, icon: Icon, to }: StatCardProps) {
  const body = (
    <div className="card-body gap-1 p-4">
      <div className="text-base-content/70 flex items-center justify-between gap-2 text-sm">
        <span>{label}</span>
        {Icon && <Icon className="text-base-content/40 size-5" aria-hidden />}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {description && <div className="text-base-content/60 text-xs">{description}</div>}
    </div>
  );
  return to ? (
    <Link to={to} className="card bg-base-100 hover:bg-base-200/60 shadow-sm transition-colors">
      {body}
    </Link>
  ) : (
    <div className="card bg-base-100 shadow-sm">{body}</div>
  );
}
