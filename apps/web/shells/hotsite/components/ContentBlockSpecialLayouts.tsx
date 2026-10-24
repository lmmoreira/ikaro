import type React from 'react';
import type { ContentBlockTechnicalCalloutData, ContentBlockTrustGridData } from '@ikaro/types';
import { sectionHeadingStyle } from '@/features/platform/hotsite/module-styles';
import type { SectionTint } from '@/features/platform/hotsite/section-tints';

interface TrustGridTilesProps {
  readonly items: ContentBlockTrustGridData['items'];
  readonly copy: React.ReactNode;
  readonly tints?: readonly [SectionTint, SectionTint, SectionTint];
}

export function TrustGridTiles({ items, copy, tints }: TrustGridTilesProps): React.JSX.Element {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2">
      {copy}
      <ol className="grid list-none grid-cols-2 gap-4" data-testid="trust-grid-tiles">
        {items.map((item, index) => (
          <li
            key={`${item.label}-${index}`}
            className="p-6"
            style={{
              backgroundColor: tints?.[index % 3].background,
              color: tints?.[index % 3].text,
              borderRadius: 'var(--ba-radius)',
            }}
          >
            <span
              className="block text-3xl font-bold"
              style={{ ...sectionHeadingStyle, color: 'inherit' }}
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

export function TechnicalFacts({
  facts,
}: {
  readonly facts: NonNullable<ContentBlockTechnicalCalloutData['facts']>;
}): React.JSX.Element {
  return (
    <dl className="grid grid-cols-2 gap-6" data-testid="technical-facts">
      {facts.map((fact, index) => (
        <div key={`${fact.label}-${index}`} className="flex flex-col-reverse">
          <dt className="mt-1 text-xs uppercase tracking-widest opacity-70">{fact.label}</dt>
          <dd
            className="text-3xl font-bold tabular-nums"
            style={{ ...sectionHeadingStyle, color: 'var(--ba-section-text, var(--ba-primary))' }}
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
