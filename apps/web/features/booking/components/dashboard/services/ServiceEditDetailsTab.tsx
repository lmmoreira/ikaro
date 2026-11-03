'use client';

import type { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { Card, CardContent } from '@/shared/components/ui/card';
import { ServiceFormFields } from './ServiceFormFields';
import { ServiceEditStatusSection } from './ServiceEditPanels';

interface ServiceEditDetailsTabProps {
  readonly serviceId: string;
  readonly isActive: boolean;
  readonly name: string;
  readonly description: string;
  readonly priceAmount: string;
  readonly durationMinutes: string;
  readonly loyaltyPointsValue: string;
  readonly requiresPickupAddress: boolean;
  readonly durationLocked?: boolean;
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
}

export function ServiceEditDetailsTab({
  serviceId,
  isActive,
  name,
  description,
  priceAmount,
  durationMinutes,
  loyaltyPointsValue,
  requiresPickupAddress,
  durationLocked = false,
  feedback,
  onNameChange,
  onDescriptionChange,
  onPriceAmountChange,
  onDurationMinutesChange,
  onLoyaltyPointsValueChange,
  onToggleRequiresPickupAddress,
}: ServiceEditDetailsTabProps): React.JSX.Element {
  return (
    <div
      role="tabpanel"
      id="service-edit-tabpanel-detalhes"
      aria-labelledby="service-edit-tab-detalhes"
    >
      <Card>
        <CardContent className="space-y-5 p-5 lg:p-6">
          <ServiceFormFields
            name={name}
            description={description}
            priceAmount={priceAmount}
            durationMinutes={durationMinutes}
            loyaltyPointsValue={loyaltyPointsValue}
            requiresPickupAddress={requiresPickupAddress}
            durationLocked={durationLocked}
            feedback={feedback}
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
