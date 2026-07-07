'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';

export interface FontPickerOption {
  readonly name: string;
  readonly cssValue: string;
}

interface FontPickerProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly FontPickerOption[];
  readonly onChange: (value: string) => void;
}

// Each option renders in its own font face so the admin previews the choice before applying it —
// options are passed in by the caller rather than hardcoded, so this stays generic and the
// hotsite feature is the one that decides which fonts are actually available (font-config.ts).
export function FontPicker({
  id,
  label,
  value,
  options,
  onChange,
}: FontPickerProps): React.JSX.Element {
  const selected = options.find((option) => option.name === value);

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-900">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} data-testid={id}>
          <SelectValue>
            <span style={{ fontFamily: selected?.cssValue }}>{value}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.name}
              value={option.name}
              data-testid={`${id}-option-${option.name}`}
            >
              <span style={{ fontFamily: option.cssValue }}>{option.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
