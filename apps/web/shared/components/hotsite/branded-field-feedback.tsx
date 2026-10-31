import { BRANDED_FEEDBACK_SURFACE, BRANDED_FIELD_MESSAGE_COLOR } from './branded-feedback-palette';

/** Outline for an invalid input on the public hotsite; a fixed red, readable on any tenant palette. */
export const BRANDED_FIELD_INVALID_CLASS = 'border-red-600 ring-1 ring-red-600';

interface BrandedFieldFeedbackProps {
  readonly id: string;
  readonly children?: React.ReactNode;
}

export function BrandedFieldFeedback({
  id,
  children,
}: BrandedFieldFeedbackProps): React.JSX.Element | null {
  if (!children) return null;

  return (
    <p
      id={id}
      className="mt-1.5 inline-block rounded px-1.5 text-[0.8125rem] font-medium"
      style={{
        color: BRANDED_FIELD_MESSAGE_COLOR,
        backgroundColor: BRANDED_FEEDBACK_SURFACE,
        fontFamily: 'var(--ba-body-font)',
      }}
    >
      {children}
    </p>
  );
}
