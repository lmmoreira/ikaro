import { describe, expect, it } from 'vitest';
import enMessages from '@ikaro/i18n/locales/en/web.json';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import {
  HOTSITE_TEMPLATE_CAPABILITIES,
  type ApplyHotsiteTemplateResponse,
  type HotsiteAdminContentResponse,
  type HotsiteModuleResponse,
} from '@ikaro/types';
import {
  TEMPLATE_CAPABILITY_LABEL_KEY,
  applyTemplateResult,
  buildApplyRequest,
  contentOf,
  countTenantImagesReplacedByTemplate,
  restoreUndoSnapshot,
  shouldConfirmUndo,
  undoSnapshotAfterApply,
} from './hotsite-template-application';

const TENANT = 'tenant-1';
const OWN = `tenants/${TENANT}/hotsite`;
const BASE = 'https://storage.example.com/ikaro-public-staging';

function module(
  type: HotsiteModuleResponse['type'],
  data: Record<string, unknown>,
  presentation?: HotsiteModuleResponse['presentation'],
): HotsiteModuleResponse {
  return { type, enabled: true, data, ...(presentation ? { presentation } : {}) };
}

function draftOf(layout: HotsiteModuleResponse[]): HotsiteAdminContentResponse {
  return {
    branding: { primaryColor: '#111111', logoUrl: `${OWN}/branding/logo.png` },
    layout,
    seo: { title: 'T', description: 'D', ogImageUrl: `${OWN}/seo/og.png` },
    updatedAt: '2026-10-24T00:00:00.000Z',
    isPublished: true,
  } as unknown as HotsiteAdminContentResponse;
}

describe('countTenantImagesReplacedByTemplate', () => {
  it('counts the tenant’s own hero, about and booking backgrounds and a section backdrop', () => {
    const layout = [
      module('HERO', { backgroundImageUrl: `${OWN}/hero/a.png` }),
      module('ABOUT', { imageUrl: `${OWN}/about/b.png` }),
      module('BOOKING_CTA', { backgroundImageUrl: `${OWN}/booking/c.png` }),
      module('CONTACT', {}, { background: { imageUrl: `${OWN}/section/d.png` } }),
    ];

    expect(countTenantImagesReplacedByTemplate(layout, TENANT)).toBe(4);
  });

  it('counts a resolved public URL, which is what a loaded draft holds', () => {
    const layout = [module('HERO', { backgroundImageUrl: `${BASE}/${OWN}/hero/a.png` })];

    expect(countTenantImagesReplacedByTemplate(layout, TENANT)).toBe(1);
  });

  it('counts a collage block’s photos', () => {
    const layout = [
      module('CONTENT_BLOCK', {
        variant: 'collage-callout',
        title: 'T',
        images: [{ url: `${OWN}/cb/1.png` }, { url: `${OWN}/cb/2.png` }],
      }),
    ];

    expect(countTenantImagesReplacedByTemplate(layout, TENANT)).toBe(2);
  });

  // Negative guarantees: the apply keeps these, so they must not raise a false "will be deleted".
  it('ignores a gallery’s images and testimonials’ avatars, which an apply keeps', () => {
    const layout = [
      module('GALLERY', { images: [{ url: `${OWN}/gallery/1.png`, source: 'upload' }] }),
      module('TESTIMONIALS', {
        items: [{ authorName: 'A', text: 't', avatarUrl: `${OWN}/av.png` }],
      }),
    ];

    expect(countTenantImagesReplacedByTemplate(layout, TENANT)).toBe(0);
  });

  it('ignores the lead form’s and chatbot’s own data, which an apply keeps', () => {
    const layout = [
      module('LEAD_FORM', { backgroundImageUrl: `${OWN}/lead/1.png` }),
      module('CHATBOT', {}),
    ];

    expect(countTenantImagesReplacedByTemplate(layout, TENANT)).toBe(0);
  });

  // The template always supplies `presentation`, so even a kept module loses its own backdrop.
  it('still counts the section backdrop of a module whose data is kept', () => {
    const layout = [
      module('GALLERY', { images: [] }, { background: { imageUrl: `${OWN}/section/g.png` } }),
    ];

    expect(countTenantImagesReplacedByTemplate(layout, TENANT)).toBe(1);
  });

  it('ignores catalogue images, not-yet-saved uploads and another tenant’s paths', () => {
    const layout = [
      module('HERO', { backgroundImageUrl: 'shared/hotsite-templates/casa47/v1/hero.webp' }),
      module('ABOUT', { imageUrl: 'tmp/tenant-1/about.png' }),
      module('BOOKING_CTA', { backgroundImageUrl: 'tenants/other-tenant/hotsite/x.png' }),
    ];

    expect(countTenantImagesReplacedByTemplate(layout, TENANT)).toBe(0);
  });

  it('is zero for an empty layout or a module with no image', () => {
    expect(countTenantImagesReplacedByTemplate([], TENANT)).toBe(0);
    expect(
      countTenantImagesReplacedByTemplate([module('HERO', { backgroundImageUrl: '' })], TENANT),
    ).toBe(0);
  });

  it('does not count the logo or the sharing image, which an apply keeps', () => {
    // They live outside `layout`, so they are not even looked at.
    expect(countTenantImagesReplacedByTemplate([], TENANT)).toBe(0);
  });
});

