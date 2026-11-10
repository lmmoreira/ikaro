'use client';

import { NumberInput } from '@/shared/components/ui/number-input';
import { Label } from '@/shared/components/ui/label';
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
  // The unit shown inside the field (already translated); money is a currency-symbol prefix.
  readonly unit: string;
  readonly unitPosition?: 'prefix' | 'suffix';
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
  unit,
  unitPosition,
  value,
  min,
  step,
  fields,
  onChange,
}: PolicyNumberFieldProps): React.JSX.Element {
  const message = fields.fieldErrors[name];

  return (
    <div>
      <Label htmlFor={id} className="mb-1 text-xs text-gray-500">
        {label}
      </Label>
      <NumberInput
        id={id}
        unit={unit}
        unitPosition={unitPosition}
        min={min}
        step={step}
        data-testid={testId}
        value={toNumberInput(value)}
        onChange={(event) => onChange(parseNullableNumber(event.target.value))}
        {...fields.fieldProps(name)}
        className={cn(message && FIELD_INVALID_CLASS)}
      />
      <FieldFeedback id={fields.fieldErrorId(name)}>{message}</FieldFeedback>
    </div>
  );
}
