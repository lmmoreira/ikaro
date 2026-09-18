'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ServiceBookingPolicyItem, UpdateServiceBookingPolicyRequest } from '@ikaro/types';
import { useUpdateServiceBookingPolicy } from '@/features/booking/services/useServices';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { Button } from '@/shared/components/ui/button';
import { PolicyDurationPricingCard } from './PolicyDurationPricingCard';
import {
  PolicyConfirmationCard,
  PolicyBookingWindowCard,
  PolicyWhoHowCard,
} from './PolicyConfirmationAndWindowCards';

interface ServiceBookingPolicyPanelProps {
  readonly serviceId: string;
  readonly initialPolicy: ServiceBookingPolicyItem;
  readonly onDirtyChange: (dirty: boolean) => void;
}

export function ServiceBookingPolicyPanel({
  serviceId,
  initialPolicy,
  onDirtyChange,
}: ServiceBookingPolicyPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const locale = useResolvedLocale();
  const updatePolicy = useUpdateServiceBookingPolicy();

  const [policy, setPolicy] = useState(initialPolicy);
  const [error, setError] = useState<string | null>(null);
  const [savedMessageVisible, setSavedMessageVisible] = useState(false);
  // Bumped on every edit — lets a save in flight tell whether a *newer* edit landed while it was
  // pending, so it never clears dirty for edits it didn't actually persist (CodeRabbit finding).
  const editRevisionRef = useRef(0);

  function patch(next: Partial<ServiceBookingPolicyItem>): void {
    editRevisionRef.current += 1;
    setPolicy((current) => ({ ...current, ...next }));
    setError(null);
    onDirtyChange(true);
    setSavedMessageVisible(false);
  }

  async function handleSave(): Promise<void> {
    setError(null);
    const revisionAtSubmit = editRevisionRef.current;
    const body: UpdateServiceBookingPolicyRequest = { ...policy };
    try {
      await updatePolicy.mutateAsync({ id: serviceId, body });
      if (editRevisionRef.current === revisionAtSubmit) {
        onDirtyChange(false);
        setSavedMessageVisible(true);
      }
    } catch (err) {
      setError(resolveErrorMessageFromApiError(err, locale));
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{t('politicasIntro')}</p>

      <PolicyDurationPricingCard policy={policy} onPatch={patch} />
      <PolicyConfirmationCard policy={policy} onPatch={patch} />
      <PolicyBookingWindowCard policy={policy} onPatch={patch} />
      <PolicyWhoHowCard policy={policy} onPatch={patch} />

      {error && (
        <div
          role="alert"
          data-testid="policy-error"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          data-testid="policy-save"
          onClick={handleSave}
          disabled={updatePolicy.isPending}
        >
          {t('politicasSaveButton')}
        </Button>
        {savedMessageVisible && (
          <span data-testid="policy-saved" className="text-sm text-green-600">
            {t('politicasSavedConfirm')}
          </span>
        )}
      </div>
    </div>
  );
}
