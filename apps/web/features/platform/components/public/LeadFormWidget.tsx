'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import type { CustomerProfileResponse, HotsiteLeadFormConfigResponse } from '@ikaro/types';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import {
  fetchLeadFormConfigClient,
  submitLeadFormClient,
} from '@/features/platform/hotsite/api/lead-form';
import { LeadFormFields, type LeadFormAnswers, type LeadFormFieldErrors } from './LeadFormFields';
import { LeadFormLoginRequiredGate } from './LeadFormLoginRequiredGate';
import { LeadFormSkeleton } from './LeadFormSkeleton';
import { LeadFormSuccess } from './LeadFormSuccess';
import { LeadFormTerminalCard } from './LeadFormTerminalCard';

interface LeadFormWidgetProps {
  readonly slug: string;
  readonly title: string;
  readonly subtitle?: string;
}

type SubmitPhase =
  | 'idle'
  | 'submitting'
  | 'validation-error'
  | 'captcha-error'
  | 'rate-limited'
  | 'submission-error'
  | 'success';

const EMAIL_SCHEMA = z.email();

function isAnswerBlank(value: string | string[] | undefined): boolean {
  if (value === undefined) return true;
  return Array.isArray(value) ? value.length === 0 : value.trim().length === 0;
}

// UC-039/UC-040 — one shared widget for guest and authenticated-customer (story-discovery,
// M20-S09). Contact fields are derived from an optional user-edited override layered over the
// resolved customer profile, rather than synced via a useEffect setState — avoids the
// cascading-render footgun a direct "prefill once profile resolves" effect would create.
export function LeadFormWidget({ slug, title, subtitle }: LeadFormWidgetProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const [config, setConfig] = useState<HotsiteLeadFormConfigResponse | null | undefined>(undefined);
  const [customerProfile, setCustomerProfile] = useState<
    CustomerProfileResponse | null | undefined
  >(undefined);

  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [emailOverride, setEmailOverride] = useState<string | null>(null);
  const [phoneOverride, setPhoneOverride] = useState<string | null>(null);
  const name = nameOverride ?? customerProfile?.name ?? '';
  const email = emailOverride ?? customerProfile?.email ?? '';
  const phone = phoneOverride ?? customerProfile?.phone ?? '';

  const [answers, setAnswers] = useState<LeadFormAnswers>({});
  const [fieldErrors, setFieldErrors] = useState<LeadFormFieldErrors>({ questions: {} });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [phase, setPhase] = useState<SubmitPhase>('idle');
  const [configRequestVersion, setConfigRequestVersion] = useState(0);

  useEffect(() => {
    let active = true;
    fetchLeadFormConfigClient(slug)
      .then((result) => {
        if (active) setConfig(result);
      })
      .catch(() => {
        if (active) setConfig(null);
      });
    return () => {
      active = false;
    };
    // configRequestVersion has no value of its own — bumping it (the terminal card's onRetry
    // below) is the only way to re-run this effect and fetch again after a config-fetch failure,
    // since the effect otherwise only depends on slug, which never changes for a mounted retry
    // (PR #433 review, CodeRabbit: retrying used to just clear config and get stuck in the
    // loading skeleton forever, since nothing re-triggered the fetch).
  }, [slug, configRequestVersion]);

  useEffect(() => {
    let active = true;
    getHotsiteCustomerProfile(slug)
      .then((profile) => {
        if (active) setCustomerProfile(profile);
      })
      .catch(() => {
        if (active) setCustomerProfile(null);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  async function handleSubmit(): Promise<void> {
    if (!config) return;
    const validationErrors = validate();
    if (validationErrors) {
      setFieldErrors(validationErrors);
      setPhase('validation-error');
      return;
    }
    if (!turnstileToken) {
      setPhase('captcha-error');
      return;
    }

    setFieldErrors({ questions: {} });
    setPhase('submitting');

    const result = await submitLeadFormClient(slug, {
      name,
      email,
      phone,
      answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })),
      turnstileToken,
    });

    if (result.ok) {
      setPhase('success');
      return;
    }

    setTurnstileToken(null);
    setTurnstileKey((k) => k + 1);
    setPhase(resolveErrorPhase(result));
    if (result.field === 'name' || result.field === 'email' || result.field === 'phone') {
      setFieldErrors({ questions: {}, [result.field]: fieldRequiredMessage(result.field, t) });
    }
  }

  function validate(): LeadFormFieldErrors | null {
    if (!config) return null;
    const questionErrors: Record<string, string> = {};
    for (const question of config.questions) {
      if (question.required && isAnswerBlank(answers[question.id])) {
        questionErrors[question.id] =
          question.type === 'TEXT' ? t('leadForm.questionRequired') : t('leadForm.selectOption');
      }
    }

    const errors: LeadFormFieldErrors = {
      name: name.trim() ? undefined : t('leadForm.nameRequired'),
      email: EMAIL_SCHEMA.safeParse(email).success ? undefined : t('leadForm.emailRequired'),
      phone: phone.trim() ? undefined : t('leadForm.phoneRequired'),
      questions: questionErrors,
    };

    const hasErrors =
      !!errors.name || !!errors.email || !!errors.phone || Object.keys(errors.questions).length > 0;
    return hasErrors ? errors : null;
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
        onRetry={() => {
          setConfig(undefined);
          setConfigRequestVersion((version) => version + 1);
        }}
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
        onRetry={() => setPhase('idle')}
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
      onNameChange={setNameOverride}
      onEmailChange={setEmailOverride}
      onPhoneChange={setPhoneOverride}
      showPrefilledNote={!!customerProfile}
      answers={answers}
      onAnswerChange={(questionId, value) =>
        setAnswers((prev) => ({ ...prev, [questionId]: value }))
      }
      fieldErrors={fieldErrors}
      showValidationBanner={phase === 'validation-error'}
      isCaptchaError={phase === 'captcha-error'}
      isTurnstileVerified={!!turnstileToken}
      isSubmitting={phase === 'submitting'}
      turnstileKey={turnstileKey}
      onTurnstileVerify={setTurnstileToken}
      onTurnstileExpire={() => setTurnstileToken(null)}
      onTurnstileError={() => setTurnstileToken(null)}
      onSubmit={() => void handleSubmit()}
    />
  );
}

function resolveErrorPhase(result: { readonly code?: string }): SubmitPhase {
  if (result.code === 'PLATFORM_LEAD_FORM_DAILY_CAP_REACHED') return 'rate-limited';
  if (result.code === 'BFF_TURNSTILE_VERIFICATION_FAILED') return 'captcha-error';
  if (
    result.code === 'GENERIC_FIELD_REQUIRED' ||
    result.code === 'EMAIL_FORMAT_INVALID' ||
    result.code === 'PHONE_FORMAT_INVALID'
  ) {
    return 'validation-error';
  }
  return 'submission-error';
}

function fieldRequiredMessage(
  field: 'name' | 'email' | 'phone',
  t: ReturnType<typeof useTranslations>,
): string {
  if (field === 'email') return t('leadForm.emailRequired');
  if (field === 'phone') return t('leadForm.phoneRequired');
  return t('leadForm.nameRequired');
}
