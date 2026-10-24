interface TooltipEntry {
  name?: string | number;
  value?: number | string | readonly (number | string)[];
  color?: string;
  dataKey?: string | number;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: readonly TooltipEntry[];
  /** Formats each value (e.g. formatRupiah). */
  formatValue?: (value: number) => string;
  formatLabel?: (label: string | number) => string;
}

/**
 * Recharts tooltip content: the value leads in bold, the series name follows, keyed with a
 * short stroke of the series colour. Text stays in text colours, never the series colour.
 */
export function ChartTooltip({
  active,
  label,
  payload,
  formatValue = (v) => v.toLocaleString('id-ID'),
  formatLabel = (l) => String(l),
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-base-100 border-base-300 rounded-box border px-3 py-2 text-xs shadow-md">
      {label !== undefined && (
        <div className="text-base-content/70 mb-1 font-medium">{formatLabel(label)}</div>
      )}
      <ul className="space-y-0.5">
        {payload
          .filter((entry) => entry.value !== undefined && entry.value !== null)
          .map((entry) => (
            <li key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-0.5 w-3 rounded"
                style={{ background: entry.color }}
              />
              <span className="font-semibold">{formatValue(Number(entry.value))}</span>
              <span className="text-base-content/70">{entry.name}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
