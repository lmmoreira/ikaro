import { useRef, useState, type MutableRefObject, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { StaffServiceResponse } from '@ikaro/types';
import {
  toFieldErrors,
  validateServiceForm,
  type NormalizedServiceFormValues,
  type ServiceFormTranslator,
  type ServiceFormValues,
} from '@/features/booking/services/service-form';
import { useUpdateService } from '@/features/booking/services/useServices';
import type { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';

type FormFeedback = ReturnType<typeof useFormFeedback>;

// The Detalhes fields as the form's local draft; every edit is reported through `onEdit`.
function useDetailsFields(service: StaffServiceResponse, onEdit: () => void) {
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? '');
  const [priceAmount, setPriceAmount] = useState(String(service.price.amount));
  const [durationMinutes, setDurationMinutes] = useState(String(service.durationMinutes));
  const [loyaltyPointsValue, setLoyaltyPointsValue] = useState(String(service.loyaltyPointsValue));
  const [requiresPickupAddress, setRequiresPickupAddress] = useState(service.requiresPickupAddress);
  const edit =
    (set: (value: string) => void) =>
    (value: string): void => {
      set(value);
      onEdit();
    };

  return {
    name,
    description,
    priceAmount,
    durationMinutes,
    loyaltyPointsValue,
    requiresPickupAddress,
    onNameChange: edit(setName),
    onDescriptionChange: edit(setDescription),
    onPriceAmountChange: edit(setPriceAmount),
    onDurationMinutesChange: edit(setDurationMinutes),
    onLoyaltyPointsValueChange: edit(setLoyaltyPointsValue),
    onToggleRequiresPickupAddress: (): void => {
      setRequiresPickupAddress((value) => !value);
      onEdit();
    },
    // Saving legs makes the service's duration the legs' span, computed by the backend.
    applyLegsDuration: (totalSpanMinutes: number): void =>
      setDurationMinutes(String(totalSpanMinutes)),
  };
}

interface UseDetailsSaveParams {
  readonly service: StaffServiceResponse;
  readonly feedback: FormFeedback;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly editRevisionRef: MutableRefObject<number>;
}

// The save request, its pending flag, and the pickup-address value the last save persisted.
function useDetailsSave({
  service,
  feedback,
  onDirtyChange,
  editRevisionRef,
}: UseDetailsSaveParams) {
  const t = useTranslations('dashboard.servicesPage');
  const locale = useResolvedLocale();
  const updateServiceMutation = useUpdateService();
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  // The pickup-address value as last saved, for the Políticas tab's recurrence hint: toggling the
  // switch changes `requiresPickupAddress` at once, but the hint follows only a successful save.
  const [savedRequiresPickupAddress, setSavedRequiresPickupAddress] = useState(
    service.requiresPickupAddress,
  );

  async function save(body: NormalizedServiceFormValues, pickupAtSubmit: boolean): Promise<void> {
    const revisionAtSubmit = editRevisionRef.current;
    setIsSubmittingLocal(true);
    try {
      await updateServiceMutation.mutateAsync({
        id: service.serviceId,
        body: { ...body, requiresPickupAddress: pickupAtSubmit },
      });
      setSavedRequiresPickupAddress(pickupAtSubmit);
      if (editRevisionRef.current === revisionAtSubmit) {
        onDirtyChange(false);
        feedback.setSuccess(t('editSavedBody'));
      }
    } catch (err) {
      feedback.setFromApiError(err, locale);
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  const isSubmitting = isSubmittingLocal || updateServiceMutation.isPending;
  return { save, isSubmitting, savedRequiresPickupAddress };
}

interface SubmitGuard {
  readonly canSubmit: boolean;
  readonly isActive: boolean;
  readonly feedback: FormFeedback;
  readonly dismissCreatedNotice: () => void;
}

// The checks before a save. Returns the values to send, or null when nothing may be sent; the
// reason, if the user needs one, is already on the feedback.
function prepareSubmission(
  values: ServiceFormValues,
  { canSubmit, isActive, feedback, dismissCreatedNotice }: SubmitGuard,
  t: ServiceFormTranslator,
): NormalizedServiceFormValues | null {
  // The page is now one <form> so each tab's own save button (all type="button") can sit
  // beside the Detalhes tab's submit button without a second nested <form> — but that also
  // means an Enter keypress inside a Recursos/Políticas field would otherwise submit Detalhes'
  // data. Only the Detalhes tab's own submit button should ever reach a save for real.
  if (!canSubmit) return null;

  if (!isActive) {
    feedback.setError(t('editInactiveUpdateBlocked'));
    return null;
  }

  const validation = validateServiceForm(values, t);
  feedback.clear();
  dismissCreatedNotice();
  if (validation.normalized === null) {
    feedback.setError(t('feedbackValidationSummary'));
    feedback.setFieldErrors(toFieldErrors(validation.errors));
    return null;
  }
  return validation.normalized;
}

interface UseServiceDetailsFormParams extends SubmitGuard {
  readonly service: StaffServiceResponse;
  readonly onDirtyChange: (dirty: boolean) => void;
}

// The Detalhes tab's fields, their validation and the save. It knows nothing of the other tabs:
// the page tells it whether it may submit and is told, through `onDirtyChange`, when the tab turns
// dirty or is saved.
export function useServiceDetailsForm({
  service,
  isActive,
  canSubmit,
  feedback,
  onDirtyChange,
  dismissCreatedNotice,
}: UseServiceDetailsFormParams) {
  const t = useTranslations('dashboard.servicesPage');
  // Bumped on every Detalhes field edit — lets a save in flight tell whether a *newer* edit
  // landed while it was pending, so it never clears dirty for an edit it didn't actually persist.
  const editRevisionRef = useRef(0);

  function markDetalhesDirty(): void {
    editRevisionRef.current += 1;
    feedback.clear();
    onDirtyChange(true);
  }

  const fields = useDetailsFields(service, markDetalhesDirty);
  const { save, isSubmitting, savedRequiresPickupAddress } = useDetailsSave({
    service,
    feedback,
    onDirtyChange,
    editRevisionRef,
  });

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const { name, description, priceAmount, durationMinutes, loyaltyPointsValue } = fields;
    const body = prepareSubmission(
      { name, description, priceAmount, durationMinutes, loyaltyPointsValue },
      { canSubmit, isActive, feedback, dismissCreatedNotice },
      t,
    );
    if (body !== null) await save(body, fields.requiresPickupAddress);
  }

  return { ...fields, savedRequiresPickupAddress, isSubmitting, handleSubmit };
}
