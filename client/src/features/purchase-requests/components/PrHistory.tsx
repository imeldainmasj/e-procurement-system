import { CircleCheck, CircleX, FilePlus } from 'lucide-react';
import { PR_STATUS_LABELS, type PrHistoryEntryDto } from '@sipita/shared';
import { formatDateTime } from '@/utils/formatDate';

function describe(entry: PrHistoryEntryDto): string {
  if (entry.action === 'CREATE') return 'Draft dibuat';
  const to = entry.toStatus ? PR_STATUS_LABELS[entry.toStatus] : '?';
  return entry.fromStatus ? `${PR_STATUS_LABELS[entry.fromStatus]} → ${to}` : to;
}

function Icon({ entry }: { entry: PrHistoryEntryDto }) {
  if (entry.action === 'CREATE') return <FilePlus className="text-base-content/60 size-5" />;
  if (entry.toStatus === 'CANCELLED' || entry.toStatus === 'REJECTED')
    return <CircleX className="text-error size-5" />;
  return <CircleCheck className="text-primary size-5" />;
}

/** Vertical timeline of status changes (from the audit log). */
export function PrHistory({ entries }: { entries: PrHistoryEntryDto[] }) {
  return (
    <ul className="timeline timeline-vertical timeline-compact timeline-snap-icon">
      {entries.map((entry, i) => (
        <li key={entry.id}>
          {i > 0 && <hr />}
          <div className="timeline-middle">
            <Icon entry={entry} />
          </div>
          <div className="timeline-end mb-4">
            <time className="text-base-content/60 text-xs">{formatDateTime(entry.at)}</time>
            <div className="font-medium">{describe(entry)}</div>
            <div className="text-base-content/70 text-sm">oleh {entry.user?.name ?? 'Sistem'}</div>
            {entry.note && (
              <div className="bg-base-200 rounded-box mt-1 px-3 py-2 text-sm">{entry.note}</div>
            )}
          </div>
          {i < entries.length - 1 && <hr />}
        </li>
      ))}
    </ul>
  );
}
