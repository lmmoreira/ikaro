import { vi } from 'vitest';
import {
  HOTSITE_TEMPLATE_IDS,
  type HotsiteTemplateCapability,
  type HotsiteTemplateSummaryResponse,
} from '@ikaro/types';
import type { HotsiteTemplatesController } from './useHotsiteTemplateApplication';

// The six catalogue cards as the BFF lists them, for specs of components that take a
// HotsiteTemplatesController.
export function makeTemplateSummaries(
  capabilities: HotsiteTemplateCapability[] = ['navigation', 'trust-grid'],
): HotsiteTemplateSummaryResponse[] {
  return HOTSITE_TEMPLATE_IDS.map((id) => ({
    id,
    version: 1,
    thumbnailUrl: `https://storage.example.com/ikaro-public-staging/shared/hotsite-templates/${id}/v1/thumbnail.webp`,
    capabilities,
  }));
}

export function makeTemplatesController(
  overrides: Partial<HotsiteTemplatesController> = {},
): HotsiteTemplatesController {
  return {
    templates: makeTemplateSummaries(),
    isLoading: false,
    isError: false,
    reload: vi.fn(),
    appliedTemplateId: null,
    showSampleNotice: false,
    isApplying: false,
    applyingTemplateId: null,
    applyFailed: false,
    canUndo: false,
    replaceConfirmOpen: false,
    undoConfirmOpen: false,
    apply: vi.fn(),
    retryApply: vi.fn(),
    confirmReplace: vi.fn(),
    cancelReplace: vi.fn(),
    undo: vi.fn(),
    confirmUndo: vi.fn(),
    cancelUndo: vi.fn(),
    clearUndo: vi.fn(),
    ...overrides,
  };
}
