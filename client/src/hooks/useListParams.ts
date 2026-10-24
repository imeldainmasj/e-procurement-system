import { useCallback, useState } from 'react';
import type { ListParams } from '@/api/resource';

/** Server-side list state (page, limit, search, sort, filters). Changing anything but the page resets to page 1. */
export function useListParams(initial: Partial<ListParams> = {}) {
  const [params, setParams] = useState<ListParams>({ page: 1, limit: 20, ...initial });

  const update = useCallback((patch: Partial<ListParams>) => {
    setParams((prev) => {
      const next = { ...prev, ...patch };
      if (!('page' in patch)) next.page = 1;
      return next;
    });
  }, []);

  return [params, update] as const;
}
