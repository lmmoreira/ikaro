import type React from 'react';
import type { ContentBlockTechnicalCalloutData, ContentBlockTrustGridData } from '@ikaro/types';
import { sectionHeadingStyle } from '@/features/platform/hotsite/module-styles';

interface TrustGridTilesProps {
  readonly items: ContentBlockTrustGridData['items'];
  readonly copy: React.ReactNode;
}

export function TrustGridTiles({ items, copy }: TrustGridTilesProps): React.JSX.Element {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2">
      {copy}
      <ol className="grid list-none grid-cols-2 gap-4" data-testid="trust-grid-tiles">
        {items.map((item, index) => (
          <li
            key={`${item.label}-${index}`}
            className="p-6"
            style={{
              backgroundColor: `color-mix(in srgb, ${index % 3 === 0 ? 'var(--ba-primary)' : index % 3 === 1 ? 'var(--ba-secondary)' : 'var(--ba-text)'} 18%, var(--ba-section-bg, var(--ba-background)))`,
              borderRadius: 'var(--ba-radius)',
            }}
          >
            <span
              className="block text-3xl font-bold"
              style={{ ...sectionHeadingStyle, color: 'var(--ba-primary)' }}
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <p className="mt-3 font-semibold">{item.label}</p>
            {item.description && <p className="mt-1 text-sm opacity-80">{item.description}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

interface KickerCalloutProps {
  readonly fact: NonNullable<ContentBlockTechnicalCalloutData['facts']>[number];
  readonly copy: React.ReactNode;
}

export function KickerCallout({ fact, copy }: KickerCalloutProps): React.JSX.Element {
  return (
    <div className="border-l-4 pl-6" style={{ borderColor: 'var(--ba-primary)' }}>
      <div className="mb-4 flex items-baseline gap-3">
        <strong className="text-4xl" style={{ color: 'var(--ba-primary)' }}>
          {fact.value}
        </strong>
        <span className="text-xs font-semibold uppercase tracking-widest">{fact.label}</span>
      </div>
      {copy}
    </div>
  );
}
