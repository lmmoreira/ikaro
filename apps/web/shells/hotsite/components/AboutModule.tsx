import type React from 'react';
import Image from 'next/image';
import type { AboutModuleData } from '@ikaro/types';
import {
  LEGACY_SECTION_PADDING,
  legacySectionBackground,
  sectionHeadingStyle,
  sectionTextColor,
} from '@/features/platform/hotsite/module-styles';
import { HotsiteSectionShell, type SectionPresentationProps } from './HotsiteSectionShell';
import { RestrictedMarkdown } from './RestrictedMarkdown';
import { SectionEyebrow } from './SectionEyebrow';

interface AboutModuleProps extends SectionPresentationProps {
  readonly data: AboutModuleData;
  readonly slug: string;
  readonly bgVariant?: 'default' | 'alt';
}

const headingStyle = sectionHeadingStyle;

export function AboutModule({
  data,
  slug: _,
  bgVariant,
  presentation,
  sectionTokens,
}: AboutModuleProps): React.JSX.Element {
  const imagePosition = data.imagePosition ?? 'right';
  const shellProps = {
    id: 'about',
    flow: true,
    legacyBackground: legacySectionBackground(bgVariant),
    legacyColor: sectionTextColor,
    legacyPadding: LEGACY_SECTION_PADDING,
    presentation,
    sectionTokens,
  } as const;

  if (data.variant === 'editorial') {
    // Editorial: a single long-form column — wide image first, then a generous title and body.
    return (
      <HotsiteSectionShell {...shellProps}>
        <div className="mx-auto max-w-3xl" data-variant="editorial">
          {data.imageUrl && (
            <div
              className="relative mb-12 aspect-[21/9] w-full overflow-hidden"
              style={{ borderRadius: 'var(--ba-radius)' }}
            >
              <Image
                src={data.imageUrl}
                alt={data.title}
                fill
                loading="lazy"
                sizes="(min-width: 768px) 768px, 100vw"
                className="object-cover"
              />
            </div>
          )}
          {data.eyebrow && <SectionEyebrow text={data.eyebrow} />}
          <h2 className="mb-8 text-4xl font-bold leading-tight sm:text-5xl" style={headingStyle}>
            {data.title}
          </h2>
          <RestrictedMarkdown density="comfortable">{data.body}</RestrictedMarkdown>
        </div>
      </HotsiteSectionShell>
    );
  }

  const textBlock = (
    <div>
      {data.eyebrow && <SectionEyebrow text={data.eyebrow} />}
      <h2 className="mb-6 text-3xl font-bold" style={headingStyle}>
        {data.title}
      </h2>
      <RestrictedMarkdown>{data.body}</RestrictedMarkdown>
    </div>
  );

  const imageBlock = data.imageUrl && (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden"
      style={{ borderRadius: 'var(--ba-radius)' }}
    >
      <Image
        src={data.imageUrl}
        alt={data.title}
        fill
        loading="lazy"
        sizes="(min-width: 768px) 50vw, 100vw"
        className="object-cover"
      />
    </div>
  );

  return (
    <HotsiteSectionShell
      {...shellProps}
      contentClassName="grid gap-10 md:grid-cols-2 md:items-center"
    >
      {imagePosition === 'left' ? (
        <>
          {imageBlock}
          {textBlock}
        </>
      ) : (
        <>
          {textBlock}
          {imageBlock}
        </>
      )}
    </HotsiteSectionShell>
  );
}
