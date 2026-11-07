// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CustomerProfileResponse,
  HotsiteLeadFormConfigResponse,
  LeadFormQuestionType,
} from '@ikaro/types';
import {
  submitLeadFormClient,
  type SubmitLeadFormResult,
} from '@/features/platform/hotsite/api/lead-form';
import { useLeadFormState } from './useLeadFormState';

vi.mock('@/features/platform/hotsite/api/lead-form', () => ({ submitLeadFormClient: vi.fn() }));

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const CONFIG: HotsiteLeadFormConfigResponse = {
  audienceMode: 'GUEST_AND_CUSTOMER',
  questions: [
    { id: 'q1', label: 'Qual serviço?', type: 'TEXT', required: true, order: 1 },
    {
      id: 'q2',
      label: 'Melhor dia?',
      type: 'SINGLE_CHOICE',
      required: false,
      options: ['Manhã', 'Tarde'],
      order: 2,
    },
  ],
};

const PROFILE: CustomerProfileResponse = {
  customerId: 'cust-1',
  name: 'Maria Fernanda Costa',
  email: 'maria.fernanda@email.com',
  phone: '+5511977771234',
  defaultAddress: null,
};

interface StateProps {
  readonly slug: string;
  readonly config: HotsiteLeadFormConfigResponse | null | undefined;
  readonly customerProfile: CustomerProfileResponse | null | undefined;
}

function renderState(overrides: Partial<StateProps> = {}) {
  const initialProps: StateProps = {
    slug: 'lavacar',
    config: CONFIG,
    customerProfile: null,
    ...overrides,
  };
  return renderHook((props: StateProps) => useLeadFormState(props), { initialProps });
}

type State = ReturnType<typeof renderState>['result'];

function fillValid(result: State): void {
  act(() => {
    result.current.onNameChange('Carlos Mendes');
    result.current.onEmailChange('carlos@example.com');
    result.current.onPhoneChange('11988887777');
    result.current.onAnswerChange('q1', 'Lavagem completa');
  });
}

async function submit(result: State): Promise<void> {
  await act(async () => {
    await result.current.submit();
  });
}

function failure(code?: string, field?: string): SubmitLeadFormResult {
  return { ok: false, status: 422, code, field };
}

