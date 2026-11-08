'use client';

import type { ReactNode } from 'react';

interface BookingOutcomeActionRailProps {
  readonly desktopTop?: ReactNode;
  readonly children: ReactNode;
}

export function BookingOutcomeActionRail({
  desktopTop,
  children,
}: BookingOutcomeActionRailProps): React.JSX.Element {
  return (
    <>
      <aside className="hidden space-y-4 lg:block lg:sticky lg:top-6">
        {desktopTop}
        {children}
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="space-y-2">{children}</div>
      </div>
    </>
  );
}
