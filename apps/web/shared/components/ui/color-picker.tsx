'use client';

import { HexColorPicker } from 'react-colorful';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { cn } from '@/shared/utils/cn';
import { HEX_COLOR_REGEX } from '@/shared/utils/hex-color';

// The colour `react-colorful` starts from while the typed value is not a valid hex: a colour-model
// input the library parses as hex, not a styling colour (the swatch itself paints `bg-border`).
const PICKER_START_COLOR = '#e5e7eb';

const INPUT_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-subtle-foreground focus:border-ring focus:ring-1 focus:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-destructive-tint';

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

// Popover-based swatch (click to pick visually via react-colorful's saturation/hue gradient)
// paired with an always-visible hex text field (for typing/pasting and for the inline
// validation error — UC-027 A1 requires the raw typed value to be shown and validated, not
// just a picked color). Deliberately not the native <input type="color"> — that opens the
// browser/OS color dialog, which is slow and inconsistent across platforms.
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
  const validColor = HEX_COLOR_REGEX.test(value) ? value : undefined;
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger
            type="button"
            data-testid="color-picker-swatch"
            data-field-id={id}
            aria-label={label}
            className="h-9 w-9 shrink-0 rounded-md border border-border bg-border shadow-sm"
            style={validColor ? { backgroundColor: validColor } : undefined}
          />
          <PopoverContent align="start" className="w-auto p-3">
            <HexColorPicker color={validColor ?? PICKER_START_COLOR} onChange={onChange} />
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
      {hint && !error && <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p>}
      {error && (
        <p id={errorId} data-testid={errorId} className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
