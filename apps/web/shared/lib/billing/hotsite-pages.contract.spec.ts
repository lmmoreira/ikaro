import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOTSITE_PAGE_FEATURE } from '@/features/platform/hotsite/feature-availability';

// The public hotsite pages (everything under `app/[slug]` except the customer account) and what each
// does when the tenant lacks a feature. A page a feature owns is a row of `HOTSITE_PAGE_FEATURE` and
// asks `isHotsitePageAvailable` in both its metadata and its body, so a tenant without the feature
// gets the neutral "Página indisponível", never an error. A page with no feature of its own is
// declared here, with the reason. A new public page must be one or the other, or this spec fails.
const NO_FEATURE_OF_ITS_OWN: Readonly<Record<string, string>> = {
  '': 'the hotsite itself: it always opens, and omits the sections of the features the tenant lacks',
  login: 'the login page: every tenant has it, a suspended one included',
  'lead-form':
    'owned by its module: the manifest omits the lead-form module for a tenant without the feature, and resolveLeadFormModule reads it (the manager’s own enable switch is a different state)',
};

const PUBLIC_DIR = path.resolve(__dirname, '../../../app/[slug]');

function listPages(dir: string, route: string): string[] {
  const pages: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (route === '' && entry.name === 'my-account') continue;
      pages.push(
        ...listPages(path.join(dir, entry.name), route ? `${route}/${entry.name}` : entry.name),
      );
    } else if (entry.name === 'page.tsx') {
      pages.push(route);
    }
  }
  return pages;
}

const sourceOf = (route: string): string =>
  readFileSync(path.join(PUBLIC_DIR, route, 'page.tsx'), 'utf8');

describe('the public hotsite pages', () => {
  const pages = listPages(PUBLIC_DIR, '');
  const gated = Object.keys(HOTSITE_PAGE_FEATURE);

  it('finds the pages it is meant to check', () => {
    expect(pages.length).toBeGreaterThan(4);
  });

  it('decides every page: it is owned by a feature or declared to have none, never both', () => {
    expect([...pages].sort()).toEqual([...gated, ...Object.keys(NO_FEATURE_OF_ITS_OWN)].sort());
    expect(gated.filter((route) => route in NO_FEATURE_OF_ITS_OWN)).toEqual([]);
  });

  it.each(gated)('/%s asks the registry in its metadata and in its body', (route) => {
    const source = sourceOf(route);
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const asks = source.match(
      new RegExp(`isHotsitePageAvailable\\(manifest, '${escaped}'\\)`, 'g'),
    );

    // One call in `generateMetadata`, one in the page itself: they can never disagree.
    expect(asks?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  // Negative guarantee: a gated page never names a feature itself.
  it.each(gated)('/%s names no feature of its own', (route) => {
    expect(sourceOf(route)).not.toMatch(/isFeatureAvailable\(/);
    expect(sourceOf(route)).not.toMatch(/'(?:BOOKING|LOYALTY|LEAD_FORM|CHATBOT|HOTSITE)'/);
  });

  it('keeps /lead-form owned by its module', () => {
    expect(sourceOf('lead-form')).toMatch(/resolveLeadFormModule\(manifest\)/);
  });
});
