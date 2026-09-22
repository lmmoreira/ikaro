import type React from 'react';
import { buildContactPhone } from '@/shared/utils/contact-phone';
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
}

export function InformationCompletionPhoneField({
  phonePrefix,
  localPhoneDigits,
  onChangeLocalDigits,
  label,
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
            borderRadius: 'var(--ba-radius) 0 0 var(--ba-radius)',
            borderColor: 'var(--ba-secondary)',
            backgroundColor: 'var(--ba-secondary)',
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
          className="min-w-0 flex-1 border px-3 py-2"
          style={{
            borderRadius: '0 var(--ba-radius) var(--ba-radius) 0',
            borderColor: 'var(--ba-secondary)',
            backgroundColor: 'var(--ba-secondary)',
            color: 'var(--ba-text)',
          }}
        />
      </div>
    </>
  );
}
