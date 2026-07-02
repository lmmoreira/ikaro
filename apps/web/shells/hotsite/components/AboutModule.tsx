import type React from 'react';
import Image from 'next/image';
import Markdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type { AboutModuleData } from '@ikaro/types';
import { sectionHeadingFont } from '@/features/platform/hotsite/module-styles';
import { SectionEyebrow } from './SectionEyebrow';

interface AboutModuleProps {
  readonly data: AboutModuleData;
  readonly slug: string;
  readonly bgVariant?: 'default' | 'alt';
}

const headingStyle: React.CSSProperties = {
  ...sectionHeadingFont,
  color: 'var(--ba-text)',
};

const linkStyle: React.CSSProperties = {
  color: 'var(--ba-primary)',
};

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-4 text-sm leading-relaxed">{children}</p>,
  h1: ({ children }) => <h3 className="mb-2 text-xl font-bold">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 text-lg font-bold">{children}</h3>,
  h3: ({ children }) => <h3 className="mb-2 text-base font-bold">{children}</h3>,
  ul: ({ children }) => <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm">{children}</ol>,
  a: ({ children, href }) => (
    <a
      href={href}
      className="underline"
      style={linkStyle}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
};

export function AboutModule({ data, slug: _, bgVariant }: AboutModuleProps): React.JSX.Element {
  const imagePosition = data.imagePosition ?? 'right';
  const bg = bgVariant === 'alt' ? 'var(--ba-secondary)' : 'var(--ba-background)';

  const textBlock = (
    <div>
      {data.eyebrow && <SectionEyebrow text={data.eyebrow} />}
      <h2 className="mb-6 text-3xl font-bold" style={headingStyle}>
        {data.title}
      </h2>
      <Markdown rehypePlugins={[rehypeSanitize]} components={markdownComponents}>
        {data.body}
      </Markdown>
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
    <section
      id="about"
      style={{
        backgroundColor: bg,
        color: 'var(--ba-text)',
        padding: 'var(--ba-section-py) 1.5rem',
      }}
    >
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-2 md:items-center">
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
      </div>
    </section>
  );
}
