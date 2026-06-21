import Image from 'next/image';
import type React from 'react';
import type { HeroModuleData } from '@ikaro/types';
import { sectionHeadingFont } from '@/lib/hotsite/module-styles';
import { SectionEyebrow } from './SectionEyebrow';

interface HeroModuleProps {
  readonly data: HeroModuleData;
  readonly slug: string;
  readonly tenantBrand?: { name: string; tagline?: string };
}

const headingStyle: React.CSSProperties = {
  ...sectionHeadingFont,
  color: 'var(--ba-hero-text)',
};

const primaryBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

const secondaryBtnStyle: React.CSSProperties = {
  backgroundColor: 'transparent',
  color: 'var(--ba-hero-text)',
  borderColor: 'var(--ba-hero-text)',
  borderRadius: 'var(--ba-radius)',
  opacity: 0.85,
};

function BrandCard({
  name,
  tagline,
}: {
  readonly name: string;
  readonly tagline?: string;
}): React.JSX.Element {
  return (
    <div
      className="flex flex-shrink-0 flex-col items-center justify-center p-8 text-center sm:p-10"
      style={{
        backgroundColor: 'var(--ba-secondary)',
        border: '2px solid var(--ba-primary)',
        borderRadius: 'var(--ba-radius)',
      }}
      data-testid="brand-card"
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
          data-testid="brand-card-tagline"
        >
          {tagline}
        </div>
      )}
    </div>
  );
}

function HeroTextContent({
  data,
  ctaHref,
}: {
  readonly data: HeroModuleData;
  readonly ctaHref: string;
}): React.JSX.Element {
  const secondaryHref = data.secondaryCtaTarget ? `#${data.secondaryCtaTarget}` : undefined;

  return (
    <>
      {data.eyebrow && <SectionEyebrow text={data.eyebrow} />}
      <h1 className="mb-4 text-4xl font-bold sm:text-5xl" style={headingStyle}>
        {data.title}
      </h1>
      {data.subtitle && (
        <p
          className="mb-8 text-lg opacity-90 sm:text-xl"
          style={{ color: 'var(--ba-hero-text)' }}
          data-testid="hero-subtitle"
        >
          {data.subtitle}
        </p>
      )}
      <div className="flex flex-wrap gap-4">
        <a
          href={ctaHref}
          style={primaryBtnStyle}
          className="inline-block border-2 px-8 py-3 font-semibold transition-all hover:opacity-90 hover:bg-[var(--ba-btn-hover-bg)]"
        >
          {data.ctaLabel}
        </a>
        {data.secondaryCtaLabel && secondaryHref && (
          <a
            href={secondaryHref}
            style={secondaryBtnStyle}
            className="inline-block border-2 px-8 py-3 font-semibold transition-all hover:opacity-100"
            data-testid="hero-secondary-cta"
          >
            {data.secondaryCtaLabel}
          </a>
        )}
      </div>
    </>
  );
}

export function HeroModule({ data, slug: _, tenantBrand }: HeroModuleProps): React.JSX.Element {
  const ctaHref = `#${data.ctaTarget}`;
  const bgUrl = data.backgroundImageUrl;

  // Determine what to render in the right column (left-aligned variant only).
  // If rightPanel is not set, fall back based on whether an image URL is present.
  const rightPanel = data.rightPanel ?? (bgUrl ? 'image' : 'none');

  const sectionStyle: React.CSSProperties = {
    backgroundColor: bgUrl && data.variant === 'centered' ? undefined : 'var(--ba-hero-bg)',
  };

  if (data.variant === 'centered') {
    return (
      <section
        data-variant="centered"
        className="relative flex min-h-screen items-center justify-center px-6 sm:min-h-[60vh]"
        style={sectionStyle}
      >
        {bgUrl && <Image src={bgUrl} alt="" fill priority sizes="100vw" className="object-cover" />}
        <div className="relative z-10 mx-auto max-w-3xl py-16 text-center">
          <HeroTextContent data={data} ctaHref={ctaHref} />
        </div>
      </section>
    );
  }

  // left-aligned: text on the left, optional right panel
  const hasRightPanel =
    rightPanel !== 'none' &&
    (rightPanel !== 'image' || !!bgUrl) &&
    (rightPanel !== 'brand-card' || !!tenantBrand);

  return (
    <section
      data-variant="left-aligned"
      className="relative flex min-h-screen items-center sm:min-h-[60vh]"
      style={{ backgroundColor: 'var(--ba-hero-bg)' }}
    >
      <div className="w-full max-w-7xl px-6 py-16 mx-auto">
        <div
          className={`grid grid-cols-1 gap-12 items-center ${hasRightPanel ? 'sm:grid-cols-2' : ''}`}
        >
          <div>
            <HeroTextContent data={data} ctaHref={ctaHref} />
          </div>
          {rightPanel === 'brand-card' && tenantBrand && (
            <BrandCard name={tenantBrand.name} tagline={tenantBrand.tagline} />
          )}
          {rightPanel === 'image' && bgUrl && (
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
