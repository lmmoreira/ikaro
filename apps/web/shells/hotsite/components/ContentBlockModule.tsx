import Image from 'next/image';
import type React from 'react';
import type { ContentBlockCta, ContentBlockModuleData } from '@ikaro/types';
import {
  LEGACY_SECTION_PADDING,
  legacySectionBackground,
  sectionHeadingStyle,
  sectionHeadingStyle600,
  sectionTextColor,
} from '@/features/platform/hotsite/module-styles';
import { HotsiteSectionShell, type SectionPresentationProps } from './HotsiteSectionShell';
import { RestrictedMarkdown } from './RestrictedMarkdown';
import { SectionEyebrow } from './SectionEyebrow';
import { KickerCallout, TechnicalFacts, TrustGridTiles } from './ContentBlockSpecialLayouts';

interface ContentBlockModuleProps extends SectionPresentationProps {
  readonly data: ContentBlockModuleData;
  readonly slug: string;
  readonly bgVariant?: 'default' | 'alt';
}

type Align = NonNullable<ContentBlockModuleData['align']>;

const ALIGN_CLASS: Readonly<Record<Align, string>> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

const JUSTIFY_CLASS: Readonly<Record<Align, string>> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};

// The variants whose copy sits alone in the middle of the section, over its own background.
const STATEMENT_DEFAULT_ALIGN: Readonly<Record<ContentBlockModuleData['variant'], Align>> = {
  'trust-grid': 'center',
  'process-steps': 'center',
  'collage-callout': 'left',
  'technical-callout': 'left',
  'image-statement': 'center',
  'immersive-statement': 'center',
};

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-btn-radius, var(--ba-radius))',
};

function CtaLink({ cta }: { readonly cta: ContentBlockCta }): React.JSX.Element {
  return (
    <a
      href={`#${cta.target}`}
      data-testid="content-block-cta"
      style={btnStyle}
      className="inline-block border-2 px-8 py-3 font-semibold transition-all hover:bg-[var(--ba-btn-hover-bg)] hover:opacity-90"
    >
      {cta.label}
    </a>
  );
}

// Title, eyebrow, body and CTA, shared by all six variants.
function Copy({
  data,
  align,
  large = false,
}: {
  readonly data: ContentBlockModuleData;
  readonly align: Align;
  readonly large?: boolean;
}): React.JSX.Element {
  return (
    <div className={ALIGN_CLASS[align]}>
      {data.eyebrow && <SectionEyebrow text={data.eyebrow} />}
      {data.title !== '' && (
        <h2
          className={`mb-4 font-bold ${large ? 'text-4xl sm:text-6xl' : 'text-3xl sm:text-4xl'}`}
          style={sectionHeadingStyle}
        >
          {data.title}
        </h2>
      )}
      {data.body && (
        <div className="mb-6" data-testid="content-block-body">
          <RestrictedMarkdown density={large ? 'comfortable' : 'compact'}>
            {data.body}
          </RestrictedMarkdown>
        </div>
      )}
      {data.cta && (
        <div className={`flex ${JUSTIFY_CLASS[align]}`}>
          <CtaLink cta={data.cta} />
        </div>
      )}
    </div>
  );
}

