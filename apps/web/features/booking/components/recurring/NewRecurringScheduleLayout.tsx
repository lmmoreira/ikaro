interface NewRecurringScheduleLayoutProps {
  readonly testId: string;
  /** The central content. */
  readonly children: React.ReactNode;
  /** The action pane: on desktop beside the content, on mobile after it. */
  readonly pane: React.ReactNode;
}

/** The drill-down shape of every screen of the creation flow: central content + action pane. */
export function NewRecurringScheduleLayout({
  testId,
  children,
  pane,
}: NewRecurringScheduleLayoutProps): React.JSX.Element {
  return (
    <div className="w-full" data-testid={testId}>
      <div className="lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          {children}
          <div data-testid="action-pane-mobile" className="lg:hidden">
            {pane}
          </div>
        </div>
        <div data-testid="action-pane-desktop" className="hidden lg:sticky lg:top-6 lg:block">
          {pane}
        </div>
      </div>
    </div>
  );
}

/** The card the action pane sits in. */
export function ActionPane({
  aside,
  children,
}: {
  readonly aside: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4">
      <p className="mb-1 text-sm leading-relaxed text-gray-500">{aside}</p>
      {children}
    </div>
  );
}
