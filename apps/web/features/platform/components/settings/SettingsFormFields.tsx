import { FIELD_INVALID_CLASS, FieldFeedback } from '@/shared/components/ui/field-feedback';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { NativeSelect } from '@/shared/components/ui/native-select';
import { Textarea } from '@/shared/components/ui/textarea';
import type { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import type { SettingsFormErrors } from '@/features/platform/settings-form';
import { cn } from '@/shared/utils/cn';

// Extracted from SettingsForm (TD37-S5A) — the reusable field primitives (label + input + hint +
// error, in various shapes) are a self-contained, fully generic concern, unrelated to the
// section-by-section form layout that consumes them. Split into this file for basic fields and
// SettingsFormAdvancedFields.tsx for the more specialized ones (phone, postal code, day row).

// The slice of the form's single `useFormFeedback` the fields need: the error message by field
// name, the ref + aria props that let the hook mark and focus the input, and its message id.
export type SettingsFieldFeedback = Pick<
  ReturnType<typeof useFormFeedback>,
  'fieldErrors' | 'fieldProps' | 'fieldErrorId'
>;

export type SettingsFieldName = keyof SettingsFormErrors;

interface FieldWiring {
  readonly error: string | undefined;
  readonly errorId: string;
  readonly hintId: string;
  readonly inputProps: ReturnType<SettingsFieldFeedback['fieldProps']>;
  readonly inputClassName: (base?: string) => string;
}

// The visible hint is announced with the input only while it is shown (no error); an error takes
// precedence, matching the `hint && !error` rendering in every field below.
export function settingsFieldWiring(
  feedback: SettingsFieldFeedback,
  name: SettingsFieldName,
  id: string,
  hint?: string,
): FieldWiring {
  const error = feedback.fieldErrors[name];
  const errorId = feedback.fieldErrorId(name);
  const hintId = `${id}-hint`;
  const describedBy = (error ? errorId : hint && hintId) || undefined;

  return {
    error,
    errorId,
    hintId,
    inputProps: { ...feedback.fieldProps(name), 'aria-describedby': describedBy },
    inputClassName: (base) => cn(base, error && FIELD_INVALID_CLASS),
  };
}

interface SuffixNumberFieldProps {
  readonly id: string;
  readonly name: SettingsFieldName;
  readonly label: string;
  readonly hint?: string;
  readonly suffix: string;
  readonly value: string;
  readonly feedback: SettingsFieldFeedback;
  readonly onChange: (value: string) => void;
}

export function SuffixNumberField({
  id,
  name,
  label,
  hint,
  suffix,
  value,
  feedback,
  onChange,
}: SuffixNumberFieldProps): React.JSX.Element {
  const field = settingsFieldWiring(feedback, name, id, hint);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative max-w-56">
        <Input
          id={id}
          data-testid={id}
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...field.inputProps}
          className={field.inputClassName('pr-16')}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
          {suffix}
        </span>
      </div>
      {hint && !field.error && (
        <p id={field.hintId} className="mt-1.5 text-sm text-gray-500">
          {hint}
        </p>
      )}
      <FieldFeedback id={field.errorId}>{field.error}</FieldFeedback>
    </div>
  );
}

interface TextFieldProps {
  readonly id: string;
  readonly name: SettingsFieldName;
  readonly label: string;
  readonly value: string;
  readonly feedback: SettingsFieldFeedback;
  readonly hint?: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly type?: 'text' | 'email' | 'tel' | 'url';
  readonly onChange: (value: string) => void;
}

export function TextField({
  id,
  name,
  label,
  value,
  feedback,
  hint,
  placeholder,
  maxLength,
  type = 'text',
  onChange,
}: TextFieldProps): React.JSX.Element {
  const field = settingsFieldWiring(feedback, name, id, hint);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        data-testid={id}
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        {...field.inputProps}
        className={field.inputClassName()}
      />
      {hint && !field.error && (
        <p id={field.hintId} className="mt-1.5 text-sm text-gray-500">
          {hint}
        </p>
      )}
      <FieldFeedback id={field.errorId}>{field.error}</FieldFeedback>
    </div>
  );
}

interface TextareaFieldProps {
  readonly id: string;
  readonly name: SettingsFieldName;
  readonly label: string;
  readonly value: string;
  readonly feedback: SettingsFieldFeedback;
  readonly hint?: string;
  readonly placeholder?: string;
  readonly onChange: (value: string) => void;
}

export function TextareaField({
  id,
  name,
  label,
  value,
  feedback,
  hint,
  placeholder,
  onChange,
}: TextareaFieldProps): React.JSX.Element {
  const field = settingsFieldWiring(feedback, name, id, hint);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        data-testid={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        {...field.inputProps}
        rows={5}
        className={field.inputClassName('min-h-32 resize-y')}
      />
      {hint && !field.error && (
        <p id={field.hintId} className="mt-1.5 text-sm text-gray-500">
          {hint}
        </p>
      )}
      <FieldFeedback id={field.errorId}>{field.error}</FieldFeedback>
    </div>
  );
}

interface SelectFieldProps {
  readonly id: string;
  readonly name: SettingsFieldName;
  readonly label: string;
  readonly hint?: string;
  readonly value: string;
  readonly feedback: SettingsFieldFeedback;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string) => void;
}

export function SelectField({
  id,
  name,
  label,
  hint,
  value,
  feedback,
  options,
  onChange,
}: SelectFieldProps): React.JSX.Element {
  const field = settingsFieldWiring(feedback, name, id, hint);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        data-testid={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...field.inputProps}
        className={field.inputClassName()}
        wrapperClassName="max-w-56"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      {hint && !field.error && (
        <p id={field.hintId} className="mt-1.5 text-sm text-gray-500">
          {hint}
        </p>
      )}
      <FieldFeedback id={field.errorId}>{field.error}</FieldFeedback>
    </div>
  );
}

interface ReadOnlyFieldProps {
  readonly testId: string;
  readonly label: string;
  readonly value: string;
}

export function ReadOnlyField({ testId, label, value }: ReadOnlyFieldProps): React.JSX.Element {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-gray-900">{label}</span>
      <p
        data-testid={testId}
        className="rounded-md border border-border bg-gray-50 px-3 py-2.5 text-sm text-gray-600"
      >
        {value}
      </p>
    </div>
  );
}
