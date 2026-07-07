'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { cn } from '@/shared/utils/cn';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const FALLBACK_SWATCH = '#e5e7eb';

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

interface ColorPickerProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBlur?: () => void;
  readonly error?: string;
  readonly hint?: string;
  readonly placeholder?: string;
}

// Popover-based swatch (click to pick visually via the native color input) paired with a
// always-visible hex text field (for typing/pasting and for the inline validation error —
// UC-027 A1 requires the raw typed value to be shown and validated, not just a picked color).
export function ColorPicker({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  placeholder,
}: ColorPickerProps): React.JSX.Element {
  const swatchColor = HEX_COLOR_REGEX.test(value) ? value : FALLBACK_SWATCH;
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-900">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger
            type="button"
            data-testid={`${id}-swatch`}
            aria-label={label}
            className="h-9 w-9 shrink-0 rounded-md border border-gray-200 shadow-sm"
            style={{ backgroundColor: swatchColor }}
          />
          <PopoverContent align="start" className="w-auto p-2">
            <input
              type="color"
              aria-label={label}
              value={swatchColor}
              onChange={(event) => onChange(event.target.value)}
              className="h-32 w-40 cursor-pointer border-none bg-transparent p-0"
            />
          </PopoverContent>
        </Popover>
        <input
          id={id}
          data-testid={id}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={cn(INPUT_CLASS)}
        />
      </div>
      {hint && !error && <p className="mt-1.5 text-sm text-gray-500">{hint}</p>}
      {error && (
        <p id={errorId} data-testid={errorId} className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
