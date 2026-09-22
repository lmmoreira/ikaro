interface BookingQueueSectionProps {
  readonly title: string;
  readonly countLabel: string | null;
  readonly hasItems: boolean;
  readonly emptyMessage: string;
  readonly children: React.ReactNode;
}

export function BookingQueueSection({
  title,
  countLabel,
  hasItems,
  emptyMessage,
  children,
}: BookingQueueSectionProps): React.JSX.Element {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">{title}</h2>
        <div className="h-px flex-1 bg-gray-200" />
        {countLabel && (
          <span className="text-[0.6875rem] font-bold text-gray-400">{countLabel}</span>
        )}
      </div>
      {hasItems ? children : <p className="text-sm text-gray-400">{emptyMessage}</p>}
    </section>
  );
}
