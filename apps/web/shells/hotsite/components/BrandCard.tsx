import type React from 'react';

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
      style={{
        backgroundColor: 'var(--ba-secondary)',
        border: '2px solid var(--ba-primary)',
        borderRadius: 'var(--ba-radius)',
      }}
      data-testid={testId}
    >
      <div
        className="text-2xl font-black uppercase tracking-widest sm:text-3xl"
        style={{ color: 'var(--ba-primary)' }}
      >
        {name}
      </div>
      {tagline && (
        <div
          className="mt-2 text-xs uppercase tracking-widest"
          style={{ color: 'var(--ba-text)', opacity: 0.6 }}
          data-testid={taglineTestId}
        >
          {tagline}
        </div>
      )}
    </div>
  );
}
