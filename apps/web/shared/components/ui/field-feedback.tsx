export const FIELD_INVALID_CLASS = 'border-red-600 bg-red-50/40 ring-1 ring-red-600';

interface FieldFeedbackProps {
  readonly id: string;
  readonly children?: React.ReactNode;
}

export function FieldFeedback({ id, children }: FieldFeedbackProps): React.JSX.Element | null {
  if (!children) return null;

  return (
    <p id={id} className="mt-1.5 text-[0.8125rem] font-medium text-red-600">
      {children}
    </p>
  );
}
