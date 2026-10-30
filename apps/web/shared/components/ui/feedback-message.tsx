'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/utils/cn';

export interface FeedbackModel {
  readonly variant: 'error' | 'success';
  readonly title: string;
  readonly body?: string;
  readonly hint?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly testId?: string;
}

export interface FeedbackMessageProps extends Omit<FeedbackModel, 'variant' | 'body'> {
  readonly variant?: FeedbackModel['variant'];
  readonly children?: React.ReactNode;
  readonly size?: 'default' | 'inline';
  readonly focusOnMount?: boolean;
}

const VARIANT_CLASS: Record<FeedbackModel['variant'], string> = {
  error: 'border-red-300 bg-red-50 text-red-800',
  success: 'border-green-300 bg-green-50 text-green-800',
};

export function FeedbackMessage({
  variant = 'error',
  title,
  children,
  hint,
  onRetry,
  retryLabel,
  size = 'default',
  focusOnMount = false,
  testId,
}: FeedbackMessageProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  const inline = size === 'inline';

  return (
    <div
      ref={ref}
      role={variant === 'error' ? 'alert' : 'status'}
      tabIndex={focusOnMount ? -1 : undefined}
      data-testid={testId}
      className={cn(
        'border text-sm outline-none',
        VARIANT_CLASS[variant],
        inline
          ? 'inline-block rounded-md px-2.5 py-1 text-[0.8125rem]'
          : 'flex flex-col gap-1 rounded-lg px-4 py-3.5',
      )}
    >
      <p className="font-bold">{title}</p>
      {children && <p>{children}</p>}
      {hint && <p className="text-[0.8125rem] opacity-85">{hint}</p>}
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1.5 self-start bg-white text-inherit"
          onClick={onRetry}
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
