'use client';

import { useEffect, useRef } from 'react';
import type React from 'react';

interface ErrorAlertProps {
  readonly children: React.ReactNode;
  readonly hint?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  /** Moves keyboard focus to the alert when it appears — used when a flow returns to a step with an error. */
  readonly focusOnMount?: boolean;
}

export function ErrorAlert({
  children,
  hint,
  onRetry,
  retryLabel = 'Tentar novamente',
  focusOnMount = false,
}: ErrorAlertProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={focusOnMount ? -1 : undefined}
      className="border border-red-300 bg-red-50 p-3"
      style={{ borderRadius: 'var(--ba-radius)' }}
    >
      <div className="flex items-start gap-2.5">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 shrink-0 text-red-600"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div>
          <span className="text-sm font-medium text-red-700">{children}</span>
          {hint && <p className="mt-1 text-xs text-red-700">{hint}</p>}
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-[1.625rem] mt-2.5 border border-red-300 px-3.5 py-1.5 text-sm font-semibold text-red-700"
          style={{ borderRadius: 'var(--ba-radius)' }}
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
