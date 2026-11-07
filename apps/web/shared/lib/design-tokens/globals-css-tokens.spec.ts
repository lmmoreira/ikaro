import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Why this spec exists: a token class like `bg-surface-app` only has CSS if `globals.css` defines
// the variable AND its `--color-*` alias in `@theme inline`. A missing alias makes Tailwind emit
// nothing, so the element renders transparent with no build, type, lint or jsdom failure.
const css = readFileSync(
  fileURLToPath(new URL('../../../app/globals.css', import.meta.url)),
  'utf8',
);

function block(source: string, opener: RegExp): Record<string, string> {
  const match = opener.exec(source);
  if (!match) throw new Error(`block not found: ${opener}`);
  const body = source.slice(match.index + match[0].length, source.indexOf('}', match.index));
  const declarations: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/(--[a-z-]+):\s*([^;]+);/g)) {
    declarations[name] = value.trim();
  }
  return declarations;
}

const root = block(css, /:root\s*\{/);
const theme = block(css, /@theme inline\s*\{/);

// Tailwind v4 palette steps (node_modules/tailwindcss/theme.css), named by what they are.
const GRAY_200 = 'oklch(92.8% 0.006 264.531)';

// The tokens the product renders: retuned from the old slate hex values to the palette the
// components actually use (TD58 Story 7).
const RETUNED: Record<string, string> = {
  '--primary': 'oklch(54.6% 0.245 262.881)', // blue-600
  '--ring': 'oklch(62.3% 0.214 259.815)', // blue-500
  '--secondary': GRAY_200,
  '--muted': 'oklch(96.7% 0.003 264.542)', // gray-100
  '--muted-foreground': 'oklch(55.1% 0.027 264.364)', // gray-500
  '--accent': 'oklch(97% 0.014 254.604)', // blue-50
  '--accent-foreground': 'oklch(48.8% 0.243 264.376)', // blue-700
  '--destructive': 'oklch(57.7% 0.245 27.325)', // red-600
  '--border': GRAY_200,
  '--input': GRAY_200,
};

// `body` reads --foreground/--background and the tenant hotsite inherits `body`, so these must
// never move (a retune would shift tenant hotsite text).
const UNCHANGED: Record<string, string> = {
  '--background': '#ffffff',
  '--foreground': '#0f172a',
  '--card': '#ffffff',
  '--card-foreground': '#0f172a',
  '--popover': '#ffffff',
  '--popover-foreground': '#0f172a',
  '--primary-foreground': '#ffffff',
  '--secondary-foreground': '#0f172a',
  '--destructive-foreground': '#ffffff',
};

const ADDED: Record<string, string> = {
  '--surface-app': 'oklch(98.5% 0.002 247.839)', // gray-50
  '--sidebar': 'oklch(21% 0.034 264.665)', // gray-900
  '--subtle-foreground': 'oklch(70.7% 0.022 261.325)', // gray-400
  '--border-strong': 'oklch(87.2% 0.01 258.338)', // gray-300
  '--destructive-tint': 'oklch(97.1% 0.013 17.38)', // red-50
};

describe('app/globals.css design tokens', () => {
  it.each(Object.entries({ ...RETUNED, ...ADDED }))('defines %s as %s', (name, value) => {
    expect(root[name]).toBe(value);
  });

  it.each(Object.entries(UNCHANGED))(
    'keeps %s at %s (the hotsite inherits it via body)',
    (name, value) => {
      expect(root[name]).toBe(value);
    },
  );

  it.each(Object.keys({ ...RETUNED, ...UNCHANGED, ...ADDED }))(
    'aliases %s as a Tailwind colour',
    (name) => {
      const alias = `--color-${name.slice(2)}`;
      expect(theme[alias]).toBe(`var(${name})`);
    },
  );

  it('keeps body reading the unchanged foreground and background tokens', () => {
    const body = /body\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(body).toContain('background: var(--background)');
    expect(body).toContain('color: var(--foreground)');
  });
});
