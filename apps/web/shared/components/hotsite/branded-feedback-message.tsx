'use client';

import { useCallback } from 'react';
import {
  BRANDED_FEEDBACK_PALETTE,
  BRANDED_FEEDBACK_SHADOW,
  BRANDED_FEEDBACK_SURFACE,
} from './branded-feedback-palette';

export interface BrandedFeedbackMessageProps {
  readonly variant?: 'error' | 'success';
  readonly title: string;
  readonly children?: React.ReactNode;
  readonly hint?: string;
  readonly onRetry?: () => void;
  /** Required with `onRetry`: the hotsite carries no default copy. */
  readonly retryLabel?: string;
  /** Moves keyboard focus to the message when it appears. */
  readonly focusOnMount?: boolean;
  readonly testId?: string;
}

/**
 * The public hotsite's counterpart of `ui/feedback-message`. Only radius and fonts follow the
 * tenant; the colours are a fixed pair painted on the box's own surface (never `--ba-text` or
 * `--ba-background`), so it stays readable and visible on any tenant palette.
 */
export function BrandedFeedbackMessage({
  variant = 'error',
  title,
  children,
  hint,
  onRetry,
  retryLabel,
  focusOnMount = false,
  testId,
}: BrandedFeedbackMessageProps): React.JSX.Element {
  const focusRef = useCallback(
    (element: HTMLElement | null) => {
      if (element && focusOnMount) element.focus();
    },
    [focusOnMount],
  );

  const { border, text } = BRANDED_FEEDBACK_PALETTE[variant];
  const container = {
    ref: focusRef,
    tabIndex: focusOnMount ? -1 : undefined,
    'data-testid': testId,
    className:
      'flex flex-col gap-1 border border-solid px-4 py-3.5 text-[0.9375rem] leading-normal outline-none',
    style: {
      backgroundColor: BRANDED_FEEDBACK_SURFACE,
      color: text,
      borderColor: border,
      borderLeftWidth: '4px',
      borderRadius: 'var(--ba-radius)',
      boxShadow: BRANDED_FEEDBACK_SHADOW,
      fontFamily: 'var(--ba-body-font)',
    },
  };

  const content = (
    <>
      <p className="font-bold" style={{ fontFamily: 'var(--ba-heading-font)' }}>
        {title}
      </p>
      {children && <p>{children}</p>}
      {hint && <p className="text-[0.8125rem]">{hint}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1.5 self-start border border-solid px-3.5 py-1.5 text-sm font-semibold"
          style={{
            backgroundColor: BRANDED_FEEDBACK_SURFACE,
            color: text,
            borderColor: border,
            borderRadius: 'var(--ba-radius)',
          }}
        >
          {retryLabel}
        </button>
      )}
    </>
  );

  return variant === 'error' ? (
    <div role="alert" {...container}>
      {content}
    </div>
  ) : (
    <output {...container}>{content}</output>
  );
}
