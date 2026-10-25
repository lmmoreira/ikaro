import type { HotsiteModuleResponse } from '@ikaro/types';

// Shared prop contract for all 12 module config panels. `data`/`onChange` operate on the generic
// wire shape (HotsiteModuleResponse.data: Record<string, unknown> — packages/types/src/hotsite.ts)
// because HotsiteEditor holds a single heterogeneous registry of panels keyed by HotsiteModuleType;
// each panel casts `data` to its own specific *ModuleData type internally (module-schemas.ts is
// the source of truth for each shape) rather than the registry attempting a discriminated union
// TypeScript can't cleanly express across a Record<HotsiteModuleType, Component>.
export interface ModuleConfigPanelProps {
  readonly data: Record<string, unknown>;
  readonly onChange: (data: Record<string, unknown>) => void;
  // The draft's layout, for the one panel whose choices depend on other modules (NAVIGATION lists
  // only the sections that are enabled). Every other panel ignores it.
  readonly layout?: readonly HotsiteModuleResponse[];
}

// TS won't structurally assign a specific *ModuleData interface to/from Record<string, unknown>
// without an intermediate `unknown` cast (no index signature on the specific interfaces). These
// two helpers centralize that cast so each panel doesn't repeat `as unknown as X` inline.
export function readModuleData<T>(data: Record<string, unknown>): T {
  return data as unknown as T;
}

export function writeModuleData<T>(data: T): Record<string, unknown> {
  return data as unknown as Record<string, unknown>;
}
