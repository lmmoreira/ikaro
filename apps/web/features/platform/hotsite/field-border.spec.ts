import { describe, expect, it } from 'vitest';
import { contrastRatio, mixHex } from './color-math';
import { deriveFieldBorder } from './field-border';

const MIN = 3;
const STEPS = 20;

function lowerRatio(color: string, page: string, fill: string): number {
  return Math.min(contrastRatio(color, page), contrastRatio(color, fill));
}

function path(from: string, towards: string): string[] {
  return Array.from({ length: STEPS + 1 }, (_, step) => mixHex(from, towards, step / STEPS));
}

describe('deriveFieldBorder', () => {
  it('walks from the page colour towards the text colour and stops at the first step that reaches 3:1 over both surfaces', () => {
    const page = '#FFFFFF';
    const fill = '#EFF6FF';
    const text = '#111827';

    const border = deriveFieldBorder(page, fill, text);
    const steps = path(page, text);
    const index = steps.indexOf(border);

    expect(index).toBeGreaterThan(0);
    expect(lowerRatio(border, page, fill)).toBeGreaterThanOrEqual(MIN);
    for (const earlier of steps.slice(0, index)) {
      expect(lowerRatio(earlier, page, fill)).toBeLessThan(MIN);
    }
  });

  it('keeps a tint of the tenant palette whenever the text path works', () => {
    const border = deriveFieldBorder('#F6F1E7', '#EEE6D6', '#26372F');

    expect(path('#F6F1E7', '#26372F')).toContain(border);
  });

  it.each([
    ['white text on a cream page', '#F6F1E7', '#FFFFFF', '#FFFFFF'],
    ['text equal to a mid-grey secondary', '#F6F1E7', '#777777', '#777777'],
    ['near-white text on a cream secondary', '#F6F1E7', '#FEF3C7', '#FDE68A'],
  ])(
    'falls back to black or white when the text path cannot work: %s',
    (_name, page, fill, text) => {
      const border = deriveFieldBorder(page, fill, text);

      expect(lowerRatio(border, page, fill)).toBeGreaterThanOrEqual(MIN);
      // The negative guarantee: the text path alone cannot reach 3:1 here, so the result is not on it.
      expect(path(page, text).some((step) => lowerRatio(step, page, fill) >= MIN)).toBe(false);
    },
  );

  it('returns the best step of all three paths when none reaches 3:1', () => {
    // A black page over a mid-light secondary: the grey that clears both surfaces falls between steps.
    const page = '#000000';
    const fill = '#A0A0A0';
    const text = '#FFFFFF';

    const border = deriveFieldBorder(page, fill, text);
    const everyStep = [text, '#000000', '#FFFFFF'].flatMap((end) => path(page, end));
    const best = Math.max(...everyStep.map((step) => lowerRatio(step, page, fill)));

    expect(best).toBeLessThan(MIN);
    expect(lowerRatio(border, page, fill)).toBe(best);
  });

  it('is deterministic', () => {
    expect(deriveFieldBorder('#F6F1E7', '#777777', '#777777')).toBe(
      deriveFieldBorder('#F6F1E7', '#777777', '#777777'),
    );
  });
});
