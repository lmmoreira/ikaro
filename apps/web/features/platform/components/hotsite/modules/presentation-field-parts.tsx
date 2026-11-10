'use client';

import { useState } from 'react';
import { ColorPicker } from '@/shared/components/ui/color-picker';
import { HEX_COLOR_REGEX } from '@/shared/utils/hex-color';
import { useTranslations } from 'next-intl';
import { NumberInput } from '@/shared/components/ui/number-input';
import { Label } from '@/shared/components/ui/label';

// A field left on its default is simply absent from the stored presentation, so a module the
// manager never touched keeps rendering exactly as it did before `presentation` existed.
export const DEFAULT = 'default';
export type WithDefault<T extends string> = T | typeof DEFAULT;

export function pickOrUndefined<T extends string>(selected: WithDefault<T>): T | undefined {
  return selected === DEFAULT ? undefined : (selected as T);
}

function toPercent(opacity: number): string {
  return String(Math.round(opacity * 100));
}

function fromPercent(raw: string): number | null {
  if (raw.trim() === '') return null;
  const percent = Number(raw);
  if (!Number.isFinite(percent)) return null;
  return Math.min(100, Math.max(0, Math.round(percent))) / 100;
}

interface OpacityFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly onChange: (opacity: number) => void;
}

// There is no slider primitive in the repo, so opacity is a 0–100 % number input stored as 0–1.
export function OpacityField({ id, label, value, onChange }: OpacityFieldProps): React.JSX.Element {
  const tUnits = useTranslations('common.units');

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <NumberInput
        id={id}
        data-testid={id}
        unit={tUnits('percent')}
        min={0}
        max={100}
        step={1}
        inputMode="numeric"
        value={toPercent(value)}
        onChange={(event) => {
          const next = fromPercent(event.target.value);
          if (next !== null) onChange(next);
        }}
      />
    </div>
  );
}

interface TouchedColorPickerProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly errorMessage: string;
  readonly onChange: (value: string) => void;
}

// A typed colour only reads as wrong once the manager has left the field, so half a hex never
// flashes an error mid-keystroke.
export function TouchedColorPicker({
  id,
  label,
  value,
  errorMessage,
  onChange,
}: TouchedColorPickerProps): React.JSX.Element {
  const [touched, setTouched] = useState(false);
  return (
    <ColorPicker
      id={id}
      label={label}
      value={value}
      error={touched && !HEX_COLOR_REGEX.test(value) ? errorMessage : undefined}
      onChange={onChange}
      onBlur={() => setTouched(true)}
    />
  );
}
