/** Number of categorical slots; extra series must be folded into "Lainnya". */
export const SERIES_SLOTS = 5;

/** Categorical colour for slot `index` (0-based), as a CSS variable defined in index.css
 * (theme colours: primary → success → warning → secondary → info). */
export function seriesColor(index: number): string {
  return `var(--series-${(index % SERIES_SLOTS) + 1})`;
}

/** Axis/grid styling shared by every chart (recessive ink). */
export const axisProps = {
  stroke: 'var(--chart-axis)',
  tick: { fill: 'var(--chart-axis)', fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = {
  stroke: 'var(--chart-grid)',
  strokeDasharray: '3 3',
  vertical: false,
} as const;

/** Compact rupiah for axis ticks: 1.250.000 → "1,3 jt", 2.000.000.000 → "2 M". */
export function formatRupiahShort(value: number): string {
  const abs = Math.abs(value);
  const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  if (abs >= 1e9) return `${fmt(value / 1e9)} M`;
  if (abs >= 1e6) return `${fmt(value / 1e6)} jt`;
  if (abs >= 1e3) return `${fmt(value / 1e3)} rb`;
  return fmt(value);
}
