import type { HotsiteManifestResponse, LeadFormModuleData } from '@ikaro/types';
import { LeadFormModuleDataSchema } from './module-schemas';

export interface ResolvedLeadFormModule {
  readonly available: boolean;
  readonly data: LeadFormModuleData | undefined;
}

// Shared by /[slug]/lead-form/page.tsx's generateMetadata() and the page body — both need the
// same "is the LEAD_FORM module enabled and does its data actually parse" answer (docs/
// CODE_STANDARDS.md: keep app/**/page.tsx thin, extract reusable logic and unit-test it here).
// manifest.layout.find() + safeParse() alone (without an .enabled check) would report a module
// disabled before render as "available", the exact regression UC-039 A6 exists to prevent.
export function resolveLeadFormModule(
  manifest: Pick<HotsiteManifestResponse, 'layout'>,
): ResolvedLeadFormModule {
  const leadFormModule = manifest.layout.find((m) => m.type === 'LEAD_FORM');
  const parsed = LeadFormModuleDataSchema.safeParse(leadFormModule?.data);
  return {
    available: !!leadFormModule?.enabled && parsed.success,
    data: parsed.success ? parsed.data : undefined,
  };
}
