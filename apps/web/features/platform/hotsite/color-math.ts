// Pure colour maths shared by the hotsite branding derivations (WCAG 2.1 contrast, sRGB blend).

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  return [
    Number.parseInt(normalized.substring(0, 2), 16),
    Number.parseInt(normalized.substring(2, 4), 16),
    Number.parseInt(normalized.substring(4, 6), 16),
  ];
}

function linearizeChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

// WCAG 2.1 relative luminance: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function channelToHex(channel: number): string {
  return Math.round(channel).toString(16).padStart(2, '0');
}

// Linear blend in sRGB: `amount` of `towards` over `base` — deterministic hex, no color-mix().
export function mixHex(base: string, towards: string, amount: number): string {
  const [br, bg, bb] = hexToRgb(base);
  const [tr, tg, tb] = hexToRgb(towards);
  const mix = (from: number, to: number): string => channelToHex(from + (to - from) * amount);
  return `#${mix(br, tr)}${mix(bg, tg)}${mix(bb, tb)}`.toUpperCase();
}
