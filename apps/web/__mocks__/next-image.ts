// Replaces next/image in the Vitest environment.
// The real module registers layout observers and generates optimised srcsets at build time — unusable in tests.
import React from 'react';

const MockImage = ({
  src,
  alt,
  fill: _fill,
  priority: _priority,
  sizes: _sizes,
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
