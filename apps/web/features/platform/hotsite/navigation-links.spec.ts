import { describe, expect, it } from 'vitest';
import type { HotsiteModuleResponse } from '@ikaro/types';
import {
  disableModuleRemovingLinks,
  hasNavigationReferences,
  moveNavigationItem,
  navigationReferences,
} from './navigation-links';

function layoutWith(
  navigation: Record<string, unknown>,
  navigationEnabled = true,
): HotsiteModuleResponse[] {
  return [
    { type: 'NAVIGATION', enabled: navigationEnabled, data: navigation },
    { type: 'GALLERY', enabled: true, data: {} },
    { type: 'ABOUT', enabled: true, data: {} },
    { type: 'LEAD_FORM', enabled: true, data: {} },
  ];
}

const NAV = {
  items: [
    { label: 'Fotos', target: 'gallery' },
    { label: 'Sobre', target: 'about' },
  ],
  cta: { label: 'Orçamento', target: 'lead-form' },
};

describe('moveNavigationItem', () => {
  it('moves an item down and up, shifting the ones between', () => {
    expect(moveNavigationItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveNavigationItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('returns an equal copy for a move onto itself or outside the list', () => {
    const items = ['a', 'b'];

    expect(moveNavigationItem(items, 1, 1)).toEqual(items);
    expect(moveNavigationItem(items, 0, 5)).toEqual(items);
    expect(moveNavigationItem(items, -1, 0)).toEqual(items);
    expect(moveNavigationItem(items, 0, 1)).not.toBe(items);
  });
});

describe('navigationReferences', () => {
  it('counts the items of an enabled navigation that target the module', () => {
    expect(navigationReferences(layoutWith(NAV), 'GALLERY')).toEqual({ items: 1, cta: false });
  });

  it('reports the header button when it targets the lead form', () => {
    expect(navigationReferences(layoutWith(NAV), 'LEAD_FORM')).toEqual({ items: 0, cta: true });
  });

  // Negative guarantee: a disabled navigation renders nothing and is not checked by the backend, so
  // turning a section off must not ask about links nobody sees.
  it('ignores a disabled navigation', () => {
    expect(hasNavigationReferences(layoutWith(NAV, false), 'GALLERY')).toBe(false);
  });

  it('is false for a module no item targets', () => {
    expect(hasNavigationReferences(layoutWith(NAV), 'TESTIMONIALS')).toBe(false);
  });
});

describe('disableModuleRemovingLinks', () => {
  it('disables the module and removes only the items that target it', () => {
    const result = disableModuleRemovingLinks(layoutWith(NAV), 'GALLERY');

    expect(result.find((module) => module.type === 'GALLERY')?.enabled).toBe(false);
    expect(result.find((module) => module.type === 'NAVIGATION')?.data).toEqual({
      items: [{ label: 'Sobre', target: 'about' }],
      cta: { label: 'Orçamento', target: 'lead-form' },
    });
  });

  it('removes the header button when the lead form is the module turned off', () => {
    const result = disableModuleRemovingLinks(layoutWith(NAV), 'LEAD_FORM');

    expect(result.find((module) => module.type === 'NAVIGATION')?.data).toEqual({
      items: NAV.items,
    });
  });

  it('keeps a header button that targets the booking form when the lead form is turned off', () => {
    const nav = { ...NAV, cta: { label: 'Agendar', target: 'booking-form' } };

    const result = disableModuleRemovingLinks(layoutWith(nav), 'LEAD_FORM');

    expect(result.find((module) => module.type === 'NAVIGATION')?.data).toEqual(nav);
  });
});
