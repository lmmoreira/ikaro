'use client';

import { FIELD_INVALID_CLASS, FieldFeedback } from '@/shared/components/ui/field-feedback';
import { cn } from '@/shared/utils/cn';
import {
  parseNullableNumber,
  toNumberInput,
  type PolicyFieldBindings,
} from './policy-card-helpers';

interface PolicyNumberFieldProps {
  // The ProblemDetail `field` / validation key this input answers to.
  readonly name: string;
  readonly id: string;
  readonly testId: string;
  readonly label: string;
  readonly value: number | null;
  readonly min: number;
  readonly step?: string;
  readonly fields: PolicyFieldBindings;
  readonly onChange: (value: number | null) => void;
}

export function PolicyNumberField({
  name,
  id,
  testId,
  label,
  value,
  min,
  step,
  fields,
  onChange,
}: PolicyNumberFieldProps): React.JSX.Element {
  const message = fields.fieldErrors[name];

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-gray-500">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        step={step}
        data-testid={testId}
        value={toNumberInput(value)}
        onChange={(event) => onChange(parseNullableNumber(event.target.value))}
        {...fields.fieldProps(name)}
        className={cn(
          'w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500',
          message && FIELD_INVALID_CLASS,
        )}
      />
      <FieldFeedback id={fields.fieldErrorId(name)}>{message}</FieldFeedback>
    </div>
  );
}
