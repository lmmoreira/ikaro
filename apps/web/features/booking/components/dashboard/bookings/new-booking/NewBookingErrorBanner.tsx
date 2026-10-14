'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';

interface NewBookingErrorBannerProps {
  readonly children: React.ReactNode;
  readonly hint?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly focusOnMount?: boolean;
  readonly testId?: string;
}

// A step's error, in the dashboard's style: the message over the kept data, with the optional
// hint and retry the hotsite's ErrorAlert offers.
export function NewBookingErrorBanner({
  children,
  hint,
  onRetry,
  retryLabel,
  focusOnMount = false,
  testId,
}: NewBookingErrorBannerProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  return (
    <Card className="border-red-200 bg-red-50/80" data-testid={testId}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div ref={ref} role="alert" tabIndex={-1} className="text-sm text-red-700 outline-none">
          <p className="font-semibold">{children}</p>
          {hint && <p className="mt-1">{hint}</p>}
        </div>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
