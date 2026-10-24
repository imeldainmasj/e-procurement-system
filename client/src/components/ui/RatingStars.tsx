import { Star } from 'lucide-react';

/** Read-only 1–5 stars with partial fill, plus the numeric value. */
export function RatingStars({
  value,
  count,
  size = 'sm',
}: {
  value: number | null;
  count?: number;
  size?: 'sm' | 'md';
}) {
  const px = size === 'sm' ? 'size-3.5' : 'size-5';
  if (value === null) return <span className="text-base-content/50 text-xs">Belum ada rating</span>;
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Rating ${value} dari 5`}>
      <span className="relative inline-flex">
        <span className="text-base-content/20 flex">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} className={`${px} fill-current`} />
          ))}
        </span>
        <span
          className="absolute inset-0 flex overflow-hidden text-warning"
          style={{ width: `${(value / 5) * 100}%` }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} className={`${px} shrink-0 fill-current`} />
          ))}
        </span>
      </span>
      <span className="text-sm font-medium">{value.toFixed(1).replace('.', ',')}</span>
      {count !== undefined && <span className="text-base-content/60 text-xs">({count})</span>}
    </span>
  );
}
