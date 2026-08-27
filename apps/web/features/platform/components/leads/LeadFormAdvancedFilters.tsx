'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  createEmptyFilterRow,
  isSearchTermValid,
  MAX_FILTER_ROWS,
  type LeadFormEditableFilterRow,
} from '@/features/platform/model/lead-form-search';

interface LeadFormAdvancedFiltersProps {
  readonly rows: readonly LeadFormEditableFilterRow[];
  readonly filterOptionLabels: readonly string[];
  readonly onChange: (rows: LeadFormEditableFilterRow[]) => void;
  readonly questionPlaceholder: string;
  readonly valuePlaceholder: string;
  readonly removeRowLabel: string;
  readonly addRowLabel: string;
  readonly andLabel: string;
}

// One row per `filterOptionLabels` entry is the realistic ceiling — MAX_FILTER_ROWS (5) is a
// separate, smaller cap on the request itself (docs/14-API_CONTRACTS.md), enforced here too so
// "+ Adicionar filtro" never builds a request the backend will reject outright.
export function LeadFormAdvancedFilters({
  rows,
  filterOptionLabels,
  onChange,
  questionPlaceholder,
  valuePlaceholder,
  removeRowLabel,
  addRowLabel,
  andLabel,
}: LeadFormAdvancedFiltersProps): React.JSX.Element {
  function updateRow(id: string, next: Partial<LeadFormEditableFilterRow>): void {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }

  function removeRow(id: string): void {
    onChange(rows.filter((row) => row.id !== id));
  }

  function addRow(): void {
    onChange([...rows, createEmptyFilterRow()]);
  }

  return (
    <div className="space-y-2" data-testid="leads-advanced-filters">
      {rows.map((row, index) => {
        const valueInvalid = row.value.trim().length > 0 && !isSearchTermValid(row.value);
        return (
          <div key={row.id}>
            {index > 0 && (
              <p className="my-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
                {andLabel}
              </p>
            )}
            <div
              className="grid grid-cols-[1fr_1fr_auto] items-center gap-2.5"
              data-testid="leads-filter-row"
            >
              <Select
                value={row.questionLabel}
                onValueChange={(value) => updateRow(row.id, { questionLabel: value })}
              >
                <SelectTrigger data-testid="leads-filter-row-question">
                  <SelectValue placeholder={questionPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {filterOptionLabels.map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="text"
                value={row.value}
                onChange={(event) => updateRow(row.id, { value: event.target.value })}
                placeholder={valuePlaceholder}
                data-testid="leads-filter-row-value"
                aria-invalid={valueInvalid}
                className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-500"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={removeRowLabel}
                data-testid="leads-filter-row-remove"
                onClick={() => removeRow(row.id)}
              >
                <X className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          </div>
        );
      })}

      {rows.length < MAX_FILTER_ROWS && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-1"
          data-testid="leads-filter-add-row"
          onClick={addRow}
        >
          <Plus className="h-3.5 w-3.5" />
          {addRowLabel}
        </Button>
      )}
    </div>
  );
}
