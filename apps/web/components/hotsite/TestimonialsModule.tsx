import type React from 'react';
import type { TestimonialsModuleData } from '@beloauto/types';
import { sectionHeadingFont } from '@/lib/hotsite/module-styles';
import { TestimonialCard } from './TestimonialCard';
import { TestimonialsCarousel } from './TestimonialsCarousel';

interface TestimonialsModuleProps {
  readonly data: TestimonialsModuleData;
  readonly slug: string;
}

const headingStyle: React.CSSProperties = {
  ...sectionHeadingFont,
  color: 'var(--ba-text)',
};

export function TestimonialsModule({ data, slug: _ }: TestimonialsModuleProps) {
  if (data.items.length === 0) {
    return null;
  }

  const title = data.title ?? 'O que nossos clientes dizem';

  return (
    <section
      style={{
        backgroundColor: 'var(--ba-background)',
        color: 'var(--ba-text)',
        padding: 'var(--ba-section-py) 1.5rem',
      }}
    >
      <div className="mx-auto max-w-7xl">
        <h2 className="mb-10 text-center text-3xl font-bold" style={headingStyle}>
          {title}
        </h2>
        {data.layout === 'carousel' ? (
          <TestimonialsCarousel>
            {data.items.map((item, index) => (
              <TestimonialCard key={`${item.authorName}-${index}`} testimonial={item} />
            ))}
          </TestimonialsCarousel>
        ) : (
          <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {data.items.map((item, index) => (
              <li key={`${item.authorName}-${index}`}>
                <TestimonialCard testimonial={item} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
