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
  // Where back, "agenda" and a finished reschedule lead (M23-S46: the booking detail when the
  // manager came from there); the worklist when the route was opened without one.
  readonly returnTo?: string | null;
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
  returnTo = null,
}: SchedulingExceptionReschedulePageProps): React.JSX.Element {
  const router = useRouter();
  const resolve = useResolveSchedulingExceptions();
  const returnHref = returnTo ?? LIST_HREF;

  return (
    <RescheduleBookingPage
      booking={booking}
      tenantSlug={tenantSlug}
      maxBookingAdvanceDays={maxBookingAdvanceDays}
      timezone={timezone}
      backHref={returnHref}
      agendaHref={returnHref}
      confirmReschedule={async ({ startsAt, adminNotes }) => {
        const outcome = await resolve.mutateAsync({
          exceptionIds: [exceptionId],
          resolutionType: 'RESCHEDULE',
          scheduledAt: startsAt,
          ...(adminNotes ? { reason: adminNotes } : {}),
        });
        assertEntryRescheduled(outcome, exceptionId);
      }}
      onRescheduled={() => router.push(returnHref)}
    />
  );
}
