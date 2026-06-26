// Replaces next/link in the Vitest environment.
// The real module is a Server/Client hybrid with router integration — unusable in jsdom.
import React from 'react';

const MockLink = ({
  href,
  children,
  className,
  onClick,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children?: React.ReactNode;
}) => React.createElement('a', { href, className, onClick, ...rest }, children);

MockLink.displayName = 'NextLinkMock';

export default MockLink;
