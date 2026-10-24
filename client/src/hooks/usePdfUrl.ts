import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

/**
 * Fetches an authenticated PDF as a blob and exposes an object URL for an <iframe>.
 * `queryKey` should include a version so the PDF re-renders when the document changes.
 */
export function usePdfUrl(
  queryKey: readonly unknown[],
  fetchPdf: () => Promise<Blob>,
  enabled = true,
) {
  const pdf = useQuery({ queryKey, queryFn: fetchPdf, enabled, staleTime: Infinity });
  const url = useMemo(() => (pdf.data ? URL.createObjectURL(pdf.data) : null), [pdf.data]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return { url, blob: pdf.data, isLoading: pdf.isPending, error: pdf.error };
}
