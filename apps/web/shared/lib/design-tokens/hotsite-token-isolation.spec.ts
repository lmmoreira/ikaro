import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The tenant hotsite is painted by `--ba-*` branding, never by the app's semantic tokens
// (`app/globals.css`). Retuning a token must therefore never move a hotsite pixel. This spec keeps
// that true: no file in the branded tree may use a token utility class, and the only `ui/`
// primitives it may import are the ones listed below, each with the reason it is allowed.
const WEB_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function featureDirs(suffix: string): string[] {
  return readdirSync(join(WEB_ROOT, 'features'))
    .map((feature) => join('features', feature, suffix))
    .filter((dir) => {
      try {
        return statSync(join(WEB_ROOT, dir)).isDirectory();
      } catch {
        return false;
      }
    });
}

const BRANDED_ROOTS = [
  'app/[slug]',
  'shells/hotsite',
  'features/platform/hotsite',
  'shared/components/hotsite',
  ...featureDirs('components/public'),
];

function sourceFiles(dir: string): string[] {
  const absolute = join(WEB_ROOT, dir);
  return readdirSync(absolute).flatMap((entry) => {
    const path = join(absolute, entry);
    if (statSync(path).isDirectory()) return sourceFiles(relative(WEB_ROOT, path));
    return /\.(ts|tsx)$/.test(entry) && !/\.spec\.tsx?$/.test(entry)
      ? [relative(WEB_ROOT, path)]
      : [];
  });
}

const TOKEN_UTILITY =
  /(?<![\w-])(?:bg|text|border|ring|divide|fill|stroke|placeholder|outline|from|to|via|shadow|caret|accent)-(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring|subtle|surface-app|sidebar)(?:-foreground|-strong|-tint)?(?![\w-])/;

const UI_DIR = 'shared/components/ui';

// Every module specifier a source file loads: `from '…'`, a bare `import '…'`, `import('…')` and
// `require('…')`.
const MODULE_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])([^'"]+)\1/g;

// Resolves a specifier to a path under `apps/web` (`@/` is the web root alias, a relative one is
// resolved against the importing file), or null for a package import. Resolving first is what stops
// `../ui/button` or `../../shared/components/ui/select` from slipping past a check that only reads
// the `@/shared/components/ui/` spelling.
function resolveSpecifier(file: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return posix.normalize(specifier.slice(2));
  if (specifier.startsWith('.')) return posix.normalize(posix.join(posix.dirname(file), specifier));
  return null;
}

// The `ui/` primitives a file imports, whichever way it spells the path (`index` for the folder
// itself, which would pull in every primitive).
function uiPrimitivesImported(file: string, source: string): string[] {
  const primitives = new Set<string>();
  for (const match of source.matchAll(MODULE_SPECIFIER)) {
    const resolved = resolveSpecifier(file, match[2]);
    if (resolved === UI_DIR) primitives.add('index');
    else if (resolved?.startsWith(`${UI_DIR}/`)) {
      primitives.add(
        resolved
          .slice(UI_DIR.length + 1)
          .replace(/\.tsx?$/, '')
          .split('/')[0],
      );
    }
  }
  return [...primitives].sort();
}

// File -> the `ui/` primitives it may import. `AvailabilityAlertPickers` renders the fixed-palette
// SaaS pickers inside the public availability-alert form (it never followed `--ba-*`); the other
// two use `FeedbackMessage` only for their `dashboard` variant (the hotsite variant is branded).
const ALLOWED_UI_IMPORTS: Record<string, readonly string[]> = {
  'features/booking/components/public/AvailabilityAlertPickers.tsx': [
    'button',
    'calendar',
    'popover',
    'select',
    'time-picker',
  ],
  'features/booking/components/public/PickerLoadError.tsx': ['feedback-message'],
  'features/booking/components/public/AvailabilityCarousel.tsx': ['feedback-message'],
};

const files = BRANDED_ROOTS.flatMap(sourceFiles);

describe('tenant hotsite isolation from the app design tokens', () => {
  it('scans a non-trivial branded tree', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('uses no semantic-token utility class in any branded file', () => {
    const offenders = files.filter((file) =>
      TOKEN_UTILITY.test(readFileSync(join(WEB_ROOT, file), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('imports only the allow-listed ui primitives', () => {
    const unexpected = files.flatMap((file) => {
      const used = uiPrimitivesImported(file, readFileSync(join(WEB_ROOT, file), 'utf8'));
      const allowed = ALLOWED_UI_IMPORTS[file] ?? [];
      return used.filter((primitive) => !allowed.includes(primitive)).map((p) => `${file} -> ${p}`);
    });
    expect(unexpected).toEqual([]);
  });

  it('lists only allow-list entries that still exist and still import what they declare', () => {
    for (const [file, primitives] of Object.entries(ALLOWED_UI_IMPORTS)) {
      const source = readFileSync(join(WEB_ROOT, file), 'utf8');
      expect(uiPrimitivesImported(file, source)).toEqual([...primitives].sort());
    }
  });

  it('resolves every way of spelling a ui import (negative control)', () => {
    const file = 'features/booking/components/public/Example.tsx';
    expect(
      uiPrimitivesImported(file, `import { Button } from '@/shared/components/ui/button';`),
    ).toEqual(['button']);
    // A relative import reaches the same primitive.
    expect(
      uiPrimitivesImported(
        file,
        `import { Select } from '../../../../shared/components/ui/select';`,
      ),
    ).toEqual(['select']);
    expect(
      uiPrimitivesImported(
        'shared/components/hotsite/Example.tsx',
        `import { Input } from '../ui/input';`,
      ),
    ).toEqual(['input']);
    // A dynamic import, a `require`, a side-effect import and a folder import are all seen.
    expect(
      uiPrimitivesImported(file, `const m = await import('@/shared/components/ui/calendar');`),
    ).toEqual(['calendar']);
    expect(
      uiPrimitivesImported(file, `const m = require('@/shared/components/ui/popover.tsx');`),
    ).toEqual(['popover']);
    expect(uiPrimitivesImported(file, `import '@/shared/components/ui';`)).toEqual(['index']);
    // Other modules, packages and sibling hotsite components are not ui primitives.
    expect(
      uiPrimitivesImported(
        file,
        `import a from 'react'; import b from './local'; import c from '@/shared/components/hotsite/branded-feedback-message';`,
      ),
    ).toEqual([]);
  });

  it('detects a token class (negative control)', () => {
    expect(TOKEN_UTILITY.test('<div className="bg-primary text-foreground" />')).toBe(true);
    expect(TOKEN_UTILITY.test('<div className="border-border-strong" />')).toBe(true);
    expect(TOKEN_UTILITY.test('style={{ color: "var(--ba-primary)" }}')).toBe(false);
    expect(TOKEN_UTILITY.test('<div className="bg-gray-100 text-red-600" />')).toBe(false);
  });
});
