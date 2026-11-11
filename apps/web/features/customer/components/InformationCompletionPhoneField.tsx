import type React from 'react';
import { buildContactPhone } from '@/shared/utils/contact-phone';
import {
  BRANDED_FIELD_INVALID_CLASS,
  BrandedFieldFeedback,
} from '@/shared/components/hotsite/branded-field-feedback';
import { BRANDED_FEEDBACK_PALETTE } from '@/shared/components/hotsite/branded-feedback-palette';
import {
  BRANDED_FIELD_PLACEHOLDER_CLASS,
  brandedFieldStyle,
} from '@/shared/components/hotsite/branded-field-style';
import { cn } from '@/shared/utils/cn';
import {
  formatPhoneForDisplay,
  phonePlaceholder,
  sanitizePhoneInput,
} from '@/shared/utils/phone-format';

interface InformationCompletionPhoneFieldProps {
  readonly phonePrefix: string;
  readonly localPhoneDigits: string;
  readonly onChangeLocalDigits: (fullPhone: string) => void;
  readonly label: string;
  readonly error?: string;
  readonly errorId?: string;
  readonly inputProps?: React.InputHTMLAttributes<HTMLInputElement> & {
    readonly ref?: (element: HTMLElement | null) => void;
  };
}

export function InformationCompletionPhoneField({
  phonePrefix,
  localPhoneDigits,
  onChangeLocalDigits,
  label,
  error,
  errorId = 'information-completion-phone-error-message',
  inputProps,
}: InformationCompletionPhoneFieldProps): React.JSX.Element {
  return (
    <>
      <label htmlFor="information-completion-phone" className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="flex">
        <span
          data-testid="information-completion-phone-prefix"
          className="flex items-center border border-r-0 px-3 text-sm font-medium"
          style={{
            ...brandedFieldStyle(),
            borderRadius: 'var(--ba-radius) 0 0 var(--ba-radius)',
          }}
        >
          {phonePrefix}
        </span>
        <input
          id="information-completion-phone"
          type="tel"
          inputMode="numeric"
          required
          data-testid="information-completion-phone-input"
          placeholder={phonePlaceholder(phonePrefix)}
          value={formatPhoneForDisplay(localPhoneDigits, phonePrefix)}
          onChange={(e) => {
            const input = sanitizePhoneInput(e.target.value, phonePrefix);
            onChangeLocalDigits(buildContactPhone(input, phonePrefix));
          }}
          className={cn(
            'min-w-0 flex-1 border px-3 py-2',
            BRANDED_FIELD_PLACEHOLDER_CLASS,
            error && BRANDED_FIELD_INVALID_CLASS,
          )}
          {...inputProps}
          style={{
            ...brandedFieldStyle(),
            borderRadius: '0 var(--ba-radius) var(--ba-radius) 0',
            borderColor: error ? BRANDED_FEEDBACK_PALETTE.error.border : 'var(--ba-secondary)',
          }}
        />
      </div>
      {error && (
        <div data-testid="information-completion-phone-error">
          <BrandedFieldFeedback id={errorId}>{error}</BrandedFieldFeedback>
        </div>
      )}
    </>
  );
}
