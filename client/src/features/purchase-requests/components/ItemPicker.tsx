import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useId, useState } from 'react';
import type { ItemDto } from '@sipita/shared';
import { itemsApi } from '@/api/master.api';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/utils/cn';

interface ItemPickerProps {
  /** Text shown for the current selection, e.g. "LPT-STD — Laptop Standar". */
  selectedLabel: string;
  onSelect: (item: ItemDto) => void;
  error?: boolean;
}

/** Searchable catalog combobox backed by `GET /items?search=`. */
export function ItemPicker({ selectedLabel, onSelect, error }: ItemPickerProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query);

  const results = useQuery({
    queryKey: ['items', { picker: true, search: debounced }],
    queryFn: () =>
      itemsApi.list({ page: 1, limit: 10, search: debounced || undefined, sort: 'name:asc' }),
    enabled: open,
  });

  return (
    <div className="relative w-full">
      <label className={cn('input input-sm w-full', error && 'input-error')}>
        <Search className="size-3 opacity-50" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label="Cari item katalog"
          className="grow"
          placeholder={selectedLabel || 'Cari kode / nama item...'}
          value={open ? query : selectedLabel}
          onFocus={() => {
            setQuery('');
            setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="menu bg-base-100 rounded-box border-base-300 absolute z-30 mt-1 max-h-64 w-full flex-nowrap overflow-y-auto border p-1 shadow-lg"
        >
          {results.isPending ? (
            <li className="p-2">
              <span className="loading loading-dots loading-sm" />
            </li>
          ) : results.data?.data.length === 0 ? (
            <li className="text-base-content/60 p-2 text-sm">
              Item tidak ditemukan. Gunakan input manual.
            </li>
          ) : (
            results.data?.data.map((item) => (
              <li key={item.id} role="option" aria-selected={false}>
                {/* onMouseDown fires before the input's blur closes the list. */}
                <button
                  type="button"
                  className="flex flex-col items-start gap-0"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(item);
                    setOpen(false);
                  }}
                >
                  <span className="text-sm">{item.name}</span>
                  <span className="text-base-content/60 text-xs">
                    {item.code} · {item.category.name} · per {item.unit}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
