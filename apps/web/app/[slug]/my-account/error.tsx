'use client';

import { MyAccountRouteError } from '@/features/customer/components/my-account/MyAccountRouteError';

interface MyAccountRouteErrorPageProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function MyAccountRouteErrorPage({
  error: _error,
  reset,
}: MyAccountRouteErrorPageProps): React.JSX.Element {
  return <MyAccountRouteError onRetry={reset} />;
}
