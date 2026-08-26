import { useTranslations } from 'next-intl';
import type { LeadFormQuestion } from '@ikaro/types';
import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';
import { LeadFormQuestionField } from './LeadFormQuestionField';
import { TurnstileWidget } from './TurnstileWidget';

export interface LeadFormFieldErrors {
  name?: string;
  email?: string;
  phone?: string;
  questions: Record<string, string>;
}

type Answers = Record<string, string | string[]>;

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
  readonly answers: Answers;
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

  return (
    <div className="mx-auto max-w-2xl px-6 py-12" style={{ color: 'var(--ba-text)' }}>
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
          <p className="mb-3.5 text-xs" style={{ color: 'var(--ba-primary)' }}>
            {t('leadForm.prefilledNote')}
          </p>
        )}

        <ContactField
          id="name"
          label={t('leadForm.nameLabel')}
          placeholder={t('leadForm.namePlaceholder')}
          value={name}
          error={fieldErrors.name}
          onChange={onNameChange}
        />
        <ContactField
          id="email"
          type="email"
          label={t('leadForm.emailLabel')}
          placeholder={t('leadForm.emailPlaceholder')}
          value={email}
          error={fieldErrors.email}
          onChange={onEmailChange}
        />
        <ContactField
          id="phone"
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
          type="button"
          data-testid="lead-form-submit"
          disabled={isSubmitting}
          onClick={onSubmit}
          style={btnStyle}
          className="w-full border-2 px-8 py-3 text-center font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting
            ? t('leadForm.submittingButton')
            : isCaptchaError
              ? t('leadForm.retryButton')
              : t('leadForm.submitButton')}
        </button>
      </fieldset>
    </div>
  );
}

interface ContactFieldProps {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly error?: string;
  readonly type?: string;
  readonly onChange: (value: string) => void;
}

function ContactField({
  id,
  label,
  placeholder,
  value,
  error,
  type,
  onChange,
}: ContactFieldProps): React.JSX.Element {
  return (
    <div className="mb-5">
      <label className="mb-2 block font-medium" htmlFor={`lead-form-${id}`}>
        {label} <span className="text-red-600">*</span>
      </label>
      <input
        id={`lead-form-${id}`}
        type={type ?? 'text'}
        data-testid={`lead-form-${id}`}
        className="w-full border px-3 py-2"
        style={{ borderRadius: 'var(--ba-radius)' }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p className="mt-1.5 text-sm text-red-600" data-testid={`lead-form-${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
