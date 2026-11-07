import { useTranslations } from 'next-intl';
import type { LeadFormQuestion } from '@ikaro/types';
import { BrandedFeedbackMessage } from '@/shared/components/hotsite/branded-feedback-message';
import type { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';
import { ContactField } from './ContactField';
import {
  questionFieldName,
  type LeadFormAnswers,
} from '@/features/platform/model/lead-form-fields';
import { LeadFormPhoneField } from './LeadFormPhoneField';
import { LeadFormQuestionField } from './LeadFormQuestionField';
import { TurnstileWidget } from './TurnstileWidget';

/** The form's feedback state: the banner message, the field marks and the focus registry. */
export type LeadFormFeedback = ReturnType<typeof useFormFeedback>;

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-btn-radius, var(--ba-radius))',
};

interface LeadFormFieldsProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly questions: readonly LeadFormQuestion[];
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly phonePrefix: string;
  readonly onNameChange: (value: string) => void;
  readonly onEmailChange: (value: string) => void;
  readonly onPhoneChange: (value: string) => void;
  readonly showPrefilledNote: boolean;
  readonly answers: LeadFormAnswers;
  readonly onAnswerChange: (questionId: string, value: string | string[]) => void;
  readonly feedback: LeadFormFeedback;
  readonly isCaptchaError: boolean;
  readonly isTurnstileVerified: boolean;
  readonly isSubmitting: boolean;
  readonly turnstileKey: number;
  readonly onTurnstileVerify: (token: string) => void;
  readonly onTurnstileExpire: () => void;
  readonly onTurnstileError: () => void;
  readonly onTurnstileLoadTimeout: () => void;
  readonly onSubmit: () => void;
}

// The idle/submitting/validation-error/captcha-error render path — the one place, per
// story-discovery, where the form itself stays visible (unlike rate-limited/submission-error,
// which fully replace it with LeadFormTerminalCard).
export function LeadFormFields({
  title,
  subtitle,
  questions,
  name,
  email,
  phone,
  phonePrefix,
  onNameChange,
  onEmailChange,
  onPhoneChange,
  showPrefilledNote,
  answers,
  onAnswerChange,
  feedback,
  isCaptchaError,
  isTurnstileVerified,
  isSubmitting,
  turnstileKey,
  onTurnstileVerify,
  onTurnstileExpire,
  onTurnstileError,
  onTurnstileLoadTimeout,
  onSubmit,
}: LeadFormFieldsProps): React.JSX.Element {
  const t = useTranslations('hotsite');

  let submitButtonLabel = t('leadForm.submitButton');
  if (isSubmitting) {
    submitButtonLabel = t('leadForm.submittingButton');
  } else if (isCaptchaError) {
    submitButtonLabel = t('leadForm.retryButton');
  }

  let turnstileStatusLabel = t('leadForm.turnstilePendingTitle');
  if (isCaptchaError) {
    turnstileStatusLabel = t('leadForm.turnstileRedoTitle');
  } else if (isTurnstileVerified) {
    turnstileStatusLabel = t('leadForm.turnstileVerifiedTitle');
  }

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}
    >
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-1.5 text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mb-7 opacity-65">{subtitle}</p>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          noValidate
        >
          <fieldset
            disabled={isSubmitting}
            className="border-0 disabled:opacity-55"
            style={{
              backgroundColor: 'var(--ba-secondary)',
              borderRadius: 'var(--ba-radius)',
              padding: '1.5rem',
            }}
          >
            <h2 className="mb-4 text-base font-bold">{t('leadForm.yourInfoHeading')}</h2>
            {showPrefilledNote && (
              <p
                className="mb-3.5 text-xs"
                style={{ color: 'var(--ba-primary)' }}
                data-testid="lead-form-prefilled-note"
              >
                {t('leadForm.prefilledNote')}
              </p>
            )}

            <ContactField
              htmlId="lead-form-name"
              testId="lead-form-name"
              errorTestId="lead-form-name-error"
              label={t('leadForm.nameLabel')}
              placeholder={t('leadForm.namePlaceholder')}
              value={name}
              error={feedback.fieldErrors.name}
              errorId={feedback.fieldErrorId('name')}
              binding={feedback.fieldProps('name')}
              onChange={onNameChange}
            />
            <ContactField
              htmlId="lead-form-email"
              testId="lead-form-email"
              errorTestId="lead-form-email-error"
              type="email"
              label={t('leadForm.emailLabel')}
              placeholder={t('leadForm.emailPlaceholder')}
              value={email}
              error={feedback.fieldErrors.email}
              errorId={feedback.fieldErrorId('email')}
              binding={feedback.fieldProps('email')}
              onChange={onEmailChange}
            />
            <LeadFormPhoneField
              label={t('leadForm.phoneLabel')}
              value={phone}
              phonePrefix={phonePrefix}
              error={feedback.fieldErrors.phone}
              errorId={feedback.fieldErrorId('phone')}
              binding={feedback.fieldProps('phone')}
              onChange={onPhoneChange}
            />

            <hr className="my-6" style={{ borderColor: 'var(--ba-secondary)' }} />
            <h2 className="mb-4 text-base font-bold">{t('leadForm.aboutHeading')}</h2>

            {questions.map((question) => (
              <LeadFormQuestionField
                key={question.id}
                question={question}
                value={answers[question.id]}
                error={feedback.fieldErrors[questionFieldName(question.id)]}
                errorId={feedback.fieldErrorId(questionFieldName(question.id))}
                binding={feedback.fieldProps(questionFieldName(question.id))}
                onChange={(value) => onAnswerChange(question.id, value)}
              />
            ))}

            <div
              className="my-6 flex items-center gap-3 border border-dashed p-4"
              style={{ borderRadius: 'var(--ba-radius)', borderColor: 'var(--ba-secondary)' }}
            >
              <TurnstileWidget
                key={turnstileKey}
                siteKey={getPublicEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY')}
                onVerify={onTurnstileVerify}
                onExpire={onTurnstileExpire}
                onError={onTurnstileError}
                onLoadTimeout={onTurnstileLoadTimeout}
              />
              <p className="text-sm font-semibold">{turnstileStatusLabel}</p>
            </div>

            <button
              type="submit"
              data-testid="lead-form-submit"
              disabled={isSubmitting}
              style={btnStyle}
              className="w-full cursor-pointer border-2 px-8 py-3 text-center font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitButtonLabel}
            </button>

            {feedback.error && (
              <div className="mt-3.5">
                <BrandedFeedbackMessage
                  testId="lead-form-validation-banner"
                  title={t('leadForm.submissionErrorTitle')}
                >
                  {feedback.error}
                </BrandedFeedbackMessage>
              </div>
            )}

            {isCaptchaError && (
              <div className="mt-3.5">
                <BrandedFeedbackMessage
                  testId="lead-form-captcha-banner"
                  title={t('leadForm.captchaErrorTitle')}
                >
                  {t('leadForm.captchaErrorBody')}
                </BrandedFeedbackMessage>
              </div>
            )}
          </fieldset>
        </form>
      </div>
    </main>
  );
}
