'use client';

import Link from 'next/link';
import { useEffect, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { ApiError } from '@/lib/api/errors';
import { useCreateService } from '@/lib/hooks/useServices';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardTopbarStatus } from '../topbar-status-context';

interface FieldErrors {
  name?: string;
  description?: string;
  priceAmount?: string;
  durationMinutes?: string;
  loyaltyPointsValue?: string;
  submit?: string;
}

function parseNonNegativeInteger(value: string): number | null {
  if (value.trim() === '') return 0;
  if (!/^\d+$/.test(value)) return null;
  return Number(value);
}

export function ServiceCreatePage(): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const commonT = useTranslations('common');
  const router = useRouter();
  const createServiceMutation = useCreateService();
  const topbarStatus = useDashboardTopbarStatus();
  const setTopbarServiceStatus = topbarStatus?.setServiceStatus;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [loyaltyPointsValue, setLoyaltyPointsValue] = useState('0');
  const [requiresPickupAddress, setRequiresPickupAddress] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const isSubmitting = isSubmittingLocal || createServiceMutation.isPending;

  useEffect(() => {
    setTopbarServiceStatus?.(isActive ? 'ACTIVE' : 'INACTIVE');
  }, [isActive, setTopbarServiceStatus]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldErrors({});

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const price = Number(priceAmount);
    const duration = Number(durationMinutes);
    const points = parseNonNegativeInteger(loyaltyPointsValue);
    const nextErrors: FieldErrors = {};

    if (!trimmedName) {
      nextErrors.name = t('createNameRequired');
    } else if (trimmedName.length > 100) {
      nextErrors.name = t('createNameMax');
    }

    if (trimmedDescription.length > 500) {
      nextErrors.description = t('createDescriptionMax');
    }

    if (priceAmount.trim() === '') {
      nextErrors.priceAmount = t('createPriceRequired');
    } else if (!Number.isFinite(price) || price <= 0) {
      nextErrors.priceAmount = t('createPriceInvalid');
    }

    if (durationMinutes.trim() === '') {
      nextErrors.durationMinutes = t('createDurationRequired');
    } else if (!Number.isInteger(duration) || duration <= 0) {
      nextErrors.durationMinutes = t('createDurationInvalid');
    }

    if (points === null) {
      nextErrors.loyaltyPointsValue = t('createPointsInvalid');
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setIsSubmittingLocal(true);
    try {
      await createServiceMutation.mutateAsync({
        name: trimmedName,
        description: trimmedDescription || undefined,
        priceAmount: price,
        durationMinutes: duration,
        loyaltyPointsValue: points ?? 0,
        requiresPickupAddress,
        isActive,
      });
      router.push('/dashboard/services?created=1');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFieldErrors({ name: t('createDuplicateName') });
        return;
      }

      setFieldErrors({ submit: t('createFailed') });
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Card>
          <CardContent className="space-y-5 p-5 lg:p-6">
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
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? 'service-name-error' : undefined}
                  placeholder={t('createNamePlaceholder')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50"
                />
                {fieldErrors.name && (
                  <p
                    id="service-name-error"
                    data-testid="service-name-error"
                    className="mt-1.5 text-sm text-red-600"
                  >
                    {fieldErrors.name}
                  </p>
                )}
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
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                  placeholder={t('createDescriptionPlaceholder')}
                  className="min-h-24 w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                {fieldErrors.description && (
                  <p
                    data-testid="service-description-error"
                    className="mt-1.5 text-sm text-red-600"
                  >
                    {fieldErrors.description}
                  </p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="service-price"
                    className="mb-1.5 block text-sm font-semibold text-gray-900"
                  >
                    {t('createPriceLabel')}
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500">
                      R$
                    </span>
                    <input
                      id="service-price"
                      data-testid="service-price-input"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={priceAmount}
                      onChange={(event) => setPriceAmount(event.target.value)}
                      aria-invalid={Boolean(fieldErrors.priceAmount)}
                      aria-describedby={
                        fieldErrors.priceAmount ? 'service-price-error' : 'service-price-warning'
                      }
                      placeholder={t('createPricePlaceholder')}
                      className="w-full rounded-md border border-border bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50"
                    />
                  </div>
                  {fieldErrors.priceAmount ? (
                    <p
                      id="service-price-error"
                      data-testid="service-price-error"
                      className="mt-1.5 text-sm text-red-600"
                    >
                      {fieldErrors.priceAmount}
                    </p>
                  ) : (
                    <p
                      id="service-price-warning"
                      className="mt-1.5 flex items-center gap-1.5 text-sm text-amber-700"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {t('editPriceWarning')}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="service-duration"
                    className="mb-1.5 block text-sm font-semibold text-gray-900"
                  >
                    {t('createDurationLabel')}
                  </label>
                  <div className="relative">
                    <input
                      id="service-duration"
                      data-testid="service-duration-input"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={durationMinutes}
                      onChange={(event) => setDurationMinutes(event.target.value)}
                      aria-invalid={Boolean(fieldErrors.durationMinutes)}
                      aria-describedby={
                        fieldErrors.durationMinutes ? 'service-duration-error' : undefined
                      }
                      placeholder={t('createDurationPlaceholder')}
                      className="w-full rounded-md border border-border bg-white py-2.5 pl-3 pr-12 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">
                      min
                    </span>
                  </div>
                  {fieldErrors.durationMinutes && (
                    <p
                      id="service-duration-error"
                      data-testid="service-duration-error"
                      className="mt-1.5 text-sm text-red-600"
                    >
                      {fieldErrors.durationMinutes}
                    </p>
                  )}
                </div>
              </div>

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
                  onChange={(event) => setLoyaltyPointsValue(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.loyaltyPointsValue)}
                  aria-describedby={
                    fieldErrors.loyaltyPointsValue ? 'service-points-error' : 'service-points-hint'
                  }
                  placeholder={t('createPointsPlaceholder')}
                  className="w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50"
                />
                {fieldErrors.loyaltyPointsValue ? (
                  <p
                    id="service-points-error"
                    data-testid="service-points-error"
                    className="mt-1.5 text-sm text-red-600"
                  >
                    {fieldErrors.loyaltyPointsValue}
                  </p>
                ) : (
                  <p id="service-points-hint" className="mt-1.5 text-sm text-gray-500">
                    {t('createPointsHint')}
                  </p>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">Opções</p>
              <button
                type="button"
                role="switch"
                data-testid="service-pickup-switch"
                aria-checked={requiresPickupAddress}
                onClick={() => setRequiresPickupAddress((value) => !value)}
                className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
              >
                <span className="pr-4">
                  <span className="block text-sm font-semibold text-gray-900">
                    {t('createPickupLabel')}
                  </span>
                  <span className="mt-0.5 block text-sm text-gray-500">
                    {t('createPickupHint')}
                  </span>
                </span>
                <span
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                    requiresPickupAddress ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      requiresPickupAddress ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </span>
              </button>

              <button
                type="button"
                role="switch"
                data-testid="service-active-switch"
                aria-checked={isActive}
                onClick={() => setIsActive((value) => !value)}
                className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
              >
                <span className="pr-4">
                  <span className="block text-sm font-semibold text-gray-900">
                    {t('createActiveLabel')}
                  </span>
                  <span className="mt-0.5 block text-sm text-gray-500">
                    {t('createActiveHint')}
                  </span>
                </span>
                <span
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                    isActive ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      isActive ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </span>
              </button>
            </section>

            {fieldErrors.submit && (
              <div
                data-testid="service-submit-error"
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {fieldErrors.submit}
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="hidden lg:block lg:sticky lg:top-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <p className="text-sm leading-6 text-gray-600">{t('createActiveHint')}</p>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? commonT('loading') : t('createSubmit')}
              </Button>

              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/services">{t('createCancel')}</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="grid grid-cols-2 gap-3">
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard/services">{t('createCancel')}</Link>
          </Button>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? commonT('loading') : t('createSubmit')}
          </Button>
        </div>
      </div>
    </form>
  );
}
