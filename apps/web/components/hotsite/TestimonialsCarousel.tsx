'use client';

import { useTranslations } from 'next-intl';
import { useState, type CSSProperties, type ReactNode } from 'react';

interface TestimonialsCarouselProps {
  readonly children: readonly ReactNode[];
}

const navButtonStyle: CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

export function TestimonialsCarousel({ children }: TestimonialsCarouselProps) {
  const t = useTranslations('hotsite');
  const [activeIndex, setActiveIndex] = useState(0);
  const total = children.length;

  const goToPrevious = () => setActiveIndex((current) => (current - 1 + total) % total);
  const goToNext = () => setActiveIndex((current) => (current + 1) % total);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="w-full max-w-xl">{children[activeIndex]}</div>
      {total > 1 && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={goToPrevious}
            aria-label={t('testimonials.previousAriaLabel')}
            style={navButtonStyle}
            className="border-2 px-4 py-2 font-semibold transition-all hover:opacity-90 hover:bg-[var(--ba-btn-hover-bg)]"
          >
            ‹
          </button>
          <span className="text-sm opacity-70">
            {activeIndex + 1} / {total}
          </span>
          <button
            type="button"
            onClick={goToNext}
            aria-label={t('testimonials.nextAriaLabel')}
            style={navButtonStyle}
            className="border-2 px-4 py-2 font-semibold transition-all hover:opacity-90 hover:bg-[var(--ba-btn-hover-bg)]"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
