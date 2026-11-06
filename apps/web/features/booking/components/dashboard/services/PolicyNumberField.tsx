'use client';

import { Input } from '@/shared/components/ui/input';
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
      <Label htmlFor={id} className="mb-1 text-xs text-gray-500">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
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
