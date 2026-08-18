// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { MODULE_ORDER } from '@/features/platform/hotsite/default-layout';
import { HotsitePreview, MODULE_CONFIG_PANELS } from './hotsite-editor-lazy-panels';

describe('hotsite-editor-lazy-panels', () => {
  it('has a config panel entry for every module type in MODULE_ORDER', () => {
    for (const type of MODULE_ORDER) {
      expect(
        MODULE_CONFIG_PANELS[type],
        `missing MODULE_CONFIG_PANELS entry for ${type}`,
      ).toBeDefined();
    }
  });

  it('exports a lazy-loaded HotsitePreview', () => {
    expect(HotsitePreview).toBeDefined();
  });
});
