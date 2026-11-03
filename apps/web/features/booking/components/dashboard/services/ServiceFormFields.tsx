'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { FIELD_INVALID_CLASS, FieldFeedback } from '@/shared/components/ui/field-feedback';
import type { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { cn } from '@/shared/utils/cn';
import { ServicePickupSwitch } from './ServicePickupSwitch';
import { ServicePriceDurationFields } from './ServicePriceDurationFields';

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

interface ServiceFormFieldsProps {
  readonly name: string;
  readonly description: string;
  readonly priceAmount: string;
  readonly durationMinutes: string;
  readonly loyaltyPointsValue: string;
  readonly requiresPickupAddress: boolean;
  // The form's feedback owner: its field registry marks and focuses the input a client check or
  // the backend's `field` points at.
  readonly feedback: Pick<
    ReturnType<typeof useFormFeedback>,
    'fieldProps' | 'fieldErrors' | 'fieldErrorId'
  >;
  readonly onNameChange: (value: string) => void;
  readonly onDescriptionChange: (value: string) => void;
  readonly onPriceAmountChange: (value: string) => void;
  readonly onDurationMinutesChange: (value: string) => void;
  readonly onLoyaltyPointsValueChange: (value: string) => void;
  readonly onToggleRequiresPickupAddress: () => void;
  // SESSION-model services have no per-reservation pickup/delivery concept (a Turma happens at a
  // fixed location) — hidden, not just disabled, when true (UC-056, decided M22-S04).
  readonly hidePickupToggle?: boolean;
  // A legged service's duration is its legs' span (computed by the backend) — read-only here.
  readonly durationLocked?: boolean;
  readonly children?: ReactNode;
}

export function ServiceFormFields({
  name,
  description,
  priceAmount,
  durationMinutes,
  loyaltyPointsValue,
  requiresPickupAddress,
  feedback,
  onNameChange,
  onDescriptionChange,
  onPriceAmountChange,
  onDurationMinutesChange,
  onLoyaltyPointsValueChange,
  onToggleRequiresPickupAddress,
  hidePickupToggle = false,
  durationLocked = false,
  children,
}: ServiceFormFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const { fieldProps, fieldErrors, fieldErrorId } = feedback;

  return (
    <>
      <section className="space-y-4">
        <div>
          <label
            htmlFor="service-name"
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('createNameLabel')}
          </label>
          <input
            id="service-name"
            data-testid="service-name-input"
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            maxLength={100}
            placeholder={t('createNamePlaceholder')}
            {...fieldProps('name')}
            className={cn(INPUT_CLASS, fieldErrors.name && FIELD_INVALID_CLASS)}
          />
          <FieldFeedback id={fieldErrorId('name')}>{fieldErrors.name}</FieldFeedback>
        </div>

        <div>
          <label
            htmlFor="service-description"
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('createDescriptionLabel')}
          </label>
          <textarea
            id="service-description"
            data-testid="service-description-input"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            maxLength={500}
            placeholder={t('createDescriptionPlaceholder')}
            {...fieldProps('description')}
            className={cn(INPUT_CLASS, 'min-h-24', fieldErrors.description && FIELD_INVALID_CLASS)}
          />
          <FieldFeedback id={fieldErrorId('description')}>{fieldErrors.description}</FieldFeedback>
        </div>

        <ServicePriceDurationFields
          priceAmount={priceAmount}
          durationMinutes={durationMinutes}
          feedback={feedback}
          durationLocked={durationLocked}
          onPriceAmountChange={onPriceAmountChange}
          onDurationMinutesChange={onDurationMinutesChange}
        />

        <div>
          <label
            htmlFor="service-points"
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('createPointsLabel')}
          </label>
          <input
            id="service-points"
            data-testid="service-points-input"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={loyaltyPointsValue}
            onChange={(event) => onLoyaltyPointsValueChange(event.target.value)}
            placeholder={t('createPointsPlaceholder')}
            {...fieldProps('loyaltyPointsValue')}
            aria-describedby={
              fieldErrors.loyaltyPointsValue
                ? fieldErrorId('loyaltyPointsValue')
                : 'service-points-hint'
            }
            className={cn(INPUT_CLASS, fieldErrors.loyaltyPointsValue && FIELD_INVALID_CLASS)}
          />
          <FieldFeedback id={fieldErrorId('loyaltyPointsValue')}>
            {fieldErrors.loyaltyPointsValue}
          </FieldFeedback>
          {!fieldErrors.loyaltyPointsValue && (
            <p id="service-points-hint" className="mt-1.5 text-sm text-gray-500">
              {t('createPointsHint')}
            </p>
          )}
        </div>
      </section>

      {!hidePickupToggle && (
        <ServicePickupSwitch
          checked={requiresPickupAddress}
          onToggle={onToggleRequiresPickupAddress}
        />
      )}

      {children}
    </>
  );
}
