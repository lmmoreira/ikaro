'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { submitBookingInfoAsCustomer } from '@/features/booking/api/customer';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { FIELD_INVALID_CLASS, FieldFeedback } from '@/shared/components/ui/field-feedback';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { cn } from '@/shared/utils/cn';
import { CustomerPhotoUpload } from './CustomerPhotoUpload';

/** The submit button lives in the action pane, so it names the form it submits. */
export const INFO_FORM_ID = 'info-response-form';

interface UseInfoSubmitOptions {
  readonly bookingId: string;
  readonly onSubmitted: () => void;
}

export interface InfoSubmitController {
  readonly bookingId: string;
  readonly form: ReturnType<typeof useFormFeedback>;
  readonly message: string;
  readonly photoUrls: string[];
  readonly isSubmitting: boolean;
  readonly failed: boolean;
  readonly feedback: FeedbackModel | null;
  readonly changeMessage: (value: string) => void;
  readonly setPhotoUrls: (filePaths: string[]) => void;
  readonly submit: () => Promise<void>;
}

/**
 * The state of the customer's answer to an information request. The fields render in the page
 * (`InfoSubmitForm`), the submit button and the failure message render in the action pane, so
 * the page owns this hook and hands it to both.
 */
export function useInfoSubmit({
  bookingId,
  onSubmitted,
}: UseInfoSubmitOptions): InfoSubmitController {
  const t = useTranslations('customer.infoSubmit');
  const form = useFormFeedback();
  const [message, setMessage] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(): Promise<void> {
    if (message.trim().length === 0) {
      form.setFieldErrors({ response: t('validationError') });
      return;
    }
    form.clear();
    setFailed(false);
    setIsSubmitting(true);
    try {
      await submitBookingInfoAsCustomer(bookingId, message.trim(), photoUrls);
      onSubmitted();
    } catch {
      form.setError(t('submitError'));
      setFailed(true);
      setIsSubmitting(false);
    }
  }

  function changeMessage(value: string): void {
    form.clear();
    setMessage(value);
  }

  const feedback: FeedbackModel | null =
    form.feedback === null ? null : { ...form.feedback, testId: 'info-submit-error' };

  return {
    bookingId,
    form,
    message,
    photoUrls,
    isSubmitting,
    failed,
    feedback,
    changeMessage,
    setPhotoUrls,
    submit,
  };
}

interface InfoSubmitButtonProps {
  readonly controller: InfoSubmitController;
}

export function InfoSubmitButton({ controller }: InfoSubmitButtonProps): React.JSX.Element {
  const t = useTranslations('customer.infoSubmit');
  let label = t('submit');
  if (controller.isSubmitting) label = t('submitting');
  else if (controller.failed) label = t('retry');

  return (
    <Button
      type="submit"
      form={INFO_FORM_ID}
      className="w-full"
      data-testid="info-submit-button"
      disabled={controller.isSubmitting}
    >
      {label}
    </Button>
  );
}

interface InfoSubmitFormProps {
  readonly infoRequestMessage: string;
  readonly controller: InfoSubmitController;
}

export function InfoSubmitForm({
  infoRequestMessage,
  controller,
}: InfoSubmitFormProps): React.JSX.Element {
  const t = useTranslations('customer.infoSubmit');
  const tItem = useTranslations('customer.bookingItem');
  const responseId = useId();
  const { form } = controller;
  const responseError = form.fieldErrors.response;

  return (
    <>
      <Card
        className="rounded-xl border-blue-200 bg-blue-50 p-4 shadow-none"
        data-testid="info-request-message"
      >
        <p className="text-sm font-semibold text-blue-900">{tItem('infoNeeded')}</p>
        <p className="mt-1 text-sm leading-relaxed text-blue-900">{infoRequestMessage}</p>
      </Card>

      <form
        id={INFO_FORM_ID}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void controller.submit();
        }}
      >
        <Card className="flex flex-col gap-3 rounded-xl border-gray-100 p-4 shadow-none">
          <div>
            <label htmlFor={responseId} className="text-sm font-semibold text-gray-900">
              {t('label')}
            </label>
            <textarea
              id={responseId}
              data-testid="info-response-textarea"
              value={controller.message}
              onChange={(event) => controller.changeMessage(event.target.value)}
              disabled={controller.isSubmitting}
              rows={4}
              className={cn(
                'mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none',
                responseError && FIELD_INVALID_CLASS,
              )}
              {...form.fieldProps('response')}
            />
            {responseError && (
              <div data-testid="info-validation-error">
                <FieldFeedback id={form.fieldErrorId('response')}>{responseError}</FieldFeedback>
              </div>
            )}
          </div>

          <CustomerPhotoUpload
            bookingId={controller.bookingId}
            value={controller.photoUrls}
            onChange={controller.setPhotoUrls}
          />
        </Card>
      </form>
    </>
  );
}
