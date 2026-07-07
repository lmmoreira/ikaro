'use client';

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/components/ui/command';
import { cn } from '@/shared/utils/cn';

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
  readonly searchPlaceholder?: string;
  readonly emptyLabel?: string;
}

// Searchable combobox — options are passed in by the caller rather than hardcoded, so this
// stays generic; the hotsite feature decides which fonts are actually available
// (font-config.ts) and feeds them in. Each option (and the trigger) renders in its own font
// face — the caller must ensure the corresponding next/font/google CSS variables are loaded
// into this subtree (see BrandingTab, which applies FONT_VARIABLES), otherwise every option
// silently falls back to the same inherited font.
export function FontPicker({
  id,
  label,
  value,
  options,
  onChange,
  searchPlaceholder,
  emptyLabel,
}: FontPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.name === value);

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-900">
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          data-testid={id}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          <span style={{ fontFamily: selected?.cssValue }}>{value}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.name}
                    value={option.name}
                    data-testid={`${id}-option-${option.name}`}
                    onSelect={() => {
                      onChange(option.name);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0',
                        option.name === value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span style={{ fontFamily: option.cssValue }}>{option.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
