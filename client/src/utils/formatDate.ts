import dayjs from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

/** e.g. "24 Okt 2026" */
export function formatDate(value: string | Date | null | undefined, format = 'D MMM YYYY'): string {
  if (!value) return '-';
  return dayjs(value).format(format);
}

/** e.g. "24 Okt 2026 14:30" */
export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, 'D MMM YYYY HH:mm');
}
