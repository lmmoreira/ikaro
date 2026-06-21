import { useTranslations } from 'next-intl';
import type React from 'react';
import type { TestimonialsModuleData } from '@ikaro/types';
import { sectionHeadingFont } from '@/lib/hotsite/module-styles';
import { SectionEyebrow } from './SectionEyebrow';
import { TestimonialCard } from './TestimonialCard';
import { TestimonialsCarousel } from './TestimonialsCarousel';

interface TestimonialsModuleProps {
  readonly data: TestimonialsModuleData;
  readonly slug: string;
  readonly bgVariant?: 'default' | 'alt';
}

const headingStyle: React.CSSProperties = {
  ...sectionHeadingFont,
  color: 'var(--ba-text)',
};

export function TestimonialsModule({ data, slug: _, bgVariant }: TestimonialsModuleProps) {
  const t = useTranslations('hotsite');

  if (data.items.length === 0) {
    return null;
  }

  const title = data.title ?? t('testimonials.defaultTitle');
  const bg = bgVariant === 'alt' ? 'var(--ba-secondary)' : 'var(--ba-background)';
  const cardBg = bgVariant === 'alt' ? 'var(--ba-background)' : 'var(--ba-secondary)';

  return (
    <section
      id="testimonials"
      style={{
        backgroundColor: bg,
        color: 'var(--ba-text)',
        padding: 'var(--ba-section-py) 1.5rem',
      }}
    >
      <div className="mx-auto max-w-7xl">
        {data.eyebrow && (
          <div className="text-center">
            <SectionEyebrow text={data.eyebrow} />
          </div>
        )}
        <h2 className="mb-10 text-center text-3xl font-bold" style={headingStyle}>
          {title}
        </h2>
        {data.layout === 'carousel' ? (
          <TestimonialsCarousel>
            {data.items.map((item, index) => (
              <TestimonialCard
                key={`${item.authorName}-${index}`}
                testimonial={item}
                cardBg={cardBg}
              />
            ))}
          </TestimonialsCarousel>
        ) : (
          <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {data.items.map((item, index) => (
              <li key={`${item.authorName}-${index}`}>
                <TestimonialCard testimonial={item} cardBg={cardBg} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
