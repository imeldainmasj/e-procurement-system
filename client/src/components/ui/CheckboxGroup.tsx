interface CheckboxGroupProps<T extends string | number> {
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onChange: (value: T[]) => void;
  /** Keeps the selection in the same order as `options`. */
  name: string;
}

export function CheckboxGroup<T extends string | number>({
  options,
  value,
  onChange,
  name,
}: CheckboxGroupProps<T>) {
  const toggle = (option: T, checked: boolean) => {
    const next = checked ? [...value, option] : value.filter((v) => v !== option);
    onChange(options.map((o) => o.value).filter((v) => next.includes(v)));
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <label key={String(option.value)} className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            name={name}
            className="checkbox checkbox-sm"
            checked={value.includes(option.value)}
            onChange={(e) => toggle(option.value, e.target.checked)}
          />
          <span className="text-sm">{option.label}</span>
        </label>
      ))}
    </div>
  );
}
