import type { HotsiteModulePresentation, HotsiteModuleType } from '@ikaro/types';

// A module entry is `{ type, enabled, data, presentation? }`, but an editor panel only ever edits
// one flat object. The open module's buffer therefore carries `presentation` under this reserved
// key — the same fold-in/strip-out shape a LEAD_FORM buffer uses for its LeadFormConfig portion —
// and every commit splits it back out, so the key never reaches `layout[].data`.
export const PRESENTATION_BUFFER_KEY = 'presentation';

// What a module's section presentation may carry (mirrors the backend's hotsite-layout.rules.ts:
// NAVIGATION is page chrome and CHATBOT a floating widget, so neither has a section; a FOOTER may
// only pick its surface; a module with a background image of its own keeps it, so it takes no
// second one).
export type PresentationSupport = 'surface' | 'section' | 'section-with-background';

export const PRESENTATION_SUPPORT: Readonly<
  Partial<Record<HotsiteModuleType, PresentationSupport>>
> = {
  HERO: 'section',
  BOOKING_CTA: 'section',
  LEAD_FORM: 'section',
  SERVICE_LIST: 'section-with-background',
  GALLERY: 'section-with-background',
  TESTIMONIALS: 'section-with-background',
  ABOUT: 'section-with-background',
  CONTACT: 'section-with-background',
  CONTENT_BLOCK: 'section-with-background',
  FOOTER: 'surface',
};

export function readPresentation(
  data: Record<string, unknown>,
): HotsiteModulePresentation | undefined {
  return data[PRESENTATION_BUFFER_KEY] as HotsiteModulePresentation | undefined;
}

// Returns `data` carrying `presentation`, or without the key at all when there is none. An empty
// presentation counts as none: it validates, but would only make a clean module read as edited.
export function withPresentation(
  data: Record<string, unknown>,
  presentation: HotsiteModulePresentation | undefined,
): Record<string, unknown> {
  const next = { ...data };
  delete next[PRESENTATION_BUFFER_KEY];
  if (presentation === undefined || Object.keys(presentation).length === 0) return next;
  return { ...next, [PRESENTATION_BUFFER_KEY]: presentation };
}

export function splitPresentation(localData: Record<string, unknown>): {
  readonly data: Record<string, unknown>;
  readonly presentation: HotsiteModulePresentation | undefined;
} {
  return {
    data: withPresentation(localData, undefined),
    presentation: readPresentation(localData),
  };
}

// Key order never carries meaning in a manifest, and a buffer re-folded after an Apply need not
// list `presentation` where it was, so equality is structural.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function isPresentationEqual(
  a: HotsiteModulePresentation | undefined,
  b: HotsiteModulePresentation | undefined,
): boolean {
  const normalize = (value: HotsiteModulePresentation | undefined): unknown =>
    value !== undefined && Object.keys(value).length === 0 ? undefined : value;
  return canonicalJson(normalize(a)) === canonicalJson(normalize(b));
}
