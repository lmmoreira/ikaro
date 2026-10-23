import { describe, expect, it } from 'vitest';
import {
  HOTSITE_MODULE_CONTRACT_CASES,
  HOTSITE_PRESENTATION_CONTRACT_CASES,
} from '@ikaro/types/testing/hotsite-module-contract';
import { MODULE_ORDER } from './default-layout';
import { isValidModuleData } from './module-schemas';
import { HotsiteModulePresentationSchema, isValidPresentation } from './presentation-schema';

// The web schemas are an independent mirror of @ikaro/validation's (apps/web never imports it).
// @ikaro/validation's hotsite-modules.spec.ts runs this same table, so a case accepted by one set
// and rejected by the other fails a test on one side or the other.
describe('module data contract (shared with @ikaro/validation)', () => {
  it.each(HOTSITE_MODULE_CONTRACT_CASES)('$name', ({ type, data, valid }) => {
    expect(isValidModuleData(type, data)).toBe(valid);
  });

  it('covers every module type with at least one accepted and one rejected case', () => {
    for (const type of MODULE_ORDER) {
      const cases = HOTSITE_MODULE_CONTRACT_CASES.filter((c) => c.type === type);
      expect(
        cases.some((c) => c.valid),
        `${type}: no accepted case`,
      ).toBe(true);
      expect(
        cases.some((c) => !c.valid),
        `${type}: no rejected case`,
      ).toBe(true);
    }
  });
});

describe('presentation contract (shared with @ikaro/validation)', () => {
  it.each(HOTSITE_PRESENTATION_CONTRACT_CASES)('$name', ({ presentation, valid }) => {
    expect(isValidPresentation(presentation)).toBe(valid);
    expect(HotsiteModulePresentationSchema.safeParse(presentation).success).toBe(valid);
  });
});
