import { describe, expect, it } from 'vitest';
import type { HotsiteModulePresentation } from '@ikaro/types';
import {
  PRESENTATION_BUFFER_KEY,
  PRESENTATION_SUPPORT,
  isPresentationEqual,
  readPresentation,
  splitPresentation,
  withPresentation,
} from './module-presentation';

const PRESENTATION: HotsiteModulePresentation = { surface: 'primary', padding: 'spacious' };

describe('withPresentation / splitPresentation', () => {
  it('folds the presentation into the buffer under the reserved key', () => {
    const folded = withPresentation({ title: 'T' }, PRESENTATION);

    expect(folded).toEqual({ title: 'T', [PRESENTATION_BUFFER_KEY]: PRESENTATION });
    expect(readPresentation(folded)).toBe(PRESENTATION);
  });

  it('splits it back out, leaving the module data without the key', () => {
    const { data, presentation } = splitPresentation({ title: 'T', presentation: PRESENTATION });

    expect(data).toEqual({ title: 'T' });
    expect(presentation).toBe(PRESENTATION);
  });

  it('round-trips: split(fold(data, p)) gives data and p back', () => {
    const data = { a: 1, b: [2] };

    expect(splitPresentation(withPresentation(data, PRESENTATION))).toEqual({
      data,
      presentation: PRESENTATION,
    });
  });

  it('removes the key when the presentation is undefined or empty', () => {
    expect(withPresentation({ title: 'T', presentation: PRESENTATION }, undefined)).toEqual({
      title: 'T',
    });
    expect(withPresentation({ title: 'T' }, {})).toEqual({ title: 'T' });
  });

  it('does not mutate its input', () => {
    const input = { title: 'T', presentation: PRESENTATION };

    withPresentation(input, undefined);
    splitPresentation(input);

    expect(input).toEqual({ title: 'T', presentation: PRESENTATION });
  });
});

describe('isPresentationEqual', () => {
  it('ignores key order and treats an empty presentation as none', () => {
    expect(
      isPresentationEqual(
        { surface: 'primary', padding: 'none' },
        { padding: 'none', surface: 'primary' },
      ),
    ).toBe(true);
    expect(isPresentationEqual({}, undefined)).toBe(true);
  });

  it('sees a nested difference', () => {
    const a: HotsiteModulePresentation = {
      overlay: { type: 'solid', color: '#000000', opacity: 0.4 },
    };
    const b: HotsiteModulePresentation = {
      overlay: { type: 'solid', color: '#000000', opacity: 0.5 },
    };

    expect(isPresentationEqual(a, b)).toBe(false);
  });

  it('is false when only one side has a presentation', () => {
    expect(isPresentationEqual(PRESENTATION, undefined)).toBe(false);
  });
});

describe('PRESENTATION_SUPPORT', () => {
  // Negative guarantee: NAVIGATION is page chrome and CHATBOT a floating widget — neither has a
  // section, so neither may be offered a presentation.
  it('has no entry for NAVIGATION or CHATBOT', () => {
    expect(PRESENTATION_SUPPORT.NAVIGATION).toBeUndefined();
    expect(PRESENTATION_SUPPORT.CHATBOT).toBeUndefined();
  });

  it('lets a FOOTER pick its surface only', () => {
    expect(PRESENTATION_SUPPORT.FOOTER).toBe('surface');
  });
});
