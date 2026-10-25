import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ListParams } from '@/api/resource';

/** Query-string filters, e.g. a chart drill-down `/pekerjaan?year=2024&status=ACTIVE`. */
function filtersFromUrl(search: URLSearchParams): Partial<ListParams> {
  const out: Partial<ListParams> = {};
  for (const [key, value] of search) out[key] = /^\d+$/.test(value) ? Number(value) : value;
  return out;
}

/**
 * Server-side list state (page, limit, search, sort, filters). Changing anything but the page
 * resets to page 1. Filters in the URL are applied once, when the page opens.
 */
export function useListParams(initial: Partial<ListParams> = {}) {
  const [search] = useSearchParams();
  const [params, setParams] = useState<ListParams>(() => ({
    page: 1,
    limit: 20,
    ...initial,
    ...filtersFromUrl(search),
  }));

  const update = useCallback((patch: Partial<ListParams>) => {
    setParams((prev) => {
      const next = { ...prev, ...patch };
      if (!('page' in patch)) next.page = 1;
      return next;
    });
  }, []);

  return [params, update] as const;
}
