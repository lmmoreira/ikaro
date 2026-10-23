import { describe, expect, it } from 'vitest';
import {
  MINIMUM_SCRIM_COLOR,
  contentWidthClass,
  gridWidthClass,
  resolveMinHeight,
  resolveOverlayBackground,
  resolvePaddingBlock,
  resolvePresentationBackgroundImage,
  resolveSectionScrim,
  textColumnWidthClass,
} from './section-presentation';

describe('section-presentation', () => {
  describe('contentWidthClass', () => {
    it.each([
      [undefined, 'max-w-7xl'],
      ['standard', 'max-w-7xl'],
      ['narrow', 'max-w-3xl'],
      ['wide', 'max-w-[90rem]'],
      ['full', 'max-w-none'],
    ] as const)('maps %s to %s', (width, expected) => {
      expect(contentWidthClass(width)).toBe(expected);
    });
  });

  describe('textColumnWidthClass', () => {
    it('keeps the module own column when the width is unset or standard', () => {
      expect(textColumnWidthClass(undefined, 'max-w-3xl')).toBe('max-w-3xl');
      expect(textColumnWidthClass('standard', 'max-w-3xl')).toBe('max-w-3xl');
    });

    it.each([
      ['narrow', 'max-w-xl'],
      ['wide', 'max-w-5xl'],
      ['full', 'max-w-none'],
    ] as const)('replaces the module column for %s', (width, expected) => {
      expect(textColumnWidthClass(width, 'max-w-3xl')).toBe(expected);
    });
  });

  describe('gridWidthClass', () => {
    it.each([
      [undefined, 'max-w-7xl'],
      ['narrow', 'max-w-4xl'],
      ['wide', 'max-w-[90rem]'],
      ['full', 'max-w-none'],
    ] as const)('maps %s to %s', (width, expected) => {
      expect(gridWidthClass(width)).toBe(expected);
    });
  });

  it('resolves min-height and padding only when set', () => {
    expect(resolveMinHeight(undefined)).toBeUndefined();
    expect(resolveMinHeight('viewport')).toBe('100vh');
    expect(resolveMinHeight('auto')).toBe('auto');
    expect(resolvePaddingBlock(undefined)).toBeUndefined();
    expect(resolvePaddingBlock('none')).toBe('0');
    expect(resolvePaddingBlock('spacious')).toBe('calc(var(--ba-section-py) * 1.5)');
  });

  describe('resolveOverlayBackground', () => {
    it('is undefined for an absent or none overlay', () => {
      expect(resolveOverlayBackground(undefined)).toBeUndefined();
      expect(resolveOverlayBackground({ type: 'none' })).toBeUndefined();
    });

    it('turns a solid overlay into an rgba colour', () => {
      expect(resolveOverlayBackground({ type: 'solid', color: '#102030', opacity: 0.5 })).toBe(
        'rgba(16, 32, 48, 0.5)',
      );
    });

    it('turns a linear-gradient overlay into a CSS gradient in the chosen direction', () => {
      expect(
        resolveOverlayBackground({
          type: 'linear-gradient',
          direction: 'to-right',
          fromColor: '#000000',
          fromOpacity: 0.8,
          toColor: '#FFFFFF',
          toOpacity: 0,
        }),
      ).toBe('linear-gradient(to right, rgba(0, 0, 0, 0.8), rgba(255, 255, 255, 0))');
    });
  });

  describe('resolvePresentationBackgroundImage', () => {
    it('is null without a presentation background or with an empty path', () => {
      expect(resolvePresentationBackgroundImage(undefined)).toBeNull();
      expect(resolvePresentationBackgroundImage({ background: { imageUrl: null } })).toBeNull();
      expect(resolvePresentationBackgroundImage({ background: { imageUrl: '' } })).toBeNull();
    });

    it('returns the url and a focal position defaulting to center', () => {
      expect(
        resolvePresentationBackgroundImage({ background: { imageUrl: 'https://x/a.png' } }),
      ).toEqual({ url: 'https://x/a.png', objectPosition: 'center center' });
      expect(
        resolvePresentationBackgroundImage({
          background: { imageUrl: 'https://x/a.png', position: 'left' },
        }),
      ).toEqual({ url: 'https://x/a.png', objectPosition: 'left center' });
    });
  });

  describe('resolveSectionScrim', () => {
    // Negative guarantee: a module that never opted into `presentation` must not gain a scrim, so
    // existing photo sections render exactly as before.
    it('adds no scrim without a presentation, even over a photo', () => {
      expect(resolveSectionScrim(undefined, true)).toBeUndefined();
    });

    it('gives a photo section the minimum scrim when the overlay is absent or none', () => {
      expect(resolveSectionScrim({}, true)).toBe(MINIMUM_SCRIM_COLOR);
      expect(resolveSectionScrim({ overlay: { type: 'none' } }, true)).toBe(MINIMUM_SCRIM_COLOR);
    });

    it('uses an explicit overlay as written', () => {
      expect(
        resolveSectionScrim({ overlay: { type: 'solid', color: '#000000', opacity: 0.1 } }, true),
      ).toBe('rgba(0, 0, 0, 0.1)');
    });

    it('tints a section with no photo only when an overlay is explicit', () => {
      expect(resolveSectionScrim({}, false)).toBeUndefined();
      expect(
        resolveSectionScrim({ overlay: { type: 'solid', color: '#000000', opacity: 0.1 } }, false),
      ).toBe('rgba(0, 0, 0, 0.1)');
    });
  });
});
