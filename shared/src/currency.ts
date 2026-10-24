const idrNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** Formats a number as IDR, e.g. 1250000 → "Rp 1.250.000". */
export function formatRupiah(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(num)) return 'Rp 0';
  const sign = num < 0 ? '-' : '';
  return `${sign}Rp ${idrNumber.format(Math.abs(num))}`;
}
