import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { getErrorMessage } from '@/api/client';
import type { ListParams } from '@/api/resource';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/utils/cn';
import { EmptyState } from './EmptyState';

const PAGE_SIZES = [10, 20, 50, 100];

interface DataTableProps<T> {
  /** Column `id` doubles as the server sort field (e.g. `category.name`). Set `enableSorting: true` to allow sorting. */
  columns: ColumnDef<T>[];
  data: T[] | undefined;
  total: number;
  params: ListParams;
  onParamsChange: (patch: Partial<ListParams>) => void;
  isLoading?: boolean;
  isFetching?: boolean;
  error?: unknown;
  searchPlaceholder?: string;
  /** Filter controls next to the search box. */
  filters?: ReactNode;
  emptyTitle?: string;
  getRowId?: (row: T) => string;
}

/** none → asc → desc → none */
function nextSort(columnId: string, current: string | undefined): string | undefined {
  if (current === `${columnId}:asc`) return `${columnId}:desc`;
  if (current === `${columnId}:desc`) return undefined;
  return `${columnId}:asc`;
}

/** Table with server-side search, sorting and pagination. */
export function DataTable<T>({
  columns,
  data,
  total,
  params,
  onParamsChange,
  isLoading,
  isFetching,
  error,
  searchPlaceholder = 'Cari...',
  filters,
  emptyTitle,
  getRowId,
}: DataTableProps<T>) {
  const [searchInput, setSearchInput] = useState(params.search ?? '');
  const debouncedSearch = useDebounce(searchInput);

  useEffect(() => {
    if ((params.search ?? '') !== debouncedSearch)
      onParamsChange({ search: debouncedSearch || undefined });
  }, [debouncedSearch, params.search, onParamsChange]);

  // Sorting is fully server-side, so it is driven by `params.sort` rather than TanStack's sorting state.
  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    ...(getRowId && { getRowId: (row: T) => getRowId(row) }),
  });

  const pageCount = Math.max(1, Math.ceil(total / params.limit));
  const from = total === 0 ? 0 : (params.page - 1) * params.limit + 1;
  const to = Math.min(params.page * params.limit, total);

  return (
    <div className="card">
      <div className="card-header flex-wrap justify-start gap-2">
        <label className="input input-sm w-full sm:w-72">
          <Search className="size-4 opacity-50" />
          <input
            type="search"
            className="grow"
            placeholder={searchPlaceholder}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Cari"
          />
        </label>
        {filters}
        {isFetching && !isLoading && (
          <span className="loading loading-spinner loading-xs opacity-50" />
        )}
      </div>

      {error ? (
        <div className="p-4">
          <div role="alert" className="alert alert-error">
            <span>{getErrorMessage(error)}</span>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead className="bg-base-200/60 text-base-content/60 text-xs uppercase">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const columnId = header.column.id;
                    const canSort = header.column.columnDef.enableSorting === true;
                    const dir =
                      params.sort === `${columnId}:asc`
                        ? 'asc'
                        : params.sort === `${columnId}:desc`
                          ? 'desc'
                          : false;
                    const label = flexRender(header.column.columnDef.header, header.getContext());
                    return (
                      <th
                        key={header.id}
                        aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        {canSort ? (
                          <button
                            type="button"
                            className="flex items-center gap-1 hover:underline"
                            onClick={() =>
                              onParamsChange({ sort: nextSort(columnId, params.sort) })
                            }
                          >
                            {label}
                            {dir === 'asc' ? (
                              <ArrowUp className="size-3" />
                            ) : dir === 'desc' ? (
                              <ArrowDown className="size-3" />
                            ) : (
                              <ArrowUpDown className="size-3 opacity-30" />
                            )}
                          </button>
                        ) : (
                          label
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}>
                      {columns.map((_c, j) => (
                        <td key={j}>
                          <div className="skeleton h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                : table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="hover:bg-base-200/40">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
          {!isLoading && total === 0 && (
            <EmptyState
              title={emptyTitle ?? (params.search ? 'Tidak ada data yang cocok' : 'Belum ada data')}
              {...(params.search && { description: `Pencarian: "${params.search}"` })}
            />
          )}
        </div>
      )}

      <div className="border-base-300 flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
        <span className="text-base-content/60">
          Menampilkan {from}–{to} dari {total} data
        </span>
        <div className="flex items-center gap-2">
          <select
            className="select select-sm w-auto"
            value={params.limit}
            onChange={(e) => onParamsChange({ limit: Number(e.target.value) })}
            aria-label="Jumlah baris per halaman"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} / halaman
              </option>
            ))}
          </select>
          <div className="join">
            <button
              type="button"
              className="join-item btn btn-sm"
              disabled={params.page <= 1}
              onClick={() => onParamsChange({ page: params.page - 1 })}
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className={cn('join-item btn btn-sm pointer-events-none')}>
              {params.page} / {pageCount}
            </span>
            <button
              type="button"
              className="join-item btn btn-sm"
              disabled={params.page >= pageCount}
              onClick={() => onParamsChange({ page: params.page + 1 })}
              aria-label="Halaman berikutnya"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
