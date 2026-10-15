'use client';

import { useRouter } from 'next/navigation';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { RescheduleBookingPage } from '@/features/booking/components/dashboard/bookings/RescheduleBookingPage';
import { useResolveSchedulingExceptions } from '@/features/booking/hooks/useSchedulingExceptions';
import { assertEntryRescheduled } from '@/features/booking/model/scheduling-exception-reschedule';

const LIST_HREF = '/dashboard/scheduling-exceptions';

interface SchedulingExceptionReschedulePageProps {
  readonly exceptionId: string;
  readonly booking: StaffBookingDetailResponse;
  readonly tenantSlug: string;
  readonly maxBookingAdvanceDays: number;
  readonly timezone: string;
}

// The staff reschedule page itself, with one difference: the confirm goes through the worklist's
// resolve (RESCHEDULE), which moves the booking exactly like PATCH /bookings/:id/reschedule AND
// closes the entry — the plain PATCH would move the booking but leave the entry open.
export function SchedulingExceptionReschedulePage({
  exceptionId,
  booking,
  tenantSlug,
  maxBookingAdvanceDays,
  timezone,
}: SchedulingExceptionReschedulePageProps): React.JSX.Element {
  const router = useRouter();
  const resolve = useResolveSchedulingExceptions();

  return (
    <RescheduleBookingPage
      booking={booking}
      tenantSlug={tenantSlug}
      maxBookingAdvanceDays={maxBookingAdvanceDays}
      timezone={timezone}
      backHref={LIST_HREF}
      agendaHref={LIST_HREF}
      confirmReschedule={async ({ startsAt, adminNotes }) => {
        const outcome = await resolve.mutateAsync({
          exceptionIds: [exceptionId],
          resolutionType: 'RESCHEDULE',
          scheduledAt: startsAt,
          ...(adminNotes ? { reason: adminNotes } : {}),
        });
        assertEntryRescheduled(outcome, exceptionId);
      }}
      onRescheduled={() => router.push(LIST_HREF)}
    />
  );
}
