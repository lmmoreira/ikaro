import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  ContentBlockModuleDataSchema,
  HotsiteModulePresentationSchema,
  NavigationModuleDataSchema,
  type HotsiteModuleType,
} from '@ikaro/types';
import { PRESENTATION_SUPPORT } from './module-presentation';
import {
  AboutModuleDataSchema,
  BookingCtaModuleDataSchema,
  ChatbotModuleDataSchema,
  ContactModuleDataSchema,
  FooterModuleDataSchema,
  GalleryModuleDataSchema,
  HeroModuleDataSchema,
  LeadFormModuleDataSchema,
  ServiceListModuleDataSchema,
  TestimonialsModuleDataSchema,
} from './module-schemas';

// The guard against "editable only through the Manifesto tab": every key of every module's schema
// (and every option of its closed enums) must have a control in that module's panel. A new field
// added to a schema without one fails here, which is what stops a capability from shipping that a
// manager can only reach by editing JSON.
//
// The check reads the panel source rather than rendering it: it is cheap, needs no fixtures per
// module, and a control that exists always names its field in code. A key edited somewhere else
// (a sub-component, a different aggregate) goes in ALLOWED_ELSEWHERE with the reason.

const MODULES_DIR = '../components/hotsite/modules/';

function readSource(file: string): string {
  return readFileSync(fileURLToPath(new URL(`${MODULES_DIR}${file}`, import.meta.url)), 'utf8');
}

interface SchemaNode {
  readonly _zod: { readonly def: Record<string, unknown> };
}

type Fields = Map<string, Set<string>>;

// Every property name in a schema, wherever it is nested, with the string values of any closed
// enum or literal found under it. Property names are what a panel's source mentions.
function collectFields(schema: SchemaNode, key: string | null, fields: Fields): void {
  const def = schema._zod.def;
  const type = def.type as string;
  if (type === 'object') {
    for (const [name, child] of Object.entries(def.shape as Record<string, SchemaNode>)) {
      if (!fields.has(name)) fields.set(name, new Set());
      collectFields(child, name, fields);
    }
  } else if (type === 'optional' || type === 'nullable' || type === 'default') {
    collectFields(def.innerType as SchemaNode, key, fields);
  } else if (type === 'array') {
    collectFields(def.element as SchemaNode, key, fields);
  } else if (type === 'union') {
    for (const option of def.options as SchemaNode[]) collectFields(option, key, fields);
  } else if (type === 'enum' && key) {
    for (const value of Object.values(def.entries as Record<string, string>)) {
      fields.get(key)?.add(value);
    }
  } else if (type === 'literal' && key) {
    for (const value of def.values as unknown[]) {
      if (typeof value === 'string') fields.get(key)?.add(value);
    }
  }
}

function fieldsOf(schema: z.ZodType): Fields {
  const fields: Fields = new Map();
  collectFields(schema as unknown as SchemaNode, null, fields);
  return fields;
}

interface ModuleCase {
  readonly type: HotsiteModuleType;
  readonly schema: z.ZodType;
  // Every source file that together makes up this module's editing UI.
  readonly panels: readonly string[];
}

// Keys edited outside the module's own panel files, each with where and why. Empty today: every
// key has a control in the panel or a component it composes. An entry here is a deliberate,
// reviewed exception, never a way to silence the guard.
const ALLOWED_ELSEWHERE: Partial<Record<HotsiteModuleType, Readonly<Record<string, string>>>> = {};

