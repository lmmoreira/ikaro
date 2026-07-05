'use client';

import { useId, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { submitInfo } from '../../api';
import { CustomerPhotoUpload } from './CustomerPhotoUpload';

interface InfoSubmitFormProps {
  readonly bookingId: string;
  readonly infoRequestMessage: string;
  readonly onSubmitted: () => void;
}

type FormState = 'idle' | 'submitting' | 'error';

function submitLabel(state: FormState, t: (key: string) => string): string {
  if (state === 'submitting') return t('submitting');
  if (state === 'error') return t('retry');
  return t('submit');
}

export function InfoSubmitForm({
  bookingId,
  infoRequestMessage,
  onSubmitted,
}: InfoSubmitFormProps): React.JSX.Element {
  const t = useTranslations('customer.infoSubmit');
  const [message, setMessage] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [state, setState] = useState<FormState>('idle');
  const [validationError, setValidationError] = useState(false);
  const responseId = useId();

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (message.trim().length === 0) {
      setValidationError(true);
      return;
    }
    setValidationError(false);
    setState('submitting');
    try {
      await submitInfo(bookingId, message.trim(), photoUrls);
      onSubmitted();
    } catch {
      setState('error');
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4"
    >
      <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
        {infoRequestMessage}
      </div>

      {state === 'error' && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {t('submitError')}
        </p>
      )}

      <div>
        <label htmlFor={responseId} className="text-sm font-semibold text-gray-900">
          {t('label')}
        </label>
        <textarea
          id={responseId}
          data-testid="info-response-textarea"
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            if (validationError) setValidationError(false);
          }}
          disabled={state === 'submitting'}
          rows={4}
          className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
        />
        {validationError && (
          <p data-testid="info-validation-error" className="mt-1 text-xs font-medium text-red-600">
            {t('validationError')}
          </p>
        )}
      </div>

      <CustomerPhotoUpload bookingId={bookingId} value={photoUrls} onChange={setPhotoUrls} />

      <button
        type="submit"
        disabled={state === 'submitting'}
        className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {submitLabel(state, t)}
      </button>
    </form>
  );
}
