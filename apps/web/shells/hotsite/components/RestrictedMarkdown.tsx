import type React from 'react';
import Markdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

// The one Markdown renderer for hotsite copy written by a manager (About, CONTENT_BLOCK bodies and
// the service long description): paragraphs, headings, emphasis, lists and links only. Raw HTML is
// never parsed (react-markdown escapes it) and images are disallowed — a picture only ever comes
// from a validated image slot. Links always open in a new tab with rel nofollow.
type MarkdownDensity = 'compact' | 'comfortable';

const DENSITY_CLASSES: Readonly<Record<MarkdownDensity, { p: string; list: string }>> = {
  compact: { p: 'mb-4 text-sm leading-relaxed', list: 'mb-4 space-y-1 pl-5 text-sm' },
  comfortable: {
    p: 'mb-5 text-base leading-relaxed sm:text-lg',
    list: 'mb-5 space-y-1.5 pl-5 text-base sm:text-lg',
  },
};

function buildComponents(density: MarkdownDensity): Components {
  const classes = DENSITY_CLASSES[density];
  return {
    p: ({ children }) => <p className={classes.p}>{children}</p>,
    h1: ({ children }) => <h3 className="mb-2 text-xl font-bold">{children}</h3>,
    h2: ({ children }) => <h3 className="mb-2 text-lg font-bold">{children}</h3>,
    h3: ({ children }) => <h3 className="mb-2 text-base font-bold">{children}</h3>,
    ul: ({ children }) => <ul className={`list-disc ${classes.list}`}>{children}</ul>,
    ol: ({ children }) => <ol className={`list-decimal ${classes.list}`}>{children}</ol>,
    a: ({ children, href }) => (
      <a
        href={href}
        className="underline"
        style={{ color: 'var(--ba-primary)' }}
        target="_blank"
        rel="noopener noreferrer nofollow"
      >
        {children}
      </a>
    ),
  };
}

const COMPONENTS: Readonly<Record<MarkdownDensity, Components>> = {
  compact: buildComponents('compact'),
  comfortable: buildComponents('comfortable'),
};

interface RestrictedMarkdownProps {
  readonly children: string;
  readonly density?: MarkdownDensity;
}

export function RestrictedMarkdown({
  children,
  density = 'compact',
}: RestrictedMarkdownProps): React.JSX.Element {
  return (
    <Markdown
      rehypePlugins={[rehypeSanitize]}
      disallowedElements={['img']}
      components={COMPONENTS[density]}
    >
      {children}
    </Markdown>
  );
}
