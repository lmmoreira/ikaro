'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS, type StaffBookingDetailResponse } from '@ikaro/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatDuration } from '@/lib/formatting/format-duration';
import { useFormatting } from '@/lib/formatting/use-formatting';
import { useCompleteBooking } from '@/lib/hooks/useBookingMutations';
import { AfterServicePhotoUpload } from './AfterServicePhotoUpload';
import { BookingClientCard } from './BookingClientCard';
import { useDashboardTopbarStatus } from '../topbar-status-context';

interface MarkCompleteBookingPageProps {
  readonly booking: StaffBookingDetailResponse;
  readonly tenantSlug: string;
  readonly backHref: string;
}

export function MarkCompleteBookingPage({
  booking,
  tenantSlug,
  backHref,
}: MarkCompleteBookingPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const commonT = useTranslations('common');
  const { formatMoney, formatDateLong, formatTime } = useFormatting();
  const completeBookingMutation = useCompleteBooking();
  const topbarStatus = useDashboardTopbarStatus();
  const setTopbarBookingStatus = topbarStatus?.setBookingStatus;
  const scheduledAt = new Date(booking.scheduledAt);
  const scheduledEnd = new Date(scheduledAt.getTime() + booking.totalDurationMins * 60_000);
  const [linePrices, setLinePrices] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        booking.lines.map((line) => [line.lineId, String(line.priceAtBooking.amount)]),
      ) as Record<string, string>,
  );
  const [afterServicePhotoUrls, setAfterServicePhotoUrls] = useState<readonly string[]>(() => [
    ...booking.afterServicePhotoUrls,
  ]);
  const [adminNotes, setAdminNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const isSubmitting = completeBookingMutation.isPending;

  useEffect(() => {
    setTopbarBookingStatus?.(booking.status);
  }, [booking.status, setTopbarBookingStatus]);

  useEffect(
    () => () => {
      setTopbarBookingStatus?.(null);
    },
    [setTopbarBookingStatus],
  );

  const totalCharged = useMemo(
    () =>
      booking.lines.reduce((sum, line) => {
        const value = Number(linePrices[line.lineId]);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [booking.lines, linePrices],
  );

  const totalEarnedPoints = useMemo(
    () => booking.lines.reduce((sum, line) => sum + line.pointsValueAtBooking, 0),
    [booking.lines],
  );

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    try {
      const lines = booking.lines.map((line) => {
        const rawValue = linePrices[line.lineId] ?? '';
        const value = Number(rawValue);
        if (rawValue.trim() === '' || !Number.isFinite(value) || value < 0) {
          throw new TypeError(t('completeInvalidPrice'));
        }
        return { lineId: line.lineId, actualPriceCharged: value };
      });

      await completeBookingMutation.mutateAsync({
        id: booking.bookingId,
        body: {
          lines,
          ...(afterServicePhotoUrls.length > 0
            ? { afterServicePhotoUrls: [...afterServicePhotoUrls] }
            : {}),
          ...(adminNotes.trim() ? { adminNotes: adminNotes.trim() } : {}),
        },
      });
      setTopbarBookingStatus?.(BOOKING_STATUS.COMPLETED);
      setCompleted(true);
    } catch (err) {
      const invalidPriceMessage = t('completeInvalidPrice');
      setError(
        err instanceof Error && err.message === invalidPriceMessage
          ? err.message
          : t('completeError'),
      );
    }
  }

  if (completed) {
    return (
      <div className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            <Card className="border-green-200 bg-green-50/80">
              <CardContent className="flex items-start gap-3 p-4">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-600">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase tracking-[0.07em] text-green-700">
                    {t('completedTitle')}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-green-700/90">{t('completedBody')}</p>
                  <p className="mt-2 text-sm leading-6 text-green-700/90">
                    {t('summaryQuoted', { total: formatMoney(booking.totalPrice.amount) })}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-green-700/90">
                    {t('summaryCharged', { total: formatMoney(totalCharged) })}
                  </p>

                  <div className="mt-3 space-y-2 border-t border-green-100 pt-3">
                    {booking.lines.map((line) => (
                      <div
                        key={line.lineId}
                        className="flex items-center justify-between gap-3 text-sm text-green-700/90"
                      >
                        <span className="min-w-0 truncate font-medium">{line.serviceName}</span>
                        <span className="text-right">
                          {t('quotedPriceLabel', {
                            price: formatMoney(line.priceAtBooking.amount),
                          })}{' '}
                          <span className="opacity-70">→</span> {t('chargedPriceLabel')}{' '}
                          {formatMoney(Number(linePrices[line.lineId]) || 0)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-lg bg-green-50/70 px-3 py-2 text-sm text-green-800">
                    {booking.customerId !== null && (
                      <p className="font-semibold">
                        {t('completedPointsEarned', { count: totalEarnedPoints })}
                      </p>
                    )}
                    <p className="mt-1">{t('completedEmailSummary')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <BookingClientCard booking={booking} />

            <section>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
                {t('scheduleSection')}
              </p>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-gray-900">
                    {formatDateLong(scheduledAt)}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    {formatTime(scheduledAt)} – {formatTime(scheduledEnd)} (
                    {formatDuration(booking.totalDurationMins)})
                  </p>
                </CardContent>
              </Card>
            </section>

            {booking.afterServicePhotoUrls.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
                  {t('afterPhotosLabel')}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {booking.afterServicePhotoUrls.map((url, index) => (
                    <img
                      key={`${url}-${index}`}
                      src={url}
                      alt={t('afterPhotoAlt', { index: index + 1 })}
                      loading="lazy"
                      className="aspect-square w-full rounded-lg border border-gray-200 object-cover"
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="hidden space-y-4 lg:block lg:sticky lg:top-6">
            <Card>
              <CardContent className="space-y-3 p-4">
                <p className="text-sm text-gray-600">{t('completedAsideBody')}</p>
                <Button asChild className="w-full">
                  <Link href={backHref}>{t('backToAgenda')}</Link>
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
          <Card>
            <CardContent className="p-4">
              <Button asChild className="w-full">
                <Link href={backHref}>{t('backToAgenda')}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <BookingClientCard booking={booking} />

          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
              {t('completeLinesSection')}
            </p>
            <Card>
              <CardContent className="space-y-0 p-0">
                {booking.lines.map((line) => (
                  <div
                    key={line.lineId}
                    className="grid gap-3 border-t border-gray-100 px-4 py-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_11rem]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {line.serviceName}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {t('quotedPriceLabel', {
                          price: formatMoney(line.priceAtBooking.amount),
                        })}
                      </p>
                    </div>
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.07em] text-gray-400">
                        {t('chargedPriceLabel')}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={linePrices[line.lineId] ?? ''}
                        onChange={(event) =>
                          setLinePrices((current) => ({
                            ...current,
                            [line.lineId]: event.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold outline-none ring-0 focus:border-blue-500"
                      />
                    </label>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
              {t('summaryLabel')}
            </p>
            <Card className="border-blue-200 bg-blue-50/70">
              <CardContent className="space-y-3 p-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.07em] text-blue-700">
                    {t('scheduleSection')}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {formatDateLong(scheduledAt)}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {formatTime(scheduledAt)} — {formatTime(scheduledEnd)} (
                    {formatDuration(booking.totalDurationMins)})
                  </p>
                </div>
                <div className="space-y-2 border-t border-blue-100 pt-3 text-sm text-blue-900">
                  <p>{t('summaryQuoted', { total: formatMoney(booking.totalPrice.amount) })}</p>
                  <p>{t('summaryCharged', { total: formatMoney(totalCharged) })}</p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section>
            <AfterServicePhotoUpload
              slug={tenantSlug}
              bookingId={booking.bookingId}
              label={t('afterPhotosLabel')}
              value={afterServicePhotoUrls}
              onChange={(filePaths) => setAfterServicePhotoUrls(filePaths)}
            />
          </section>

          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
              {t('notesSection')}
            </p>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">
                {t('notesLabel')}
              </span>
              <textarea
                value={adminNotes}
                onChange={(event) => setAdminNotes(event.target.value)}
                rows={5}
                maxLength={500}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
                placeholder={t('notesPlaceholder')}
              />
            </label>
          </section>
        </div>

        <aside className="hidden space-y-4 lg:block lg:sticky lg:top-6">
          {error && (
            <Card className="border-red-200 bg-red-50/80">
              <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
            </Card>
          )}

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
              {t('actionsSection')}
            </p>
            <Card>
              <CardContent className="space-y-3 p-4">
                <Button type="submit" disabled={isSubmitting} className="w-full">
                  {t('submitComplete')}
                </Button>
                <Button
                  asChild
                  className="w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
                >
                  <Link href={backHref}>{commonT('cancel')}</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
            {t('actionsSection')}
          </p>
          <Card>
            <CardContent className="space-y-3 p-4">
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {t('submitComplete')}
              </Button>
              <Button
                asChild
                className="w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
              >
                <Link href={backHref}>{commonT('cancel')}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
