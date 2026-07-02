import type React from 'react';

interface ErrorAlertProps {
  readonly children: React.ReactNode;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
}

export function ErrorAlert({
  children,
  onRetry,
  retryLabel = 'Tentar novamente',
}: ErrorAlertProps): React.JSX.Element {
  return (
    <div
      role="alert"
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
        <span className="text-sm font-medium text-red-600">{children}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-[1.625rem] mt-2.5 border border-red-300 px-3.5 py-1.5 text-sm font-semibold text-red-600"
          style={{ borderRadius: 'var(--ba-radius)' }}
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
