'use client';

import { useTranslations } from 'next-intl';
import { useLeadFormData } from '@/features/platform/hooks/useLeadFormData';
import { useLeadFormState } from '@/features/platform/hooks/useLeadFormState';
import { Unavailable } from '@/shells/hotsite/components/Unavailable';
import { LeadFormFields } from './LeadFormFields';
import { LeadFormLoginRequiredGate } from './LeadFormLoginRequiredGate';
import { LeadFormSkeleton } from './LeadFormSkeleton';
import { LeadFormSuccess } from './LeadFormSuccess';
import { LeadFormTerminalCard } from './LeadFormTerminalCard';

interface LeadFormWidgetProps {
  readonly slug: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly phonePrefix: string;
}

// UC-039/UC-040 — one shared widget for guest and authenticated-customer.
export function LeadFormWidget({
  slug,
  title,
  subtitle,
  phonePrefix,
}: LeadFormWidgetProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const { config, customerProfile, moduleUnavailable, retryConfig } = useLeadFormData(slug);
  const {
    name,
    email,
    phone,
    answers,
    onNameChange,
    onEmailChange,
    onPhoneChange,
    onAnswerChange,
    feedback,
    phase,
    resetPhase,
    turnstileKey,
    isTurnstileVerified,
    onTurnstileVerify,
    onTurnstileExpire,
    onTurnstileError,
    onTurnstileLoadTimeout,
    submit,
  } = useLeadFormState({ slug, config, customerProfile });

  if (moduleUnavailable) {
    return <Unavailable />;
  }

  if (config === undefined || customerProfile === undefined) {
    return <LeadFormSkeleton title={title} />;
  }

  if (config === null) {
    return (
      <LeadFormTerminalCard
        icon="⚠"
        title={t('leadForm.submissionErrorTitle')}
        body={t('leadForm.submissionErrorBody')}
        slug={slug}
        retryLabel={t('leadForm.retryButton')}
        onRetry={retryConfig}
      />
    );
  }

  if (config.audienceMode === 'CUSTOMER_ONLY' && customerProfile === null) {
    return <LeadFormLoginRequiredGate slug={slug} />;
  }

  if (phase === 'rate-limited') {
    return (
      <LeadFormTerminalCard
        icon="⏳"
        title={t('leadForm.rateLimitedTitle')}
        body={t('leadForm.rateLimitedBody')}
        slug={slug}
      />
    );
  }

  if (phase === 'submission-error') {
    return (
      <LeadFormTerminalCard
        icon="⚠"
        title={t('leadForm.submissionErrorTitle')}
        body={t('leadForm.submissionErrorBody')}
        slug={slug}
        retryLabel={t('leadForm.retryButton')}
        onRetry={resetPhase}
      />
    );
  }

  if (phase === 'success') {
    return <LeadFormSuccess slug={slug} />;
  }

  return (
    <LeadFormFields
      title={title}
      subtitle={subtitle}
      questions={[...config.questions].sort((a, b) => a.order - b.order)}
      name={name}
      email={email}
      phone={phone}
      phonePrefix={phonePrefix}
      onNameChange={onNameChange}
      onEmailChange={onEmailChange}
      onPhoneChange={onPhoneChange}
      showPrefilledNote={!!customerProfile}
      answers={answers}
      onAnswerChange={onAnswerChange}
      feedback={feedback}
      isCaptchaError={phase === 'captcha-error'}
      isTurnstileVerified={isTurnstileVerified}
      isSubmitting={phase === 'submitting'}
      turnstileKey={turnstileKey}
      onTurnstileVerify={onTurnstileVerify}
      onTurnstileExpire={onTurnstileExpire}
      onTurnstileError={onTurnstileError}
      onTurnstileLoadTimeout={onTurnstileLoadTimeout}
      onSubmit={() => void submit()}
    />
  );
}
