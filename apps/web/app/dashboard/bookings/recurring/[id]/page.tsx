import { RecurringScheduleApprovalDetail } from '@/features/booking/components/dashboard/bookings/RecurringScheduleApprovalDetail';

interface RecurringScheduleApprovalRouteProps {
  readonly params: Promise<{ id: string }>;
}

// M23-S13 (UC-071): a static `recurring` segment next to `[id]`, so it never reads as a booking id.
// The screen loads its own data on the client through the same-origin BFF gateway, like the rest of
// the Agenda's queue, so the route stays a thin shell.
export default async function RecurringScheduleApprovalRoute({
  params,
}: RecurringScheduleApprovalRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;

  return <RecurringScheduleApprovalDetail scheduleId={id} />;
}
