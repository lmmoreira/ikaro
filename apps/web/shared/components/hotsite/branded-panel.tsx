import type React from 'react';
import { brandedSurfaceStyle } from './branded-surface-style';

interface BrandedPanelProps {
  /** Small uppercase heading; painted in the derived accent so a caller never picks its colour. */
  readonly label?: string;
  readonly className?: string;
  readonly testId?: string;
  readonly children: React.ReactNode;
}

/**
 * A bordered panel on the tenant's secondary colour (TD51-S05). Text and the label take the
 * colours `applyBranding()` derives to read over `--ba-secondary` (`--ba-secondary-text`,
 * `--ba-secondary-accent`), never `--ba-primary` or `--ba-text`. ESLint
 * `SECONDARY_SURFACE_SELECTOR` sends a raw `backgroundColor: 'var(--ba-secondary)'` here.
 */
export function BrandedPanel({
  label,
  className,
  testId,
  children,
}: BrandedPanelProps): React.JSX.Element {
  return (
    <div
      data-testid={testId}
      className={`border ${className ?? ''}`.trim()}
      style={{ ...brandedSurfaceStyle, borderColor: 'var(--ba-secondary)' }}
    >
      {label !== undefined && (
        <p
          className="mb-1 text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--ba-secondary-accent, var(--ba-secondary-text))' }}
        >
          {label}
        </p>
      )}
      {children}
    </div>
  );
}
