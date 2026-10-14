'use client';

import { AvailabilityAlertListError } from '@/features/customer/components/my-account/AvailabilityAlertListStates';

interface AlertsRouteErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function AlertsRouteError({
  error: _error,
  reset,
}: AlertsRouteErrorProps): React.JSX.Element {
  return <AvailabilityAlertListError onRetry={reset} />;
}
