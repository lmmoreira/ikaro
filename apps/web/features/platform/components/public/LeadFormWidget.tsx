'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { PlatformErrorCode } from '@ikaro/types';
import type { CustomerProfileResponse, HotsiteLeadFormConfigResponse } from '@ikaro/types';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import {
  fetchLeadFormConfigClient,
  submitLeadFormClient,
} from '@/features/platform/hotsite/api/lead-form';
import { extractProblemDetailShape } from '@/shared/lib/api/errors';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { Unavailable } from '@/shells/hotsite/components/Unavailable';
import { LeadFormFields, type LeadFormAnswers } from './LeadFormFields';
import { LeadFormLoginRequiredGate } from './LeadFormLoginRequiredGate';
import { questionFieldName } from './lead-form-field-binding';
import { serverFieldError } from './lead-form-server-field';
import { LeadFormSkeleton } from './LeadFormSkeleton';
import { LeadFormSuccess } from './LeadFormSuccess';
import { LeadFormTerminalCard } from './LeadFormTerminalCard';

interface LeadFormWidgetProps {
  readonly slug: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly phonePrefix: string;
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
export function LeadFormWidget({
  slug,
  title,
  subtitle,
  phonePrefix,
}: LeadFormWidgetProps): React.JSX.Element {
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
  const feedback = useFormFeedback();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [phase, setPhase] = useState<SubmitPhase>('idle');
  const [configRequestVersion, setConfigRequestVersion] = useState(0);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    fetchLeadFormConfigClient(slug)
      .then((result) => {
        if (active) setConfig(result);
      })
      .catch((err: unknown) => {
        if (!active) return;
        // The server-rendered page already checks the manifest's LEAD_FORM module state, but an
        // ISR-cached page can still be stale by the time this live client fetch runs — the
        // module may have been disabled in between. Route that specific case to the same
        // <Unavailable/> the server-side check renders, not the generic submission-error card
        // (Codex finding, PR #433 round 10).
        if (extractProblemDetailShape(err)?.code === PlatformErrorCode.LEAD_FORM_NOT_ENABLED) {
          setModuleUnavailable(true);
          return;
        }
        setConfig(null);
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
    feedback.clear();
    const validationErrors = validate();
    if (validationErrors) {
      feedback.setError(t('leadForm.validationBanner'));
      feedback.setFieldErrors(validationErrors);
      setPhase('validation-error');
      return;
    }
    if (!turnstileToken) {
      setPhase('captcha-error');
      return;
    }

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
    const nextPhase = resolveErrorPhase(result);
    setPhase(nextPhase);
    if (nextPhase === 'validation-error') {
      feedback.setError(t('leadForm.validationBanner'));
      const fieldErrors = serverFieldError(result.field, config.questions, t);
      if (fieldErrors) feedback.setFieldErrors(fieldErrors);
    }
  }

  function validate(): Record<string, string> | null {
    if (!config) return null;
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = t('leadForm.nameRequired');
    if (!EMAIL_SCHEMA.safeParse(email).success) errors.email = t('leadForm.emailRequired');
    if (!phone.trim()) errors.phone = t('leadForm.phoneRequired');
    for (const question of config.questions) {
      if (question.required && isAnswerBlank(answers[question.id])) {
        errors[questionFieldName(question.id)] =
          question.type === 'TEXT' ? t('leadForm.questionRequired') : t('leadForm.selectOption');
      }
    }
    return Object.keys(errors).length > 0 ? errors : null;
  }

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
      phonePrefix={phonePrefix}
      onNameChange={feedback.edit(setNameOverride)}
      onEmailChange={feedback.edit(setEmailOverride)}
      onPhoneChange={feedback.edit(setPhoneOverride)}
      showPrefilledNote={!!customerProfile}
      answers={answers}
      onAnswerChange={(questionId, value) => {
        feedback.clear();
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
      }}
      feedback={feedback}
      isCaptchaError={phase === 'captcha-error'}
      isTurnstileVerified={!!turnstileToken}
      isSubmitting={phase === 'submitting'}
      turnstileKey={turnstileKey}
      onTurnstileVerify={(token) => {
        setTurnstileToken(token);
        // A re-verification after the timeout/server-rejection remount must clear the
        // captcha-error banner immediately, not leave it showing "redo verification" with a
        // now-valid token until the next submit click resets phase as a side effect (M20-S15,
        // CodeRabbit round 1). Only 'captcha-error' is cleared — any other phase is preserved.
        setPhase((currentPhase) => (currentPhase === 'captcha-error' ? 'idle' : currentPhase));
      }}
      onTurnstileExpire={() => setTurnstileToken(null)}
      onTurnstileError={() => setTurnstileToken(null)}
      onTurnstileLoadTimeout={() => {
        // Same reset sequence handleSubmit's catch-branch already uses for a server-rejected
        // token — reuses the existing retry UI/copy instead of a new state (M20-S15).
        setTurnstileToken(null);
        setTurnstileKey((k) => k + 1);
        setPhase('captcha-error');
      }}
      onSubmit={() => void handleSubmit()}
    />
  );
}

function resolveErrorPhase(result: { readonly code?: string }): SubmitPhase {
  if (result.code === 'PLATFORM_LEAD_FORM_DAILY_CAP_REACHED') return 'rate-limited';
  if (result.code === 'PLATFORM_LEAD_FORM_TURNSTILE_VERIFICATION_FAILED') return 'captcha-error';
  if (
    result.code === 'GENERIC_FIELD_REQUIRED' ||
    result.code === 'EMAIL_FORMAT_INVALID' ||
    result.code === 'PHONE_FORMAT_INVALID'
  ) {
    return 'validation-error';
  }
  return 'submission-error';
}
