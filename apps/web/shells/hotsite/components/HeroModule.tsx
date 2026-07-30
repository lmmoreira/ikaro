import Image from 'next/image';
import type React from 'react';
import type { HeroModuleData } from '@ikaro/types';
import { sectionHeadingFont } from '@/features/platform/hotsite/module-styles';
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
  const objectPosition = `${data.backgroundImagePosition ?? 'center'} center`;

  // Determine what to render in the right column (left-aligned variant only).
  // If rightPanel is not set, fall back based on whether an image URL is present.
  const rightPanel = data.rightPanel ?? (bgUrl ? 'image' : 'none');

  const sectionStyle: React.CSSProperties = {
    backgroundColor: bgUrl && data.variant === 'centered' ? undefined : 'var(--ba-hero-bg)',
  };

  if (data.variant === 'centered') {
    return (
      // Both breakpoints use a vw-relative (container-width-relative) min-height floor, never a
      // vh (viewport-height-relative) one — vh is pinned to screen height, so as the browser
      // window is narrowed (without the screen itself changing height), a vh-based floor stays
      // fixed while the container's width shrinks, making the box progressively more portrait
      // and cropping progressively worse at every width in between, not just at the mobile
      // breakpoint. Both values approximate a landscape ratio close to a typical wide banner
      // (mobile: 21:9 via 42.86vw; sm:+: ~16:5 via 31.25vw, close to the desktop shape this
      // already had via the old 60vh at a typical monitor's proportions) — but because they're
      // width-relative, the ratio stays roughly constant at every window width, not just one.
      <section
        data-variant="centered"
        className="relative flex min-h-[42.86vw] items-center justify-center px-6 sm:min-h-[31.25vw]"
        style={sectionStyle}
      >
        {bgUrl && (
          <Image
            src={bgUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition }}
          />
        )}
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
            // sm:min-h-[15.6vw], not vh — same reasoning as the centered variant above. This
            // panel renders at roughly half the section's width at sm:+ (grid-cols-2), so 15.6vw
            // approximates the same ~16:5 landscape ratio as the centered variant's 31.25vw does
            // at full width (31.25 / 2 ≈ 15.6).
            <div className="relative aspect-[21/9] sm:aspect-auto sm:h-full sm:min-h-[15.6vw]">
              <Image
                src={bgUrl}
                alt=""
                fill
                priority
                sizes="(min-width: 640px) 50vw, 100vw"
                className="object-cover"
                style={{ borderRadius: 'var(--ba-radius)', objectPosition }}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
