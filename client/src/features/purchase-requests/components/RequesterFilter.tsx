import { ChevronDown, Search, X } from 'lucide-react';
import { useId, useState } from 'react';
import type { PrRequesterOptionDto } from '@sipita/shared';
import { useDebounce } from '@/hooks/useDebounce';
import { usePrRequesters } from '@/hooks/usePurchaseRequests';
import { cn } from '@/utils/cn';

interface RequesterFilterProps {
  value: string | undefined;
  onChange: (requesterId: string | undefined) => void;
}

/** Searchable requester dropdown backed by `GET /purchase-requests/requesters?search=`. */
export function RequesterFilter({ value, onChange }: RequesterFilterProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // The list params only hold the id, so remember the chosen name for display.
  const [selected, setSelected] = useState<PrRequesterOptionDto | null>(null);
  const debounced = useDebounce(query);
  const results = usePrRequesters(debounced, open);

  const selectedLabel = value && selected?.id === value ? selected.name : '';

  const choose = (option: PrRequesterOptionDto | null) => {
    setSelected(option);
    onChange(option?.id);
    setOpen(false);
  };

  return (
    <div className="relative w-56">
      <label className="input input-sm w-full">
        <Search className="size-3 opacity-50" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label="Filter pemohon"
          className="grow"
          placeholder={selectedLabel || 'Semua pemohon'}
          value={open ? query : selectedLabel}
          onFocus={() => {
            setQuery('');
            setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          onChange={(e) => setQuery(e.target.value)}
        />
        {selectedLabel && !open ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-circle"
            aria-label="Hapus filter pemohon"
            onClick={() => choose(null)}
          >
            <X className="size-3" />
          </button>
        ) : (
          <ChevronDown className="size-3 opacity-50" />
        )}
      </label>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="menu bg-base-100 rounded-box border-base-300 absolute z-30 mt-1 max-h-64 w-full flex-nowrap overflow-y-auto border p-1 shadow-lg"
        >
          {!debounced && (
            <li role="option" aria-selected={!value}>
              {/* onMouseDown fires before the input's blur closes the list. */}
              <button
                type="button"
                className={cn(!value && 'menu-active')}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(null);
                }}
              >
                Semua pemohon
              </button>
            </li>
          )}
          {results.isPending ? (
            <li className="p-2">
              <span className="loading loading-dots loading-sm" />
            </li>
          ) : results.data?.length === 0 ? (
            <li className="text-base-content/60 p-2 text-sm">Pemohon tidak ditemukan.</li>
          ) : (
            results.data?.map((option) => (
              <li key={option.id} role="option" aria-selected={option.id === value}>
                <button
                  type="button"
                  className={cn(
                    'flex flex-col items-start gap-0',
                    option.id === value && 'menu-active',
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(option);
                  }}
                >
                  <span className="text-sm">{option.name}</span>
                  {option.division && (
                    <span className="text-base-content/60 text-xs">{option.division.name}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
