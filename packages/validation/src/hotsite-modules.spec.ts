import { GenericErrorCode, deriveViolation } from '@ikaro/types';
import {
  HOTSITE_MODULE_CONTRACT_CASES,
  HOTSITE_PRESENTATION_CONTRACT_CASES,
} from '@ikaro/types/testing/hotsite-module-contract';
import { HOTSITE_MODULE_TYPES } from './hotsite';
import { HotsiteModulePresentationSchema, HotsiteModuleSchema } from './hotsite-modules';

describe('HotsiteModuleSchema', () => {
  describe('shared contract fixtures (the web mirror runs the same table)', () => {
    it.each(HOTSITE_MODULE_CONTRACT_CASES)('$name', ({ type, data, valid }) => {
      const result = HotsiteModuleSchema.safeParse({ type, enabled: true, data });
      expect(result.success).toBe(valid);
    });

    it('covers every module type with at least one accepted and one rejected case', () => {
      for (const type of HOTSITE_MODULE_TYPES) {
        const cases = HOTSITE_MODULE_CONTRACT_CASES.filter((c) => c.type === type);
        expect(cases.some((c) => c.valid)).toBe(true);
        expect(cases.some((c) => !c.valid)).toBe(true);
      }
    });
  });

  describe('presentation fixtures', () => {
    it.each(HOTSITE_PRESENTATION_CONTRACT_CASES)('$name', ({ presentation, valid }) => {
      expect(HotsiteModulePresentationSchema.safeParse(presentation).success).toBe(valid);
    });
  });

  it('has a schema for every canonical module type (and nothing else)', () => {
    const covered = HotsiteModuleSchema.options.map((option) => option.shape.type.value);
    expect([...covered].sort()).toEqual([...HOTSITE_MODULE_TYPES].sort());
  });

  it('rejects an unknown module type', () => {
    expect(
      HotsiteModuleSchema.safeParse({ type: 'UNKNOWN', enabled: true, data: {} }).success,
    ).toBe(false);
  });

  it('accepts a CHATBOT module (M19-S11)', () => {
    expect(
      HotsiteModuleSchema.safeParse({ type: 'CHATBOT', enabled: true, data: {} }).success,
    ).toBe(true);
  });

  it('carries presentation alongside data and accepts a module without it', () => {
    const withPresentation = HotsiteModuleSchema.safeParse({
      type: 'ABOUT',
      enabled: true,
      data: { title: 'T', body: 'B', imagePosition: 'left' },
      presentation: { surface: 'primary', padding: 'spacious' },
    });
    expect(withPresentation.success).toBe(true);
    if (withPresentation.success) {
      expect(withPresentation.data.presentation).toEqual({
        surface: 'primary',
        padding: 'spacious',
      });
    }
  });

  it('rejects an invalid presentation on an otherwise valid module', () => {
    expect(
      HotsiteModuleSchema.safeParse({
        type: 'ABOUT',
        enabled: true,
        data: { title: 'T', body: 'B', imagePosition: 'left' },
        presentation: { surface: 'neon' },
      }).success,
    ).toBe(false);
  });

  // Existing-module `data` is validated now (it used to be an unconstrained record). Each of these
  // is the exact example the story names.
  describe('field-level violations on existing modules', () => {
    const violationsOf = (input: unknown): { field: string; code: string }[] => {
      const result = HotsiteModuleSchema.safeParse(input, { reportInput: true });
      if (result.success) return [];
      return result.error.issues.map((issue) => deriveViolation(issue));
    };

    it('reports a HERO without ctaLabel as GENERIC_FIELD_REQUIRED on data.ctaLabel', () => {
      expect(
        violationsOf({
          type: 'HERO',
          enabled: true,
          data: { variant: 'centered', title: 'T', ctaTarget: 'booking-form' },
        }),
      ).toEqual([{ field: 'data.ctaLabel', code: GenericErrorCode.FIELD_REQUIRED }]);
    });

    it('reports a GALLERY with an unknown layout as GENERIC_VALUE_INVALID on data.layout', () => {
      expect(
        violationsOf({
          type: 'GALLERY',
          enabled: true,
          data: { images: [], layout: 'zzz', maxVisible: 6 },
        }),
      ).toEqual([{ field: 'data.layout', code: GenericErrorCode.VALUE_INVALID }]);
    });

    it('reports an unknown key on a NAVIGATION module as GENERIC_VALUE_INVALID', () => {
      const violations = violationsOf({
        type: 'NAVIGATION',
        enabled: true,
        data: { items: [], extra: true },
      });
      expect(violations).toHaveLength(1);
      expect(violations[0].code).toBe(GenericErrorCode.VALUE_INVALID);
    });

    it('reports an unknown module type as GENERIC_VALUE_INVALID', () => {
      const violations = violationsOf({ type: 'UNKNOWN', enabled: true, data: {} });
      expect(violations).toEqual([{ field: 'type', code: GenericErrorCode.VALUE_INVALID }]);
    });
  });

  // M20-S08 — audienceMode/questions must never reach layout[].data; that blob feeds the
  // public-cached manifest, while these two fields belong to LeadFormConfig (a separate table).
  describe('LEAD_FORM teaser data', () => {
    it('accepts a LEAD_FORM module with only teaser fields', () => {
      expect(
        HotsiteModuleSchema.safeParse({
          type: 'LEAD_FORM',
          enabled: true,
          data: { title: 'Fale com a gente', ctaLabel: 'Enviar' },
        }).success,
      ).toBe(true);
    });

    it('rejects a LEAD_FORM module whose data includes audienceMode', () => {
      const result = HotsiteModuleSchema.safeParse({
        type: 'LEAD_FORM',
        enabled: true,
        data: { title: 'Fale com a gente', ctaLabel: 'Enviar', audienceMode: 'CUSTOMER_ONLY' },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues[0] as unknown as { params?: { code?: string } };
        expect(issue.params?.code).toBe(GenericErrorCode.VALUE_INVALID);
      }
    });

    it('rejects a LEAD_FORM module whose data includes questions', () => {
      expect(
        HotsiteModuleSchema.safeParse({
          type: 'LEAD_FORM',
          enabled: true,
          data: { title: 'Fale com a gente', ctaLabel: 'Enviar', questions: [] },
        }).success,
      ).toBe(false);
    });

    it('accepts a non-LEAD_FORM module whose data happens to include a key named audienceMode', () => {
      // The restriction is scoped to type === 'LEAD_FORM'; a loose older module tolerates it.
      expect(
        HotsiteModuleSchema.safeParse({
          type: 'FOOTER',
          enabled: true,
          data: { audienceMode: 'whatever' },
        }).success,
      ).toBe(true);
    });
  });
});