describe('useLeadFormState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(submitLeadFormClient).mockResolvedValue({ ok: true, submissionId: 'sub-1' });
  });

  describe('contact fields and answers', () => {
    it('prefills the contact fields from the signed-in customer', () => {
      const { result } = renderState({ customerProfile: PROFILE });

      expect(result.current).toMatchObject({
        name: 'Maria Fernanda Costa',
        email: 'maria.fernanda@email.com',
        phone: '+5511977771234',
      });
    });

    it('lets an edit win over the profile for that field only', () => {
      const { result } = renderState({ customerProfile: PROFILE });

      act(() => result.current.onNameChange('Outro Nome'));

      expect(result.current.name).toBe('Outro Nome');
      expect(result.current.email).toBe('maria.fernanda@email.com');
    });

    it.each([null, undefined])('starts empty when the profile is %s', (customerProfile) => {
      const { result } = renderState({ customerProfile });

      expect(result.current).toMatchObject({ name: '', email: '', phone: '', answers: {} });
    });

    it('clears the feedback when a contact field or an answer changes', () => {
      const { result } = renderState();
      act(() => result.current.feedback.setError('antigo'));
      act(() => result.current.onEmailChange('a@b.co'));
      expect(result.current.feedback.error).toBeNull();

      act(() => result.current.feedback.setError('antigo'));
      act(() => result.current.onAnswerChange('q1', 'Texto'));
      expect(result.current.feedback.error).toBeNull();
      expect(result.current.answers).toEqual({ q1: 'Texto' });
    });
  });

  describe('validation', () => {
    it('refuses an empty form, marks every missing field and sends nothing', async () => {
      const { result } = renderState();

      await submit(result);

      expect(result.current.phase).toBe('validation-error');
      expect(result.current.feedback.error).toBe('leadForm.validationBanner');
      expect(result.current.feedback.fieldErrors).toEqual({
        name: 'leadForm.nameRequired',
        email: 'leadForm.emailRequired',
        phone: 'leadForm.phoneRequired',
        'question:q1': 'leadForm.questionRequired',
      });
      expect(submitLeadFormClient).not.toHaveBeenCalled();
    });

    it('rejects a malformed email on its own', async () => {
      const { result } = renderState();
      fillValid(result);
      act(() => result.current.onEmailChange('not-an-email'));

      await submit(result);

      expect(result.current.feedback.fieldErrors).toEqual({ email: 'leadForm.emailRequired' });
    });

    const REQUIRED_CHOICES: ReadonlyArray<
      readonly [string, LeadFormQuestionType, string[] | undefined]
    > = [
      ['a required single choice', 'SINGLE_CHOICE', undefined],
      ['a required multiple choice with nothing ticked', 'MULTIPLE_CHOICE', []],
    ];

    it.each(REQUIRED_CHOICES)('asks to select an option for %s', async (_label, type, answer) => {
      const { result } = renderState({
        config: {
          audienceMode: 'GUEST_AND_CUSTOMER',
          questions: [{ id: 'q9', label: 'Dia', type, required: true, options: ['A'], order: 1 }],
        },
      });
      fillValid(result);
      if (answer) act(() => result.current.onAnswerChange('q9', answer));

      await submit(result);

      expect(result.current.feedback.fieldErrors).toEqual({
        'question:q9': 'leadForm.selectOption',
      });
    });

    it('lets an optional question stay blank', async () => {
      const { result } = renderState();
      fillValid(result);
      act(() => result.current.onTurnstileVerify('tok-1'));

      await submit(result);

      expect(result.current.phase).toBe('success');
    });

    it.each([null, undefined])('does nothing without a configuration (%s)', async (config) => {
      const { result } = renderState({ config });

      await submit(result);

      expect(result.current.phase).toBe('idle');
      expect(submitLeadFormClient).not.toHaveBeenCalled();
    });
  });

  describe('submitting', () => {
    it('asks for the captcha again when there is no token and sends nothing', async () => {
      const { result } = renderState();
      fillValid(result);

      await submit(result);

      expect(result.current.phase).toBe('captcha-error');
      expect(submitLeadFormClient).not.toHaveBeenCalled();
    });

    it('sends the contact, the answers and the token, and ends on success', async () => {
      const { result } = renderState();
      fillValid(result);
      act(() => result.current.onTurnstileVerify('tok-1'));

      await submit(result);

      expect(submitLeadFormClient).toHaveBeenCalledWith('lavacar', {
        name: 'Carlos Mendes',
        email: 'carlos@example.com',
        phone: '11988887777',
        answers: [{ questionId: 'q1', value: 'Lavagem completa' }],
        turnstileToken: 'tok-1',
      });
      expect(result.current.phase).toBe('success');
    });

    it('is submitting while the request is in flight', async () => {
      let finish: (value: SubmitLeadFormResult) => void = () => undefined;
      vi.mocked(submitLeadFormClient).mockReturnValue(
        new Promise<SubmitLeadFormResult>((resolve) => (finish = resolve)),
      );
      const { result } = renderState();
      fillValid(result);
      act(() => result.current.onTurnstileVerify('tok-1'));

      let sending: Promise<void> = Promise.resolve();
      act(() => {
        sending = result.current.submit();
      });
      expect(result.current.phase).toBe('submitting');

      await act(async () => {
        finish({ ok: true, submissionId: 'sub-1' });
        await sending;
      });
      expect(result.current.phase).toBe('success');
    });

    it.each([
      ['PLATFORM_LEAD_FORM_DAILY_CAP_REACHED', 'rate-limited'],
      ['PLATFORM_LEAD_FORM_TURNSTILE_VERIFICATION_FAILED', 'captcha-error'],
      ['GENERIC_FIELD_REQUIRED', 'validation-error'],
      ['EMAIL_FORMAT_INVALID', 'validation-error'],
      ['PHONE_FORMAT_INVALID', 'validation-error'],
      ['SOMETHING_ELSE', 'submission-error'],
      [undefined, 'submission-error'],
    ] as const)(
      'maps the rejection code %s to the %s phase and resets the captcha',
      async (code, phase) => {
        vi.mocked(submitLeadFormClient).mockResolvedValue(failure(code));
        const { result } = renderState();
        fillValid(result);
        act(() => result.current.onTurnstileVerify('tok-1'));
        const keyBefore = result.current.turnstileKey;

        await submit(result);

        expect(result.current.phase).toBe(phase);
        expect(result.current.isTurnstileVerified).toBe(false);
        expect(result.current.turnstileKey).toBe(keyBefore + 1);
      },
    );

    it.each([
      ['name', { name: 'leadForm.nameRequired' }],
      ['email', { email: 'leadForm.emailRequired' }],
      ['phone', { phone: 'leadForm.phoneRequired' }],
      ['answers.q1', { 'question:q1': 'leadForm.questionRequired' }],
    ])('marks the field the server rejected (%s) under the banner', async (field, expected) => {
      vi.mocked(submitLeadFormClient).mockResolvedValue(failure('GENERIC_FIELD_REQUIRED', field));
      const { result } = renderState();
      fillValid(result);
      act(() => result.current.onTurnstileVerify('tok-1'));

      await submit(result);

      expect(result.current.feedback.error).toBe('leadForm.validationBanner');
      expect(result.current.feedback.fieldErrors).toEqual(expected);
    });

    it('keeps only the banner for a field the form does not have', async () => {
      vi.mocked(submitLeadFormClient).mockResolvedValue(failure('GENERIC_FIELD_REQUIRED', 'zzz'));
      const { result } = renderState();
      fillValid(result);
      act(() => result.current.onTurnstileVerify('tok-1'));

      await submit(result);

      expect(result.current.feedback.error).toBe('leadForm.validationBanner');
      expect(result.current.feedback.fieldErrors).toEqual({});
    });

    it('leaves the form untouched for a rejection that is not a validation error', async () => {
      vi.mocked(submitLeadFormClient).mockResolvedValue(failure('SOMETHING_ELSE'));
      const { result } = renderState();
      fillValid(result);
      act(() => result.current.onTurnstileVerify('tok-1'));

      await submit(result);

      expect(result.current.feedback.error).toBeNull();
    });
  });

  describe('the captcha widget', () => {
    it('is verified once it reports a token', () => {
      const { result } = renderState();

      act(() => result.current.onTurnstileVerify('tok-1'));

      expect(result.current.isTurnstileVerified).toBe(true);
    });

    it('clears the captcha error on a new verification, and only that phase', async () => {
      const { result } = renderState();
      fillValid(result);
      await submit(result);
      expect(result.current.phase).toBe('captcha-error');

      act(() => result.current.onTurnstileVerify('tok-1'));
      expect(result.current.phase).toBe('idle');

      act(() => result.current.onEmailChange('not-an-email'));
      await submit(result);
      expect(result.current.phase).toBe('validation-error');
      act(() => result.current.onTurnstileVerify('tok-2'));
      expect(result.current.phase).toBe('validation-error');
    });

    it.each([['onTurnstileExpire'], ['onTurnstileError']] as const)(
      '%s drops the token',
      (handler) => {
        const { result } = renderState();
        act(() => result.current.onTurnstileVerify('tok-1'));

        act(() => result.current[handler]());

        expect(result.current.isTurnstileVerified).toBe(false);
      },
    );

    it('remounts the widget and asks for the captcha again on a load timeout', () => {
      const { result } = renderState();
      act(() => result.current.onTurnstileVerify('tok-1'));
      const keyBefore = result.current.turnstileKey;

      act(() => result.current.onTurnstileLoadTimeout());

      expect(result.current.isTurnstileVerified).toBe(false);
      expect(result.current.turnstileKey).toBe(keyBefore + 1);
      expect(result.current.phase).toBe('captcha-error');
    });
  });

  it('goes back to idle when the phase is reset', async () => {
    vi.mocked(submitLeadFormClient).mockResolvedValue(failure('SOMETHING_ELSE'));
    const { result } = renderState();
    fillValid(result);
    act(() => result.current.onTurnstileVerify('tok-1'));
    await submit(result);
    expect(result.current.phase).toBe('submission-error');

    act(() => result.current.resetPhase());

    expect(result.current.phase).toBe('idle');
  });
});
