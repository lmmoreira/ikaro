// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffServiceResponse } from '@ikaro/types';
import { makeStaffService } from '@/features/booking/services/staff-service.fixture';
import { ApiError } from '@/shared/lib/api/errors';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { useServiceDetailsForm } from './useServiceDetailsForm';

const mockUpdateService = vi.fn();

vi.mock('@/features/booking/services/useServices', () => ({
  useUpdateService: () => ({ mutateAsync: mockUpdateService, isPending: false }),
}));

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

vi.mock('@/shared/lib/i18n/use-resolved-locale', () => ({ useResolvedLocale: () => 'pt-BR' }));

interface FormProps {
  readonly service: StaffServiceResponse;
  readonly isActive: boolean;
  readonly canSubmit: boolean;
}

function renderForm(overrides: Partial<FormProps> = {}) {
  const onDirtyChange = vi.fn();
  const dismissCreatedNotice = vi.fn();
  const initialProps: FormProps = {
    service: makeStaffService(),
    isActive: true,
    canSubmit: true,
    ...overrides,
  };
  const view = renderHook(
    (props: FormProps) => {
      const feedback = useFormFeedback();
      const form = useServiceDetailsForm({
        ...props,
        feedback,
        onDirtyChange,
        dismissCreatedNotice,
      });
      return { feedback, form };
    },
    { initialProps },
  );
  return { ...view, onDirtyChange, dismissCreatedNotice };
}

type SubmitArg = Parameters<
  ReturnType<typeof renderForm>['result']['current']['form']['handleSubmit']
>[0];

function submitEvent(preventDefault = vi.fn()): SubmitArg {
  return { preventDefault } as unknown as SubmitArg;
}

function pending() {
  let finish: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => (finish = resolve));
  return { promise, finish };
}

