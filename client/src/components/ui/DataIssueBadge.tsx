import { TriangleAlert } from 'lucide-react';
import type { DataIssue } from '@sipita/shared';

interface DataIssueBadgeProps {
  issues: DataIssue[];
  /** Adds the "not updated" warning, which is not part of the stored issues. */
  stale?: boolean;
  staleDays?: number;
  /** Full list below the badge instead of only a tooltip (detail page). */
  expanded?: boolean;
}

/** Small warning marker for works with incomplete or inconsistent data (CLAUDE.md §9). */
export function DataIssueBadge({ issues, stale, staleDays, expanded }: DataIssueBadgeProps) {
  const messages = [
    ...issues.map((i) => i.message),
    ...(stale ? [`Tidak di-update lebih dari ${staleDays ?? 7} hari`] : []),
  ];
  if (messages.length === 0) return null;

  const badge = (
    <span className="badge badge-sm badge-soft badge-warning gap-1 whitespace-nowrap">
      <TriangleAlert className="size-3" />
      {messages.length === 1 && !expanded ? 'Perlu dicek' : `${messages.length} catatan`}
    </span>
  );

  if (expanded) {
    return (
      <div role="alert" className="alert alert-warning alert-soft items-start">
        <TriangleAlert className="size-5" />
        <div>
          <p className="font-medium">Data belum lengkap / perlu dicek</p>
          <ul className="list-disc ps-5 text-sm">
            {messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <span className="tooltip tooltip-left" data-tip={messages.join(' • ')}>
      {badge}
    </span>
  );
}
