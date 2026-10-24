'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';

interface TextInputProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly maxLength: number;
  readonly onChange: (value: string) => void;
}

export function TextInput({
  id,
  label,
  value,
  maxLength,
  onChange,
}: TextInputProps): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-900">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

interface ListShellProps {
  readonly title: string;
  readonly testId: string;
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly addLabel: string;
  readonly onAdd: () => void;
  readonly children: React.ReactNode;
}

// The bounded-list frame every variant uses: the add button stops at the schema's maximum.
export function ListShell({
  title,
  testId,
  count,
  min,
  max,
  addLabel,
  onAdd,
  children,
}: ListShellProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.contentBlock');
  return (
    <fieldset className="space-y-3" data-testid={testId}>
      <legend className="mb-1.5 text-sm font-semibold text-gray-900">{title}</legend>
      <p className="text-xs text-gray-500">{t('listBounds', { min, max })}</p>
      {children}
      <Button type="button" variant="outline" disabled={count >= max} onClick={onAdd}>
        {addLabel}
      </Button>
    </fieldset>
  );
}

export function RemoveButton({
  disabled,
  label,
  onClick,
}: {
  readonly disabled: boolean;
  readonly label: string;
  readonly onClick: () => void;
}): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.contentBlock');
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      data-testid="content-block-item-remove"
    >
      {t('remove')}
    </Button>
  );
}

export function replaceAt<T>(items: readonly T[], index: number, next: T): T[] {
  return items.map((item, i) => (i === index ? next : item));
}

// One stable key per item of a bounded list the panel edits, so removing the second of three keeps
// the first and third rows' inputs (and focus) instead of re-pointing them at shifted data. The data
// itself carries no id (the closed schema has no room for one), so the keys live beside it; the
// same approach as TestimonialsConfigPanel. If the list length is changed from outside, the missing
// keys fall back to positions, which is still unique.
export interface ItemKeys {
  readonly keys: readonly string[];
  readonly add: () => void;
  readonly remove: (index: number) => void;
}

export function useItemKeys(length: number): ItemKeys {
  const [stored, setStored] = useState<readonly string[]>(() =>
    Array.from({ length }, () => crypto.randomUUID()),
  );
  const keys =
    stored.length === length
      ? stored
      : Array.from({ length }, (_, index) => stored[index] ?? `position-${index}`);
  return {
    keys,
    add: () => setStored([...keys, crypto.randomUUID()]),
    remove: (index) => setStored(keys.filter((_, i) => i !== index)),
  };
}
