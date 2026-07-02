interface SectionEyebrowProps {
  readonly text: string;
}

export function SectionEyebrow({ text }: SectionEyebrowProps): React.JSX.Element {
  return (
    <p
      className="mb-3 text-xs font-semibold uppercase tracking-widest"
      style={{ color: 'var(--ba-primary)' }}
      data-testid="section-eyebrow"
    >
      {text}
    </p>
  );
}
