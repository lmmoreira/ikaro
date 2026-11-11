import type React from 'react';
import { BRANDED_MUTED_TEXT } from './branded-surface-style';

interface BrandedMutedTextProps {
  /** The element to render; a secondary line is a paragraph unless it sits inside a phrase. */
  readonly as?: 'p' | 'span' | 'div';
  readonly className?: string;
  readonly testId?: string;
  readonly children: React.ReactNode;
}

/**
 * A secondary line (a hint, a count, a caption) on the tenant's secondary colour (TD51-S05).
 * The colour is the derived `--ba-secondary-muted`, which `applyBranding()` keeps at 4.5:1 or
 * better; a caller never chooses it and never uses an `opacity-*` class, which would lower a
 * colour that was derived to exactly the minimum.
 */
export function BrandedMutedText({
  as: Tag = 'p',
  className,
  testId,
  children,
}: BrandedMutedTextProps): React.JSX.Element {
  return (
    <Tag className={className} style={{ color: BRANDED_MUTED_TEXT }} data-testid={testId}>
      {children}
    </Tag>
  );
}
