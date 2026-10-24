import type { ColumnDef } from '@tanstack/react-table';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  formatRupiah,
  PRICE_SOURCE_TYPE_LABELS,
  PRICE_SOURCE_TYPES,
  type ItemDto,
  type PriceHistoryDto,
  type PriceSummaryDto,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import {
  axisProps,
  formatRupiahShort,
  gridProps,
  SERIES_SLOTS,
  seriesColor,
} from '@/components/charts/chartColors';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useListParams } from '@/hooks/useListParams';
import { usePriceHistory, usePriceSummary } from '@/hooks/useProcurement';
import { formatDate } from '@/utils/formatDate';
import { ItemPicker } from '../purchase-requests/components/ItemPicker';

/**
 * One line per vendor over time. Vendors get colour slots by vendor code (not by price
 * rank), so a vendor keeps its colour; beyond SERIES_SLOTS vendors only the most frequent are drawn.
 */
function PriceTrendChart({ summary }: { summary: PriceSummaryDto }) {
  const vendors = useMemo(() => {
    const top = [...summary.byVendor]
      .sort((a, b) => b.count - a.count)
      .slice(0, SERIES_SLOTS)
      .sort((a, b) => a.vendor.code.localeCompare(b.vendor.code));
    return top.map((v, i) => ({ ...v.vendor, color: seriesColor(i) }));
  }, [summary]);

  const rows = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const p of summary.points) {
      const row = byDate.get(p.date) ?? { date: p.date };
      row[p.vendorId] = Number(p.unitPrice);
      byDate.set(p.date, row);
    }
    return [...byDate.values()];
  }, [summary]);

  const hidden = summary.byVendor.length - vendors.length;

  return (
    <div>
      <div
        className="h-72 w-full"
        role="img"
        aria-label={`Tren harga ${summary.item.name} per vendor`}
      >
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="date"
              {...axisProps}
              tickFormatter={(d: string) => formatDate(d, 'D MMM YY')}
            />
            <YAxis
              {...axisProps}
              width={56}
              tickFormatter={formatRupiahShort}
              domain={['auto', 'auto']}
            />
            <Tooltip
              content={
                <ChartTooltip
                  formatValue={formatRupiah}
                  formatLabel={(d) => formatDate(String(d), 'D MMMM YYYY')}
                />
              }
            />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
            {vendors.map((v) => (
              <Line
                key={v.id}
                dataKey={v.id}
                name={v.name}
                stroke={v.color}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, fill: 'var(--color-base-100)' }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {hidden > 0 && (
        <p className="text-base-content/60 text-xs">
          {hidden} vendor lain tidak digambar; lihat tabel di bawah.
        </p>
      )}
    </div>
  );
}

function ItemSummary({ itemId }: { itemId: string }) {
  const summary = usePriceSummary(itemId);
  if (summary.isPending) return <div className="skeleton h-80 w-full" />;
  if (summary.isError) {
    return (
      <div role="alert" className="alert alert-error">
        <span>{getErrorMessage(summary.error)}</span>
      </div>
    );
  }
  const s = summary.data;
  if (s.stats.count === 0) {
    return (
      <div className="card">
        <div className="card-body">
          <EmptyState
            title="Belum ada riwayat harga"
            description="Harga tercatat otomatis dari penawaran vendor dan PO yang diterbitkan."
          />
        </div>
      </div>
    );
  }
  const tiles = [
    ['Terendah', s.stats.min],
    ['Rata-rata', s.stats.avg],
    ['Tertinggi', s.stats.max],
    ['Terakhir', s.stats.latest],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="stats stats-vertical sm:stats-horizontal bg-base-100 w-full shadow-velzon">
        {tiles.map(([label, value]) => (
          <div key={label} className="stat">
            <div className="stat-title">{label}</div>
            <div className="stat-value text-xl">{formatRupiah(value)}</div>
            <div className="stat-desc">
              {label === 'Terakhir'
                ? formatDate(s.stats.latestAt)
                : `per ${s.item.unit} · ${s.stats.count} data`}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <div className="card-body p-4">
            <h2 className="card-title text-base">Tren Harga per Vendor (24 bulan)</h2>
            <PriceTrendChart summary={s} />
          </div>
        </div>
        <div className="card">
          <div className="card-body p-4">
            <h2 className="card-title text-base">Per Vendor</h2>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th className="text-right">Rata-rata</th>
                    <th className="text-right">Terakhir</th>
                  </tr>
                </thead>
                <tbody>
                  {s.byVendor.map((v) => (
                    <tr key={v.vendor.id}>
                      <td>
                        <div className="font-medium">{v.vendor.name}</div>
                        <div className="text-base-content/60 text-xs">{v.count} data</div>
                      </td>
                      <td className="text-right whitespace-nowrap">{formatRupiah(v.avg)}</td>
                      <td className="text-right whitespace-nowrap">
                        {formatRupiah(v.latest)}
                        <div className="text-base-content/60 text-xs">{formatDate(v.latestAt)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PriceHistoryPage() {
  const [item, setItem] = useState<ItemDto | null>(null);
  const [params, setParams] = useListParams({ sort: 'recordedAt:desc' });
  const history = usePriceHistory({ ...params, itemId: item?.id });

  const columns = useMemo<ColumnDef<PriceHistoryDto>[]>(
    () => [
      {
        id: 'recordedAt',
        header: 'Tanggal',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDate(row.original.recordedAt)}</span>
        ),
      },
      {
        id: 'item.name',
        header: 'Item',
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.item.name}</div>
            <div className="text-base-content/60 text-xs">{row.original.item.code}</div>
          </div>
        ),
      },
      {
        id: 'vendor.name',
        header: 'Vendor',
        enableSorting: true,
        cell: ({ row }) => row.original.vendor.name,
      },
      {
        id: 'unitPrice',
        header: 'Harga Satuan',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {formatRupiah(row.original.unitPrice)}
            <span className="text-base-content/60 text-xs">/{row.original.item.unit}</span>
          </span>
        ),
      },
      {
        id: 'sourceType',
        header: 'Sumber',
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <span className="badge badge-sm badge-outline">
              {PRICE_SOURCE_TYPE_LABELS[row.original.sourceType]}
            </span>
            {row.original.sourceLink ? (
              <Link to={row.original.sourceLink} className="link link-hover ml-2 font-mono text-xs">
                {row.original.sourceNumber}
              </Link>
            ) : (
              <span className="ml-2 font-mono text-xs">{row.original.sourceNumber}</span>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Riwayat Harga"
        description="Harga item katalog dari penawaran vendor dan Purchase Order yang terbit."
      />
      <div className="card">
        <div className="card-body flex-row flex-wrap items-center gap-2 p-4">
          <span className="text-sm font-medium">Item:</span>
          <div className="w-full sm:w-96">
            <ItemPicker
              selectedLabel={item ? `${item.code} — ${item.name}` : ''}
              onSelect={(picked) => {
                setItem(picked);
                setParams({});
              }}
            />
          </div>
          {item && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItem(null)}>
              <X className="size-4" /> Semua item
            </button>
          )}
        </div>
      </div>

      {item ? (
        <ItemSummary itemId={item.id} />
      ) : (
        <p className="text-base-content/60 text-sm">
          Pilih item untuk melihat statistik dan grafik tren harga per vendor.
        </p>
      )}

      <DataTable
        columns={columns}
        data={history.data?.data}
        total={history.data?.meta.total ?? 0}
        params={params}
        onParamsChange={setParams}
        isLoading={history.isPending}
        isFetching={history.isFetching}
        error={history.error}
        searchPlaceholder="Cari item atau vendor..."
        emptyTitle="Belum ada riwayat harga"
        getRowId={(r) => r.id}
        filters={
          <select
            className="select select-sm w-auto"
            value={String(params.sourceType ?? '')}
            onChange={(e) => setParams({ sourceType: e.target.value || undefined })}
            aria-label="Filter sumber"
          >
            <option value="">Semua sumber</option>
            {PRICE_SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>
                {PRICE_SOURCE_TYPE_LABELS[s]}
              </option>
            ))}
          </select>
        }
      />
    </div>
  );
}
