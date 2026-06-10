import Image from 'next/image';
import type React from 'react';
import type { HeroModuleData } from '@beloauto/types';

interface HeroModuleProps {
  readonly data: HeroModuleData;
  readonly slug: string;
}

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--ba-heading-font)',
  color: 'var(--ba-hero-text)',
};

function HeroTextContent({
  data,
  ctaHref,
}: {
  readonly data: HeroModuleData;
  readonly ctaHref: string;
}) {
  return (
    <>
      <h1 className="text-4xl sm:text-5xl font-bold mb-4" style={headingStyle}>
        {data.title}
      </h1>
      {data.subtitle && (
        <p
          className="text-lg sm:text-xl mb-8 opacity-90"
          style={{ color: 'var(--ba-hero-text)' }}
          data-testid="hero-subtitle"
        >
          {data.subtitle}
        </p>
      )}
      <a
        href={ctaHref}
        style={btnStyle}
        className="inline-block border-2 px-8 py-3 font-semibold transition-all hover:opacity-90 hover:bg-[var(--ba-btn-hover-bg)]"
      >
        {data.ctaLabel}
      </a>
    </>
  );
}

export function HeroModule({ data, slug: _ }: HeroModuleProps) {
  const ctaHref = data.ctaTarget === 'booking' ? '#booking-form' : '#service-list';
  const bgUrl = data.backgroundImageUrl;

  if (data.variant === 'centered') {
    return (
      <section
        data-variant="centered"
        className="relative min-h-screen sm:min-h-[60vh] flex items-center justify-center px-6"
        style={{ backgroundColor: bgUrl ? undefined : 'var(--ba-primary)' }}
      >
        {bgUrl && <Image src={bgUrl} alt="" fill priority sizes="100vw" className="object-cover" />}
        <div className="relative z-10 text-center py-16 max-w-3xl mx-auto">
          <HeroTextContent data={data} ctaHref={ctaHref} />
        </div>
      </section>
    );
  }

  // left-aligned: image appears in the right column on desktop, stacks below on mobile
  return (
    <section
      data-variant="left-aligned"
      className="relative min-h-screen sm:min-h-[60vh] flex items-center"
      style={{ backgroundColor: 'var(--ba-primary)' }}
    >
      <div className="w-full px-6 py-16 max-w-7xl mx-auto">
        <div className={`grid grid-cols-1 ${bgUrl ? 'sm:grid-cols-2' : ''} gap-12 items-center`}>
          <div>
            <HeroTextContent data={data} ctaHref={ctaHref} />
          </div>
          {bgUrl && (
            <div className="relative h-64 sm:h-full sm:min-h-[40vh]">
              <Image
                src={bgUrl}
                alt=""
                fill
                priority
                sizes="(min-width: 640px) 50vw, 100vw"
                className="object-cover"
                style={{ borderRadius: 'var(--ba-radius)' }}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
