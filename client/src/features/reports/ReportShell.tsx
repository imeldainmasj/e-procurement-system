import { FileDown, FileSpreadsheet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  PROCUREMENT_METHOD_LABELS,
  PROCUREMENT_METHODS,
  PROCUREMENT_TYPE_LABELS,
  PROCUREMENT_TYPES,
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_LABELS,
  type ReportName,
} from '@sipita/shared';
import { getErrorMessage } from '@/api/client';
import { reportsApi, type ReportParams } from '@/api/reports.api';
import { PageHeader } from '@/components/ui/PageHeader';
import { useUserOptions } from '@/hooks/useMasterData';
import { vendorHooks } from '@/hooks/useVendors';
import { toast } from '@/stores/toastStore';
import { downloadBlob } from '@/utils/download';

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 2015 + 2 }, (_, i) => 2015 + i);

export type FilterField =
  'yearRange' | 'year' | 'method' | 'procurementType' | 'category' | 'vendor' | 'pic';

interface ReportShellProps {
  name: ReportName;
  title: string;
  description: string;
  params: ReportParams;
  onParamsChange: (patch: ReportParams) => void;
  fields: FilterField[];
  /** Report-specific controls next to the shared filters. */
  extraFilters?: ReactNode;
  children: ReactNode;
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string | number | boolean | undefined;
  onChange: (v: string | undefined) => void;
  options: [string | number, string][];
  placeholder: string;
}) {
  return (
    <select
      className="select select-sm w-auto"
      aria-label={label}
      value={value === undefined ? '' : String(value)}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">{placeholder}</option>
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
}

/**
 * Frame shared by the six reports (CLAUDE.md §10): title, filters in one row, and Excel/PDF
 * export of exactly the current query.
 */
export function ReportShell({
  name,
  title,
  description,
  params,
  onParamsChange,
  fields,
  extraFilters,
  children,
}: ReportShellProps) {
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const vendors = vendorHooks.useList(
    { page: 1, limit: 100, sort: 'name:asc' },
    { enabled: fields.includes('vendor') },
  );
  const users = useUserOptions();
  const years = YEARS.map((y) => [y, String(y)] as [number, string]);
  const num = (v: string | undefined) => (v ? Number(v) : undefined);

  const exportAs = async (format: 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      const { blob, fileName } = await reportsApi.download(name, params, format);
      downloadBlob(blob, fileName);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-soft btn-primary btn-sm"
              disabled={exporting !== null}
              onClick={() => void exportAs('xlsx')}
            >
              {exporting === 'xlsx' ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <FileSpreadsheet className="size-4" />
              )}
              Excel
            </button>
            <button
              type="button"
              className="btn btn-soft btn-primary btn-sm"
              disabled={exporting !== null}
              onClick={() => void exportAs('pdf')}
            >
              {exporting === 'pdf' ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <FileDown className="size-4" />
              )}
              PDF
            </button>
          </div>
        }
      />
      <div className="card flex flex-wrap items-center gap-2 p-3">
        {fields.includes('yearRange') && (
          <>
            <Select
              label="Dari tahun"
              placeholder="Dari tahun"
              value={params.yearFrom}
              options={years}
              onChange={(v) => onParamsChange({ yearFrom: num(v) })}
            />
            <span className="text-base-content/60 text-sm">–</span>
            <Select
              label="Sampai tahun"
              placeholder="Sampai tahun"
              value={params.yearTo}
              options={years}
              onChange={(v) => onParamsChange({ yearTo: num(v) })}
            />
          </>
        )}
        {fields.includes('year') && (
          <Select
            label="Tahun"
            placeholder={`Tahun ${THIS_YEAR}`}
            value={params.year}
            options={years}
            onChange={(v) => onParamsChange({ year: num(v) })}
          />
        )}
        {fields.includes('method') && (
          <Select
            label="Metode"
            placeholder="Semua metode"
            value={params.method}
            options={PROCUREMENT_METHODS.map((m) => [m, PROCUREMENT_METHOD_LABELS[m]])}
            onChange={(v) => onParamsChange({ method: v })}
          />
        )}
        {fields.includes('procurementType') && (
          <Select
            label="Jenis"
            placeholder="Semua jenis"
            value={params.procurementType}
            options={PROCUREMENT_TYPES.map((t) => [t, PROCUREMENT_TYPE_LABELS[t]])}
            onChange={(v) => onParamsChange({ procurementType: v })}
          />
        )}
        {fields.includes('category') && (
          <Select
            label="Kategori"
            placeholder="BAU & Project"
            value={params.category}
            options={PROJECT_CATEGORIES.map((c) => [c, PROJECT_CATEGORY_LABELS[c]])}
            onChange={(v) => onParamsChange({ category: v })}
          />
        )}
        {fields.includes('vendor') && (
          <Select
            label="Vendor"
            placeholder="Semua vendor"
            value={params.vendorId}
            options={(vendors.data?.data ?? []).map((v) => [v.id, v.name])}
            onChange={(v) => onParamsChange({ vendorId: v })}
          />
        )}
        {fields.includes('pic') && (
          <Select
            label="PIC"
            placeholder="Semua PIC"
            value={params.picId}
            options={(users.data ?? []).map((u) => [u.id, u.name])}
            onChange={(v) => onParamsChange({ picId: v })}
          />
        )}
        {extraFilters}
      </div>
      {children}
    </div>
  );
}

export function LoadingOrError({ isPending, error }: { isPending: boolean; error: unknown }) {
  if (isPending) return <div className="skeleton h-80 w-full" />;
  return (
    <div role="alert" className="alert alert-error">
      <span>{getErrorMessage(error)}</span>
    </div>
  );
}
