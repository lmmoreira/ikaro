import { useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import type { CustomerProfileResponse, HotsiteLeadFormConfigResponse } from '@ikaro/types';
import {
  submitLeadFormClient,
  type SubmitLeadFormResult,
} from '@/features/platform/hotsite/api/lead-form';
import {
  questionFieldName,
  type LeadFormAnswers,
} from '@/features/platform/model/lead-form-fields';
import { serverFieldError } from '@/features/platform/model/lead-form-server-field';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';

export type SubmitPhase =
  | 'idle'
  | 'submitting'
  | 'validation-error'
  | 'captcha-error'
  | 'rate-limited'
  | 'submission-error'
  | 'success';

type LeadFormFeedback = ReturnType<typeof useFormFeedback>;
type Translator = ReturnType<typeof useTranslations>;
type SetPhase = Dispatch<SetStateAction<SubmitPhase>>;
type SubmitFailure = Extract<SubmitLeadFormResult, { readonly ok: false }>;

interface LeadFormValues {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly answers: LeadFormAnswers;
}

const EMAIL_SCHEMA = z.email();

function isAnswerBlank(value: string | string[] | undefined): boolean {
  if (value === undefined) return true;
  return Array.isArray(value) ? value.length === 0 : value.trim().length === 0;
}

function validateLeadForm(
  values: LeadFormValues,
  config: HotsiteLeadFormConfigResponse,
  t: Translator,
): Record<string, string> | null {
  const errors: Record<string, string> = {};
  if (!values.name.trim()) errors.name = t('leadForm.nameRequired');
  if (!EMAIL_SCHEMA.safeParse(values.email).success) errors.email = t('leadForm.emailRequired');
  if (!values.phone.trim()) errors.phone = t('leadForm.phoneRequired');
  for (const question of config.questions) {
    if (question.required && isAnswerBlank(values.answers[question.id])) {
      errors[questionFieldName(question.id)] =
        question.type === 'TEXT' ? t('leadForm.questionRequired') : t('leadForm.selectOption');
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
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

// What a rejected submission leaves on screen: the phase its code maps to and, for a field the
// server rejected, the banner and the mark on that field.
function showSubmissionFailure(
  failure: SubmitFailure,
  config: HotsiteLeadFormConfigResponse,
  feedback: LeadFormFeedback,
  t: Translator,
  setPhase: SetPhase,
): void {
  const nextPhase = resolveErrorPhase(failure);
  setPhase(nextPhase);
  if (nextPhase !== 'validation-error') return;
  feedback.setError(t('leadForm.validationBanner'));
  const fieldErrors = serverFieldError(failure.field, config.questions, t);
  if (fieldErrors) feedback.setFieldErrors(fieldErrors);
}

// The visitor's contact fields and answers. A contact field is the visitor's own edit when they
// made one, else the signed-in customer's profile value — derived, not synced through an effect,
// which avoids the cascading render a "prefill once the profile resolves" effect would cause.
function useLeadFormInputs(
  customerProfile: CustomerProfileResponse | null | undefined,
  feedback: LeadFormFeedback,
) {
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [emailOverride, setEmailOverride] = useState<string | null>(null);
  const [phoneOverride, setPhoneOverride] = useState<string | null>(null);
  const [answers, setAnswers] = useState<LeadFormAnswers>({});

  return {
    name: nameOverride ?? customerProfile?.name ?? '',
    email: emailOverride ?? customerProfile?.email ?? '',
    phone: phoneOverride ?? customerProfile?.phone ?? '',
    answers,
    onNameChange: feedback.edit(setNameOverride),
    onEmailChange: feedback.edit(setEmailOverride),
    onPhoneChange: feedback.edit(setPhoneOverride),
    onAnswerChange: (questionId: string, value: string | string[]): void => {
      feedback.clear();
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
    },
  };
}

// The captcha token, the key that remounts the widget, and how the widget's events move the phase.
function useTurnstileGate(setPhase: SetPhase) {
  const [token, setToken] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  function reset(): void {
    setToken(null);
    setKey((k) => k + 1);
  }

  return {
    turnstileToken: token,
    turnstileKey: key,
    resetTurnstile: reset,
    onTurnstileVerify: (verifiedToken: string): void => {
      setToken(verifiedToken);
      // A re-verification after the timeout/server-rejection remount must clear the captcha-error
      // banner immediately, not leave it showing "redo verification" with a now-valid token until
      // the next submit click resets the phase as a side effect. Only 'captcha-error' is cleared —
      // any other phase is preserved.
      setPhase((currentPhase) => (currentPhase === 'captcha-error' ? 'idle' : currentPhase));
    },
    onTurnstileExpire: (): void => setToken(null),
    onTurnstileError: (): void => setToken(null),
    // The same reset a server-rejected token gets, which reuses the existing retry UI and copy.
    onTurnstileLoadTimeout: (): void => {
      reset();
      setPhase('captcha-error');
    },
  };
}

interface UseLeadFormSubmitParams {
  readonly slug: string;
  readonly config: HotsiteLeadFormConfigResponse | null | undefined;
  readonly values: LeadFormValues;
  readonly feedback: LeadFormFeedback;
  readonly turnstileToken: string | null;
  readonly resetTurnstile: () => void;
  readonly setPhase: SetPhase;
}

// Validates, checks the captcha, sends, and shows what came back.
function useLeadFormSubmit(params: UseLeadFormSubmitParams): () => Promise<void> {
  const { slug, config, values, feedback, turnstileToken, resetTurnstile, setPhase } = params;
  const t = useTranslations('hotsite');

  return async function submit(): Promise<void> {
    if (!config) return;
    feedback.clear();
    const validationErrors = validateLeadForm(values, config, t);
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
    const answers = Object.entries(values.answers).map(([questionId, value]) => ({
      questionId,
      value,
    }));
    const result = await submitLeadFormClient(slug, { ...values, answers, turnstileToken });
    if (result.ok) {
      setPhase('success');
      return;
    }
    resetTurnstile();
    showSubmissionFailure(result, config, feedback, t, setPhase);
  };
}

interface UseLeadFormStateParams {
  readonly slug: string;
  readonly config: HotsiteLeadFormConfigResponse | null | undefined;
  readonly customerProfile: CustomerProfileResponse | null | undefined;
}

// The lead form's state machine: what the visitor typed, the captcha, and where a submission is.
export function useLeadFormState({ slug, config, customerProfile }: UseLeadFormStateParams) {
  const feedback = useFormFeedback();
  const inputs = useLeadFormInputs(customerProfile, feedback);
  const [phase, setPhase] = useState<SubmitPhase>('idle');
  const { turnstileToken, resetTurnstile, ...turnstile } = useTurnstileGate(setPhase);
  const { name, email, phone, answers } = inputs;
  const submit = useLeadFormSubmit({
    slug,
    config,
    values: { name, email, phone, answers },
    feedback,
    turnstileToken,
    resetTurnstile,
    setPhase,
  });

  return {
    ...inputs,
    ...turnstile,
    feedback,
    phase,
    resetPhase: (): void => setPhase('idle'),
    isTurnstileVerified: !!turnstileToken,
    submit,
  };
}
