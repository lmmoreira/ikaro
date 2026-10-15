import { cn } from '@/shared/utils/cn';

interface FilterCheckboxOptionProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: () => void;
  readonly disabled?: boolean;
  // How many items the option stands for (the Agenda shows it on the right of the row).
  readonly count?: number;
}

// One checkbox row of a FloatingFilterMenu body, shared by every filter that lists options.
export function FilterCheckboxOption({
  label,
  checked,
  onChange,
  disabled = false,
  count,
}: FilterCheckboxOptionProps): React.JSX.Element {
  return (
    <label
      className={cn(
        'flex items-center gap-3 rounded-xl px-2 py-2 transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-50',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="min-w-0 flex-1 text-sm font-medium text-gray-900">{label}</span>
      {count === undefined ? null : (
        <span className="text-[0.6875rem] font-bold text-gray-400">{count}</span>
      )}
    </label>
  );
}
