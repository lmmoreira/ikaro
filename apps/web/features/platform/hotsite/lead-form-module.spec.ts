import { describe, expect, it } from 'vitest';
import type { HotsiteManifestResponse } from '@ikaro/types';
import { resolveLeadFormModule } from './lead-form-module';

function manifestWithLayout(
  layout: HotsiteManifestResponse['layout'],
): Pick<HotsiteManifestResponse, 'layout'> {
  return { layout };
}

const VALID_DATA = { title: 'Quer um orçamento?', ctaLabel: 'Preencher formulário' };

describe('resolveLeadFormModule', () => {
  it('is available when the module is enabled and its data parses', () => {
    const manifest = manifestWithLayout([{ type: 'LEAD_FORM', enabled: true, data: VALID_DATA }]);

    const result = resolveLeadFormModule(manifest);

    expect(result.available).toBe(true);
    expect(result.data).toEqual(VALID_DATA);
  });

  it('is unavailable when the module is disabled, even with valid data', () => {
    const manifest = manifestWithLayout([{ type: 'LEAD_FORM', enabled: false, data: VALID_DATA }]);

    const result = resolveLeadFormModule(manifest);

    expect(result.available).toBe(false);
  });

  it('is unavailable when no LEAD_FORM module exists in the layout', () => {
    const manifest = manifestWithLayout([
      { type: 'HERO', enabled: true, data: { title: 'Bem-vindo' } },
    ]);

    const result = resolveLeadFormModule(manifest);

    expect(result.available).toBe(false);
    expect(result.data).toBeUndefined();
  });

  it('is unavailable when the module data fails schema validation (missing required fields)', () => {
    const manifest = manifestWithLayout([
      { type: 'LEAD_FORM', enabled: true, data: { subtitle: 'no title or ctaLabel' } },
    ]);

    const result = resolveLeadFormModule(manifest);

    expect(result.available).toBe(false);
    expect(result.data).toBeUndefined();
  });
});