describe('buildApplyRequest', () => {
  it('sends image fields as storage paths, a catalogue URL included', () => {
    const draft = draftOf([
      module('HERO', {
        backgroundImageUrl: `${BASE}/shared/hotsite-templates/casa47/v1/hero.webp`,
      }),
      module('ABOUT', { imageUrl: `${BASE}/${OWN}/about/b.png` }),
    ]);
    draft.branding.logoUrl = `${BASE}/${OWN}/branding/logo.png`;

    const { content } = buildApplyRequest(draft, TENANT);

    expect(content.layout[0].data.backgroundImageUrl).toBe(
      'shared/hotsite-templates/casa47/v1/hero.webp',
    );
    expect(content.layout[1].data.imageUrl).toBe(`${OWN}/about/b.png`);
    expect(content.branding.logoUrl).toBe(`${OWN}/branding/logo.png`);
  });

  it('carries branding, layout and seo only', () => {
    const { content } = buildApplyRequest(draftOf([]), TENANT);

    expect(Object.keys(content).sort()).toEqual(['branding', 'layout', 'seo']);
  });
});

describe('applyTemplateResult', () => {
  const result = {
    content: {
      branding: { primaryColor: '#abcdef' },
      layout: [module('HERO', { title: 'novo' })],
      seo: { title: 'S' },
    },
    appliedTemplate: { id: 'casa47', version: 1 },
    appliedSampleTestimonials: false,
  } as unknown as ApplyHotsiteTemplateResponse;

  it('replaces the presentation and keeps the rest of the draft', () => {
    const draft = draftOf([module('ABOUT', {})]);

    const next = applyTemplateResult(draft, result);

    expect(contentOf(next)).toEqual(result.content);
    expect(next.isPublished).toBe(true);
    expect(next.updatedAt).toBe(draft.updatedAt);
  });
});

describe('undo snapshot', () => {
  const BEFORE = draftOf([module('HERO', { title: 'antes' })]);
  const APPLIED = draftOf([module('HERO', { title: 'depois', ctaLabel: 'x' })]);
  const snapshot = undoSnapshotAfterApply(BEFORE, APPLIED);

  it('restores the exact pre-apply presentation and leaves the rest of the draft', () => {
    const current = { ...APPLIED, isPublished: false };

    const restored = restoreUndoSnapshot(current, snapshot);

    expect(contentOf(restored)).toEqual(contentOf(BEFORE));
    expect(restored.isPublished).toBe(false);
  });

  it('needs no confirmation while the draft is what the apply produced', () => {
    expect(shouldConfirmUndo(APPLIED, snapshot)).toBe(false);
  });

  it('ignores key order when comparing', () => {
    const reordered = draftOf([module('HERO', { ctaLabel: 'x', title: 'depois' })]);

    expect(shouldConfirmUndo(reordered, snapshot)).toBe(false);
  });

  // Negative guarantee: any edit made since the apply would be discarded with it.
  it('asks first once the draft was edited since the apply', () => {
    const edited = draftOf([module('HERO', { title: 'depois', ctaLabel: 'y' })]);

    expect(shouldConfirmUndo(edited, snapshot)).toBe(true);
  });

  it('asks first when a branding colour changed after the apply', () => {
    const edited = { ...APPLIED, branding: { ...APPLIED.branding, primaryColor: '#999999' } };

    expect(shouldConfirmUndo(edited, snapshot)).toBe(true);
  });
});

describe('TEMPLATE_CAPABILITY_LABEL_KEY', () => {
  it('covers every capability token exactly once', () => {
    expect(Object.keys(TEMPLATE_CAPABILITY_LABEL_KEY).sort()).toEqual(
      [...HOTSITE_TEMPLATE_CAPABILITIES].sort(),
    );
  });

  it.each([
    ['en', enMessages],
    ['pt-BR', ptBRMessages],
  ] as const)('has copy in %s for every token', (_locale, messages) => {
    const templates = messages.dashboard.hotsitePage.templates as unknown as {
      capabilities: Record<string, string>;
    };

    for (const token of HOTSITE_TEMPLATE_CAPABILITIES) {
      expect(templates.capabilities[token], token).toEqual(expect.any(String));
    }
  });
});
