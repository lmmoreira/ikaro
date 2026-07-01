import { toJsonLdScript } from '@/lib/hotsite/seo';

interface JsonLdScriptProps {
  readonly data: unknown;
}

export function JsonLdScript({ data }: JsonLdScriptProps): React.JSX.Element {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(data) }} />
  );
}
