// Extracted from SubmitInfoForm (TD37-S5A) — shared by both its default and success-state views.
export function BrandHeader({ brandName }: { readonly brandName?: string }): React.JSX.Element {
  return (
    <header
      className="flex items-center gap-3 border-b px-5 py-3.5"
      style={{ borderColor: 'var(--ba-secondary)' }}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
        style={{ backgroundColor: 'var(--ba-primary)' }}
        aria-hidden="true"
      >
        {brandName?.charAt(0).toUpperCase() ?? '?'}
      </div>
      {brandName && (
        <span data-testid="brand-name" className="text-base font-bold">
          {brandName}
        </span>
      )}
    </header>
  );
}
