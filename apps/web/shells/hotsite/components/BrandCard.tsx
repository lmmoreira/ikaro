import type React from 'react';
import { BrandedMutedText } from '@/shared/components/hotsite/branded-muted-text';
import { brandedSurfaceStyle } from '@/shared/components/hotsite/branded-surface-style';

interface BrandCardProps {
  readonly name: string;
  readonly tagline?: string;
  readonly testId: string;
  readonly taglineTestId?: string;
}

// The tenant's name and tagline as a card: the right panel of a left-aligned Hero or Booking CTA
// whose `rightPanel` is 'brand-card'. Each caller passes its own test ids.
export function BrandCard({
  name,
  tagline,
  testId,
  taglineTestId,
}: BrandCardProps): React.JSX.Element {
  return (
    <div
      className="flex flex-shrink-0 flex-col items-center justify-center p-8 text-center sm:p-10"
      style={{ ...brandedSurfaceStyle, border: '2px solid var(--ba-primary)' }}
      data-testid={testId}
    >
      <div
        className="text-2xl font-black uppercase tracking-widest sm:text-3xl"
        style={{ color: 'var(--ba-secondary-accent, var(--ba-secondary-text))' }}
      >
        {name}
      </div>
      {tagline && (
        <BrandedMutedText
          as="div"
          className="mt-2 text-xs uppercase tracking-widest"
          testId={taglineTestId}
        >
          {tagline}
        </BrandedMutedText>
      )}
    </div>
  );
}
