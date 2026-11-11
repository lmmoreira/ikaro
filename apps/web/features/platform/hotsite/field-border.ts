import { contrastRatio, mixHex } from './color-math';

// WCAG 1.4.11: the boundary of a control must reach 3:1 against what it sits on.
const MIN_BOUNDARY_CONTRAST = 3;
const FIELD_BORDER_STEPS = 20;

interface BorderCandidate {
  readonly color: string;
  readonly ratio: number;
}

// The first of 21 steps from `from` towards `towards` whose colour reaches 3:1 against both
// surfaces; with none, the step whose lower ratio is greatest.
function walkTowards(from: string, towards: string, surfaces: readonly string[]): BorderCandidate {
  let best: BorderCandidate = { color: from, ratio: 0 };
  for (let step = 0; step <= FIELD_BORDER_STEPS; step += 1) {
    const color = mixHex(from, towards, step / FIELD_BORDER_STEPS);
    const ratio = Math.min(...surfaces.map((surface) => contrastRatio(color, surface)));
    if (ratio >= MIN_BOUNDARY_CONTRAST) return { color, ratio };
    if (ratio > best.ratio) best = { color, ratio };
  }
  return best;
}

// Border of a branded form control: visible against the page and against the field's own
// fill, whatever the tenant palette. It walks from the page colour towards the text colour so the
// edge stays a tint of the tenant's own palette; only when no step on that path reaches 3:1 against
// both surfaces (text close to the page, or equal to the secondary colour) does it also try black
// and white and keep the best. Derived only: no editor field or stored value.
export function deriveFieldBorder(
  backgroundColor: string,
  secondaryColor: string,
  textColor: string,
): string {
  const surfaces = [backgroundColor, secondaryColor];
  const tinted = walkTowards(backgroundColor, textColor, surfaces);
  if (tinted.ratio >= MIN_BOUNDARY_CONTRAST) return tinted.color;
  const fallbacks = ['#000000', '#FFFFFF'].map((end) =>
    walkTowards(backgroundColor, end, surfaces),
  );
  return fallbacks.reduce((best, next) => (next.ratio > best.ratio ? next : best), tinted).color;
}
