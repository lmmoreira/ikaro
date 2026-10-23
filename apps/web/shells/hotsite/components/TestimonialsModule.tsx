import { useTranslations } from 'next-intl';
import type React from 'react';
import type { TestimonialsModuleData } from '@ikaro/types';
import {
  LEGACY_SECTION_PADDING,
  legacySectionBackground,
  sectionCardBackground,
  sectionHeadingFont,
  sectionHeadingStyle,
  sectionTextColor,
} from '@/features/platform/hotsite/module-styles';
import { HotsiteSectionShell, type SectionPresentationProps } from './HotsiteSectionShell';
import { SectionEyebrow } from './SectionEyebrow';
import { TestimonialCard } from './TestimonialCard';
import { TestimonialsCarousel } from './TestimonialsCarousel';

interface TestimonialsModuleProps extends SectionPresentationProps {
  readonly data: TestimonialsModuleData;
  readonly slug: string;
  readonly bgVariant?: 'default' | 'alt';
}

const headingStyle = sectionHeadingStyle;

// Editorial quote: one large pull-quote per testimonial, set in the heading font, with the author
// as a quiet attribution line. No card surface — typography carries the section.
function EditorialQuotes({
  items,
}: {
  readonly items: TestimonialsModuleData['items'];
}): React.JSX.Element {
  return (
    <ul className="mx-auto max-w-3xl list-none space-y-14" data-testid="editorial-quotes">
      {items.map((item, index) => (
        <li key={`${item.authorName}-${index}`}>
          <figure>
            <blockquote
              className="text-2xl italic leading-snug sm:text-3xl"
              style={{ ...sectionHeadingFont, color: sectionTextColor }}
            >
              &ldquo;{item.text}&rdquo;
            </blockquote>
            <figcaption
              className="mt-5 text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--ba-section-text, var(--ba-primary))' }}
            >
              {item.authorName}
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}

export function TestimonialsModule({
  data,
  slug: _,
  bgVariant,
  presentation,
  sectionTokens,
}: TestimonialsModuleProps): React.JSX.Element | null {
  const t = useTranslations('hotsite');

  if (data.items.length === 0) {
    return null;
  }

  const title = data.title ?? t('testimonials.defaultTitle');
  const cardBg = sectionCardBackground(bgVariant);

  return (
    <HotsiteSectionShell
      id="testimonials"
      flow
      legacyBackground={legacySectionBackground(bgVariant)}
      legacyColor={sectionTextColor}
      legacyPadding={LEGACY_SECTION_PADDING}
      presentation={presentation}
      sectionTokens={sectionTokens}
    >
      {data.eyebrow && (
        <div className="text-center">
          <SectionEyebrow text={data.eyebrow} />
        </div>
      )}
      <h2 className="mb-10 text-center text-3xl font-bold" style={headingStyle}>
        {title}
      </h2>
      {data.layout === 'editorial-quote' && <EditorialQuotes items={data.items} />}
      {data.layout === 'carousel' && (
        <TestimonialsCarousel>
          {data.items.map((item, index) => (
            <TestimonialCard
              key={`${item.authorName}-${index}`}
              testimonial={item}
              cardBg={cardBg}
            />
          ))}
        </TestimonialsCarousel>
      )}
      {data.layout === 'grid' && (
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((item, index) => (
            <li key={`${item.authorName}-${index}`}>
              <TestimonialCard testimonial={item} cardBg={cardBg} />
            </li>
          ))}
        </ul>
      )}
    </HotsiteSectionShell>
  );
}
