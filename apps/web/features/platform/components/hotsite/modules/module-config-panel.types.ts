// Shared prop contract for all 8 module config panels. `data`/`onChange` operate on the generic
// wire shape (HotsiteModuleResponse.data: Record<string, unknown> — packages/types/src/hotsite.ts)
// because HotsiteEditor holds a single heterogeneous registry of panels keyed by HotsiteModuleType;
// each panel casts `data` to its own specific *ModuleData type internally (module-schemas.ts is
// the source of truth for each shape) rather than the registry attempting a discriminated union
// TypeScript can't cleanly express across a Record<HotsiteModuleType, Component>.
export interface ModuleConfigPanelProps {
  readonly data: Record<string, unknown>;
  readonly onChange: (data: Record<string, unknown>) => void;
}
