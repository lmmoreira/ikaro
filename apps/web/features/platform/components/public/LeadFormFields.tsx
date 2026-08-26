import { useTranslations } from 'next-intl';
import type { LeadFormQuestion } from '@ikaro/types';
import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';
import { LeadFormQuestionField } from './LeadFormQuestionField';
import { TurnstileWidget } from './TurnstileWidget';

export interface LeadFormFieldErrors {
  readonly name?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly questions: Record<string, string>;
}

export type LeadFormAnswers = Record<string, string | string[]>;

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

interface LeadFormFieldsProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly questions: readonly LeadFormQuestion[];
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly onNameChange: (value: string) => void;
  readonly onEmailChange: (value: string) => void;
  readonly onPhoneChange: (value: string) => void;
  readonly showPrefilledNote: boolean;
  readonly answers: LeadFormAnswers;
  readonly onAnswerChange: (questionId: string, value: string | string[]) => void;
  readonly fieldErrors: LeadFormFieldErrors;
  readonly showValidationBanner: boolean;
  readonly isCaptchaError: boolean;
  readonly isSubmitting: boolean;
  readonly turnstileKey: number;
  readonly onTurnstileVerify: (token: string) => void;
  readonly onTurnstileExpire: () => void;
  readonly onTurnstileError: () => void;
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
  onNameChange,
  onEmailChange,
  onPhoneChange,
  showPrefilledNote,
  answers,
  onAnswerChange,
  fieldErrors,
  showValidationBanner,
  isCaptchaError,
  isSubmitting,
  turnstileKey,
  onTurnstileVerify,
  onTurnstileExpire,
  onTurnstileError,
  onSubmit,
}: LeadFormFieldsProps): React.JSX.Element {
  const t = useTranslations('hotsite');

  let submitButtonLabel = t('leadForm.submitButton');
  if (isSubmitting) {
    submitButtonLabel = t('leadForm.submittingButton');
  } else if (isCaptchaError) {
    submitButtonLabel = t('leadForm.retryButton');
  }

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}
    >
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-1.5 text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mb-7 opacity-65">{subtitle}</p>}

        {showValidationBanner && (
          <div
            role="alert"
            data-testid="lead-form-validation-banner"
            className="mb-4 border border-red-300 bg-red-50 p-3.5 text-sm text-red-800"
            style={{ borderRadius: 'var(--ba-radius)' }}
          >
            {t('leadForm.validationBanner')}
          </div>
        )}

        {isCaptchaError && (
          <div
            role="alert"
            data-testid="lead-form-captcha-banner"
            className="mb-4 border border-amber-400 bg-amber-50 p-4"
            style={{ borderRadius: 'var(--ba-radius)' }}
          >
            <p className="font-bold text-amber-800">{t('leadForm.captchaErrorTitle')}</p>
            <p className="mt-1 text-sm leading-relaxed text-amber-800 opacity-90">
              {t('leadForm.captchaErrorBody')}
            </p>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
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
              error={fieldErrors.name}
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
              error={fieldErrors.email}
              onChange={onEmailChange}
            />
            <ContactField
              htmlId="lead-form-phone"
              testId="lead-form-phone"
              errorTestId="lead-form-phone-error"
              label={t('leadForm.phoneLabel')}
              placeholder={t('leadForm.phonePlaceholder')}
              value={phone}
              error={fieldErrors.phone}
              onChange={onPhoneChange}
            />

            <hr className="my-6" style={{ borderColor: 'var(--ba-secondary)' }} />
            <h2 className="mb-4 text-base font-bold">{t('leadForm.aboutHeading')}</h2>

            {questions.map((question) => (
              <LeadFormQuestionField
                key={question.id}
                question={question}
                value={answers[question.id]}
                error={fieldErrors.questions[question.id]}
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
              />
              <p className="text-sm font-semibold">
                {isCaptchaError
                  ? t('leadForm.turnstileRedoTitle')
                  : t('leadForm.turnstileVerifiedTitle')}
              </p>
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
          </fieldset>
        </form>
      </div>
    </main>
  );
}

interface ContactFieldProps {
  readonly htmlId: string;
  readonly testId: string;
  readonly errorTestId: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly error?: string;
  readonly type?: string;
  readonly onChange: (value: string) => void;
}

// testId/errorTestId are passed as literal strings from each call site above (one per fixed
// contact field), never derived by template literal — E2E-3 requires a static data-testid, with
// any per-instance data encoded in a separate data-* attribute instead.
function ContactField({
  htmlId,
  testId,
  errorTestId,
  label,
  placeholder,
  value,
  error,
  type,
  onChange,
}: ContactFieldProps): React.JSX.Element {
  return (
    <div className="mb-5">
      <label className="mb-2 block font-medium" htmlFor={htmlId}>
        {label} <span className="text-red-600">*</span>
      </label>
      <input
        id={htmlId}
        type={type ?? 'text'}
        data-testid={testId}
        className="w-full border px-3 py-2"
        style={{ borderRadius: 'var(--ba-radius)' }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p className="mt-1.5 text-sm text-red-600" data-testid={errorTestId}>
          {error}
        </p>
      )}
    </div>
  );
}
