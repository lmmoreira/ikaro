'use client';

import { createContext, useContext } from 'react';
import type { HotsiteModuleType } from '@ikaro/types';

// What the hotsite editor draws in place of a module's config panel while the tenant does not hold
// the feature that module needs (UC-125): the page builds the nodes, the two places that mount a
// panel (the visual inspector and the detailed "Configurar" view) read them from here, so the
// substitution is not threaded through every view in between.
export type LockedModulePanels = Partial<Record<HotsiteModuleType, React.ReactNode>>;

const NO_LOCKED_PANELS: LockedModulePanels = {};

const LockedModulePanelsContext = createContext<LockedModulePanels>(NO_LOCKED_PANELS);

export function LockedModulePanelsProvider({
  value,
  children,
}: {
  readonly value: LockedModulePanels | undefined;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <LockedModulePanelsContext.Provider value={value ?? NO_LOCKED_PANELS}>
      {children}
    </LockedModulePanelsContext.Provider>
  );
}

export function useLockedModulePanel(
  type: HotsiteModuleType | undefined,
): React.ReactNode | undefined {
  const panels = useContext(LockedModulePanelsContext);
  return type ? panels[type] : undefined;
}
