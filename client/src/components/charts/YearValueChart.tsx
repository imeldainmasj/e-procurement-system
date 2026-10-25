import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatRupiah } from '@sipita/shared';
import { axisProps, formatRupiahShort, gridProps, seriesColor } from './chartColors';
import { ChartTooltip } from './ChartTooltip';

interface YearValueChartProps {
  data: { year: number; amountIdr: number; count: number }[];
  /** Drill-down: opens the works that make up the clicked year (CLAUDE.md §9). */
  onSelectYear?: (year: number) => void;
  height?: number;
}

/**
 * Procurement value per year: one measure over time, so a single-series column chart in
 * the primary slot. No legend (the card title names the series); values on hover and in
 * the accessible table below the chart.
 */
export function YearValueChart({ data, onSelectYear, height = 280 }: YearValueChartProps) {
  return (
    <figure>
      {/* daisyUI centres `.card figure` with flex, so the chart must claim the full width. */}
      <div className="w-full" style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis {...axisProps} width={56} tickFormatter={formatRupiahShort} />
            <Tooltip
              cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }}
              content={
                <ChartTooltip formatValue={formatRupiah} formatLabel={(l) => `Tahun ${l}`} />
              }
            />
            <Bar
              dataKey="amountIdr"
              name="Nilai pengadaan"
              fill={seriesColor(0)}
              barSize={16}
              radius={[4, 4, 0, 0]}
              cursor={onSelectYear ? 'pointer' : undefined}
              onClick={(entry: { payload?: { year: number } }) =>
                entry.payload && onSelectYear?.(entry.payload.year)
              }
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        <table>
          <caption>Nilai pengadaan per tahun</caption>
          <thead>
            <tr>
              <th>Tahun</th>
              <th>Nilai (IDR)</th>
              <th>Jumlah pekerjaan</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.year}>
                <td>{d.year}</td>
                <td>{formatRupiah(d.amountIdr)}</td>
                <td>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
