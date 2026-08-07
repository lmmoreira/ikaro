// Replaces next/image in the Vitest environment.
// The real module registers layout observers and generates optimised srcsets at build time — unusable in tests.
import React from 'react';

// `fill`/`priority` are Next-only props that don't exist on a real <img> (React would warn passing
// them straight through) — stripped here. `sizes` is a genuine <img>/DOM attribute, unlike those
// two, so it passes through via ...rest like `loading` already does.
const MockImage = ({
  src,
  alt,
  fill: _fill,
  priority: _priority,
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
}) => React.createElement('img', { src, alt, ...rest });

MockImage.displayName = 'NextImageMock';

export default MockImage;
