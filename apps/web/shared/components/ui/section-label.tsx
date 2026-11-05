import * as React from 'react';
import { cn } from '@/shared/utils/cn';

export type SectionLabelElement = 'p' | 'h2' | 'h3' | 'span' | 'legend' | 'div' | 'dt';

export type SectionLabelTone = 'default' | 'info';

export interface SectionLabelProps extends React.HTMLAttributes<HTMLElement> {
  // The element to render: a section eyebrow is a paragraph, a heading, a legend or a `dt`
  // depending on where it sits, so the caller picks the semantics and the look stays shared.
  readonly as?: SectionLabelElement;
  readonly tone?: SectionLabelTone;
}

const TONE_CLASSES: Record<SectionLabelTone, string> = {
  default: 'text-gray-400',
  info: 'text-blue-700',
};

// The uppercase section eyebrow of the dashboard screens. Margins and layout stay with the
// caller through `className`, which is merged last so it can also override the colour.
export const SectionLabel = React.forwardRef<HTMLElement, SectionLabelProps>(
  ({ as = 'p', tone = 'default', className, ...props }, ref) =>
    React.createElement(as, {
      ref,
      className: cn('text-xs font-bold uppercase tracking-[0.07em]', TONE_CLASSES[tone], className),
      ...props,
    }),
);
SectionLabel.displayName = 'SectionLabel';