const MODULE_CASES: readonly ModuleCase[] = [
  {
    type: 'NAVIGATION',
    schema: NavigationModuleDataSchema,
    // The target list the item picker renders.
    panels: [
      'NavigationConfigPanel.tsx',
      'NavigationItemRow.tsx',
      'NavigationCtaFields.tsx',
      '../../../hotsite/navigation-links.ts',
    ],
  },
  {
    type: 'CONTENT_BLOCK',
    schema: ContentBlockModuleDataSchema,
    panels: [
      'ContentBlockConfigPanel.tsx',
      'ContentBlockVariantFields.tsx',
      'ContentBlockListVariants.tsx',
      'ContentBlockMediaVariants.tsx',
      // The variant list the switcher renders.
      '../../../hotsite/content-block-variants.ts',
    ],
  },
  { type: 'HERO', schema: HeroModuleDataSchema, panels: ['HeroConfigPanel.tsx'] },
  {
    type: 'SERVICE_LIST',
    schema: ServiceListModuleDataSchema,
    panels: ['ServiceListConfigPanel.tsx', 'ServiceListActionFields.tsx'],
  },
  {
    type: 'GALLERY',
    schema: GalleryModuleDataSchema,
    // bookingId / photoType are written by the booking-photo picker the image manager opens.
    panels: ['GalleryConfigPanel.tsx', 'GalleryImageManager.tsx', 'BookingPhotoPicker.tsx'],
  },
  {
    type: 'TESTIMONIALS',
    schema: TestimonialsModuleDataSchema,
    panels: ['TestimonialsConfigPanel.tsx'],
  },
  {
    type: 'BOOKING_CTA',
    schema: BookingCtaModuleDataSchema,
    panels: ['BookingCtaConfigPanel.tsx'],
  },
  { type: 'ABOUT', schema: AboutModuleDataSchema, panels: ['AboutConfigPanel.tsx'] },
  { type: 'CONTACT', schema: ContactModuleDataSchema, panels: ['ContactConfigPanel.tsx'] },
  { type: 'FOOTER', schema: FooterModuleDataSchema, panels: ['FooterConfigPanel.tsx'] },
  { type: 'CHATBOT', schema: ChatbotModuleDataSchema, panels: ['ChatbotConfigPanel.tsx'] },
  {
    type: 'LEAD_FORM',
    schema: LeadFormModuleDataSchema,
    panels: ['LeadFormConfigPanel.tsx', 'LeadFormTeaserFields.tsx'],
  },
];

function uncontrolled(
  fields: Fields,
  source: string,
  elsewhere: Readonly<Record<string, string>> = {},
): string[] {
  const missing: string[] = [];
  for (const [name, values] of fields) {
    if (name in elsewhere) continue;
    if (!new RegExp(`\\b${name}\\b`).test(source)) missing.push(name);
    for (const value of values) {
      if (!source.includes(`'${value}'`) && !source.includes(`"${value}"`)) {
        missing.push(`${name}=${value}`);
      }
    }
  }
  return missing;
}

describe('module field coverage', () => {
  it.each(MODULE_CASES)('$type: every schema key and option has a control', (moduleCase) => {
    const source = moduleCase.panels.map(readSource).join('\n');

    expect(
      uncontrolled(fieldsOf(moduleCase.schema), source, ALLOWED_ELSEWHERE[moduleCase.type]),
    ).toEqual([]);
  });

  // Negative guarantee: an entry in the allow-list must name a schema key that exists, or the list
  // silently hides a renamed field.
  it('every allowed-elsewhere key exists in its module schema', () => {
    for (const moduleCase of MODULE_CASES) {
      const fields = fieldsOf(moduleCase.schema);
      const stale = Object.keys(ALLOWED_ELSEWHERE[moduleCase.type] ?? {}).filter(
        (key) => !fields.has(key),
      );

      expect(stale, moduleCase.type).toEqual([]);
    }
  });
});

describe('section presentation coverage', () => {
  it('SectionPresentationFields controls every presentation key and option', () => {
    const source = [
      'SectionPresentationFields.tsx',
      'SectionOverlayFields.tsx',
      'presentation-field-parts.tsx',
    ]
      .map(readSource)
      .join('\n');

    expect(uncontrolled(fieldsOf(HotsiteModulePresentationSchema), source)).toEqual([]);
  });

  // Every module that accepts a presentation mounts the control with its own type, and no other
  // module does.
  it.each(MODULE_CASES)('$type mounts SectionPresentationFields only if it accepts one', (c) => {
    const source = c.panels.map(readSource).join('\n');
    const mounted = source.includes(`<SectionPresentationFields`);

    expect(mounted).toBe(PRESENTATION_SUPPORT[c.type] !== undefined);
    if (mounted) expect(source).toContain(`moduleType="${c.type}"`);
  });

  it('a module with its own background image takes no presentation background', () => {
    const own = ['HERO', 'BOOKING_CTA', 'LEAD_FORM'] as const;

    for (const type of own) expect(PRESENTATION_SUPPORT[type]).toBe('section');
  });
});
