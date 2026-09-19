'use client';

import { useTranslations } from 'next-intl';
import type { ServiceFormErrors } from '@/features/booking/services/service-form';
import { Card, CardContent } from '@/shared/components/ui/card';
import { ServiceFormFields } from './ServiceFormFields';
import { ServiceEditStatusSection } from './ServiceEditPanels';

interface ServiceEditDetailsTabProps {
  readonly serviceId: string;
  readonly isActive: boolean;
  readonly showCreatedBanner: boolean;
  readonly name: string;
  readonly description: string;
  readonly priceAmount: string;
  readonly durationMinutes: string;
  readonly loyaltyPointsValue: string;
  readonly requiresPickupAddress: boolean;
  readonly fieldErrors: ServiceFormErrors;
  readonly onNameChange: (value: string) => void;
  readonly onDescriptionChange: (value: string) => void;
  readonly onPriceAmountChange: (value: string) => void;
  readonly onDurationMinutesChange: (value: string) => void;
  readonly onLoyaltyPointsValueChange: (value: string) => void;
  readonly onToggleRequiresPickupAddress: () => void;
}

export function ServiceEditDetailsTab({
  serviceId,
  isActive,
  showCreatedBanner,
  name,
  description,
  priceAmount,
  durationMinutes,
  loyaltyPointsValue,
  requiresPickupAddress,
  fieldErrors,
  onNameChange,
  onDescriptionChange,
  onPriceAmountChange,
  onDurationMinutesChange,
  onLoyaltyPointsValueChange,
  onToggleRequiresPickupAddress,
}: ServiceEditDetailsTabProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <div
      role="tabpanel"
      id="service-edit-tabpanel-detalhes"
      aria-labelledby="service-edit-tab-detalhes"
    >
      {showCreatedBanner && (
        <output
          aria-live="polite"
          data-testid="service-created-banner"
          className="mb-4 block rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4"
        >
          <p className="text-[0.9375rem] font-bold text-emerald-800">{t('createdSuccessTitle')}</p>
          <p className="mt-1 text-sm text-emerald-700">{t('createdSuccessBody')}</p>
        </output>
      )}
      <Card>
        <CardContent className="space-y-5 p-5 lg:p-6">
          <ServiceFormFields
            name={name}
            description={description}
            priceAmount={priceAmount}
            durationMinutes={durationMinutes}
            loyaltyPointsValue={loyaltyPointsValue}
            requiresPickupAddress={requiresPickupAddress}
            fieldErrors={fieldErrors}
            onNameChange={onNameChange}
            onDescriptionChange={onDescriptionChange}
            onPriceAmountChange={onPriceAmountChange}
            onDurationMinutesChange={onDurationMinutesChange}
            onLoyaltyPointsValueChange={onLoyaltyPointsValueChange}
            onToggleRequiresPickupAddress={onToggleRequiresPickupAddress}
          >
            <ServiceEditStatusSection isActive={isActive} serviceId={serviceId} />
          </ServiceFormFields>
        </CardContent>
      </Card>
    </div>
  );
}
