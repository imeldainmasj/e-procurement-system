import type { ReactNode } from 'react';
import { seriesColor } from './chartColors';

export interface BarListRow {
  key: string;
  label: ReactNode;
  value: number;
  /** Shown at the end of the row; defaults to the raw value. */
  display?: ReactNode;
  hint?: ReactNode;
}

/**
 * Ranked horizontal bars for one measure across nominal categories: one colour (slot 1),
 * values labelled directly, so the list doubles as its own table view.
 */
export function BarList({ rows, ariaLabel }: { rows: BarListRow[]; ariaLabel: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2" aria-label={ariaLabel}>
      {rows.map((row) => (
        <li
          key={row.key}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
        >
          <div
            className="min-w-0 truncate text-sm"
            title={typeof row.label === 'string' ? row.label : undefined}
          >
            {row.label}
            {row.hint && <span className="text-base-content/60 ml-1 text-xs">{row.hint}</span>}
          </div>
          <div className="text-right text-sm font-medium tabular-nums">
            {row.display ?? row.value}
          </div>
          <div className="bg-base-200 col-span-2 h-2 overflow-hidden rounded-full" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{
                width: max > 0 ? `${Math.max(2, (row.value / max) * 100)}%` : '0%',
                background: seriesColor(0),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