describe('useServiceDetailsForm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts from the service', () => {
    const { result } = renderForm();

    expect(result.current.form).toMatchObject({
      name: 'Lavagem Completa',
      description: 'Serviço completo',
      priceAmount: '180',
      durationMinutes: '60',
      loyaltyPointsValue: '20',
      requiresPickupAddress: true,
      savedRequiresPickupAddress: true,
      isSubmitting: false,
    });
  });

  it('shows a missing description as an empty field', () => {
    const { result } = renderForm({ service: makeStaffService({ description: null }) });

    expect(result.current.form.description).toBe('');
  });

  it.each([
    ['onNameChange', 'name', 'Lavagem Premium'],
    ['onDescriptionChange', 'description', 'Outra descrição'],
    ['onPriceAmountChange', 'priceAmount', '200'],
    ['onDurationMinutesChange', 'durationMinutes', '90'],
    ['onLoyaltyPointsValueChange', 'loyaltyPointsValue', '30'],
  ] as const)(
    '%s updates %s, clears the feedback and reports the tab dirty',
    (handler, field, value) => {
      const { result, onDirtyChange } = renderForm();
      act(() => result.current.feedback.setError('antigo'));

      act(() => result.current.form[handler](value));

      expect(result.current.form[field]).toBe(value);
      expect(result.current.feedback.error).toBeNull();
      expect(onDirtyChange).toHaveBeenCalledWith(true);
    },
  );

  it('toggles the pickup switch without touching the saved value', () => {
    const { result, onDirtyChange } = renderForm();

    act(() => result.current.form.onToggleRequiresPickupAddress());

    expect(result.current.form.requiresPickupAddress).toBe(false);
    expect(result.current.form.savedRequiresPickupAddress).toBe(true);
    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  it('applies the legs duration without reporting an edit', () => {
    const { result, onDirtyChange } = renderForm();

    act(() => result.current.form.applyLegsDuration(135));

    expect(result.current.form.durationMinutes).toBe('135');
    expect(onDirtyChange).not.toHaveBeenCalled();
  });

  it('sends nothing when this tab may not submit', async () => {
    const { result } = renderForm({ canSubmit: false });
    const preventDefault = vi.fn();

    await act(async () => result.current.form.handleSubmit(submitEvent(preventDefault)));

    expect(preventDefault).toHaveBeenCalled();
    expect(mockUpdateService).not.toHaveBeenCalled();
    expect(result.current.feedback.error).toBeNull();
  });

  it('refuses an inactive service with the blocked message', async () => {
    const { result } = renderForm({ isActive: false });

    await act(async () => result.current.form.handleSubmit(submitEvent()));

    expect(result.current.feedback.error).toBe('editInactiveUpdateBlocked');
    expect(mockUpdateService).not.toHaveBeenCalled();
  });

  it('shows the summary and the field errors for an invalid form and sends nothing', async () => {
    const { result, dismissCreatedNotice } = renderForm();
    act(() => result.current.form.onNameChange(''));

    await act(async () => result.current.form.handleSubmit(submitEvent()));

    expect(result.current.feedback.error).toBe('feedbackValidationSummary');
    expect(result.current.feedback.fieldErrors).toEqual({ name: 'createNameRequired' });
    expect(dismissCreatedNotice).toHaveBeenCalled();
    expect(mockUpdateService).not.toHaveBeenCalled();
  });

  it('saves the normalized values with the pickup choice, then marks the tab clean', async () => {
    mockUpdateService.mockResolvedValue(undefined);
    const { result, onDirtyChange } = renderForm();
    act(() => result.current.form.onNameChange('  Lavagem Premium  '));
    act(() => result.current.form.onToggleRequiresPickupAddress());

    await act(async () => result.current.form.handleSubmit(submitEvent()));

    expect(mockUpdateService).toHaveBeenCalledWith({
      id: 'svc-1',
      body: {
        name: 'Lavagem Premium',
        description: 'Serviço completo',
        priceAmount: 180,
        durationMinutes: 60,
        loyaltyPointsValue: 20,
        requiresPickupAddress: false,
      },
    });
    expect(result.current.form.savedRequiresPickupAddress).toBe(false);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(result.current.feedback.success).toBe('editSavedBody');
    expect(result.current.form.isSubmitting).toBe(false);
  });

  it('is submitting while the save is in flight', async () => {
    const save = pending();
    mockUpdateService.mockReturnValue(save.promise);
    const { result } = renderForm();

    let submission: Promise<void> = Promise.resolve();
    act(() => {
      submission = result.current.form.handleSubmit(submitEvent());
    });
    expect(result.current.form.isSubmitting).toBe(true);

    await act(async () => {
      save.finish();
      await submission;
    });
    expect(result.current.form.isSubmitting).toBe(false);
  });

  it('saves the pickup value the form had at submit time, not one chosen while saving', async () => {
    const save = pending();
    mockUpdateService.mockReturnValue(save.promise);
    const { result } = renderForm();
    act(() => result.current.form.onToggleRequiresPickupAddress());

    let submission: Promise<void> = Promise.resolve();
    act(() => {
      submission = result.current.form.handleSubmit(submitEvent());
    });
    act(() => result.current.form.onToggleRequiresPickupAddress());
    await act(async () => {
      save.finish();
      await submission;
    });

    expect(mockUpdateService.mock.calls[0][0].body.requiresPickupAddress).toBe(false);
    expect(result.current.form.savedRequiresPickupAddress).toBe(false);
    expect(result.current.form.requiresPickupAddress).toBe(true);
  });

  it('keeps the tab dirty and shows no success when a newer edit landed during the save', async () => {
    const save = pending();
    mockUpdateService.mockReturnValue(save.promise);
    const { result, onDirtyChange } = renderForm();

    let submission: Promise<void> = Promise.resolve();
    act(() => {
      submission = result.current.form.handleSubmit(submitEvent());
    });
    act(() => result.current.form.onNameChange('Editado durante o envio'));
    await act(async () => {
      save.finish();
      await submission;
    });

    expect(onDirtyChange).not.toHaveBeenCalledWith(false);
    expect(result.current.feedback.success).toBeNull();
    expect(result.current.form.name).toBe('Editado durante o envio');
  });

  it('routes a failed save to the feedback and keeps the tab dirty', async () => {
    mockUpdateService.mockRejectedValue(new ApiError(500, 'Internal error'));
    const { result, onDirtyChange } = renderForm();
    act(() => result.current.form.onNameChange('Lavagem Premium'));

    await act(async () => result.current.form.handleSubmit(submitEvent()));

    expect(result.current.feedback.error).toBeTruthy();
    expect(result.current.feedback.success).toBeNull();
    expect(onDirtyChange).not.toHaveBeenCalledWith(false);
    expect(result.current.form.isSubmitting).toBe(false);
  });
});