function VariantBody({
  data,
  align,
  tints,
}: {
  readonly data: ContentBlockModuleData;
  readonly align: Align;
  readonly tints?: SectionPresentationProps['tints'];
}): React.JSX.Element {
  if (data.variant === 'trust-grid') {
    if (data.appearance === 'tiles') {
      return (
        <TrustGridTiles
          items={data.items}
          copy={<Copy data={data} align={align} />}
          tints={tints}
        />
      );
    }
    return (
      <>
        <Copy data={data} align={align} />
        <ul
          className="mt-10 grid list-none grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="trust-grid-items"
        >
          {data.items.map((item, index) => (
            <li
              key={`${item.label}-${index}`}
              className="flex gap-3 border-t-2 pt-4"
              style={{ borderColor: 'var(--ba-primary)' }}
            >
              <div>
                <p className="font-semibold">{item.label}</p>
                {item.description && <p className="mt-1 text-sm opacity-80">{item.description}</p>}
              </div>
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (data.variant === 'process-steps') {
    return (
      <>
        <Copy data={data} align={align} />
        <ol
          className={`mt-10 grid list-none grid-cols-1 gap-8 md:grid-cols-3 ${data.appearance === 'ruled' ? 'border-y py-6' : ''}`}
          data-testid="steps"
        >
          {data.items.map((item, index) => (
            <li
              key={`${item.title}-${index}`}
              className={data.appearance === 'ruled' && index ? 'border-l pl-6' : undefined}
              style={
                data.appearance === 'ruled'
                  ? { borderColor: 'var(--ba-section-divider)' }
                  : undefined
              }
            >
              {item.label ? (
                <span
                  className="mb-3 block text-sm font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--ba-primary)' }}
                >
                  {String(index + 1).padStart(2, '0')} · {item.label}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="mb-3 block text-4xl font-light tabular-nums opacity-50"
                  style={{ fontFamily: 'var(--ba-heading-font)' }}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
              )}
              <h3 className="mb-2 text-lg font-semibold" style={sectionHeadingStyle600}>
                {item.title}
              </h3>
              <p className="text-sm opacity-80">{item.body}</p>
            </li>
          ))}
        </ol>
      </>
    );
  }

  if (data.variant === 'collage-callout') {
    return (
      <div className="grid items-center gap-10 md:grid-cols-2">
        <Copy data={data} align={align} />
        <ul className="grid list-none grid-cols-2 gap-3" data-testid="collage-images">
          {data.images.map((image, index) => (
            <li
              key={`${image.url}-${index}`}
              className={`relative overflow-hidden ${index % 2 === 0 ? 'aspect-[3/4]' : 'aspect-square'}`}
              style={{ borderRadius: 'var(--ba-radius)' }}
            >
              <Image
                src={image.url}
                alt={image.alt ?? ''}
                fill
                loading="lazy"
                sizes="(min-width: 768px) 25vw, 50vw"
                className="object-cover"
              />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (data.variant === 'technical-callout') {
    if (data.factsPlacement === 'kicker' && data.facts?.[0]) {
      return <KickerCallout fact={data.facts[0]} copy={<Copy data={data} align={align} />} />;
    }
    return (
      <div
        className="grid items-center gap-10 border-l-4 pl-6 md:grid-cols-2"
        style={{ borderColor: 'var(--ba-primary)' }}
      >
        <Copy data={data} align={align} />
        {data.facts && data.facts.length > 0 && <TechnicalFacts facts={data.facts} />}
      </div>
    );
  }

  // image-statement and immersive-statement: the copy stands alone; any imagery is the section's
  // own `presentation.background`, drawn by HotsiteSectionShell.
  return <Copy data={data} align={align} large />;
}

export function ContentBlockModule({
  data,
  slug: _,
  bgVariant,
  presentation,
  sectionTokens,
  tints,
}: ContentBlockModuleProps): React.JSX.Element {
  const align = data.align ?? STATEMENT_DEFAULT_ALIGN[data.variant];
  const isImmersive = data.variant === 'immersive-statement';

  return (
    <HotsiteSectionShell
      id="content-block"
      dataVariant={data.variant}
      flow
      className={isImmersive ? 'flex min-h-[70vh] flex-col justify-center' : undefined}
      legacyBackground={legacySectionBackground(bgVariant)}
      legacyColor={sectionTextColor}
      legacyPadding={LEGACY_SECTION_PADDING}
      presentation={presentation}
      sectionTokens={sectionTokens}
    >
      <VariantBody data={data} align={align} tints={tints} />
    </HotsiteSectionShell>
  );
}
