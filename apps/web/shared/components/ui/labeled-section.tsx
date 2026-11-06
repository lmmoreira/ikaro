import * as React from 'react';
import { SectionLabel } from '@/shared/components/ui/section-label';

export interface LabeledSectionProps {
  readonly title: string;
  readonly children: React.ReactNode;
  // On the `<section>`.
  readonly testId?: string;
  // On the label, for a screen whose tests read the title on its own.
  readonly labelTestId?: string;
  // Merged onto the `<section>`, for spacing from the caller's own layout.
  readonly className?: string;
}

// A block of a dashboard screen under its uppercase label: the section, the label and the gap
// between the label and the content. What goes below it (a `Card`, a list, a photo grid) is the
// caller's, so the frame carries no card or layout props of its own.
export function LabeledSection({
  title,
  children,
  testId,
  labelTestId,
  className,
}: Readonly<LabeledSectionProps>): React.JSX.Element {
  return (
    <section data-testid={testId} className={className}>
      <SectionLabel className="mb-2" data-testid={labelTestId}>
        {title}
      </SectionLabel>
      {children}
    </section>
  );
}
