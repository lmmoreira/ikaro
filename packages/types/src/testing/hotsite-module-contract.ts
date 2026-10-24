import type { HotsiteModuleType } from '../enums';

// Shared accept/reject fixtures for every hotsite module's `data` and for a module's
// `presentation`. Two independent schema sets validate these shapes — @ikaro/validation (backend and
// BFF, the request boundary) and apps/web's module-schemas.ts / presentation-schema.ts (the client
// mirror; apps/web never imports @ikaro/validation). Both specs run this same table and assert the
// same verdict, so a rule added to one and forgotten in the other fails a test instead of drifting.
//
// Only cases on which the two sets MUST agree belong here. Cross-field rules that need the whole
// layout (NAVIGATION first, a navigation target being enabled, which module types accept
// `presentation`) are owned by the backend aggregate and are not part of this table.

export interface HotsiteModuleContractCase {
  readonly name: string;
  readonly type: HotsiteModuleType;
  readonly data: unknown;
  readonly valid: boolean;
}

export interface HotsitePresentationContractCase {
  readonly name: string;
  readonly presentation: unknown;
  readonly valid: boolean;
}

const text = (length: number): string => 'x'.repeat(length);

const accept = (
  type: HotsiteModuleType,
  name: string,
  data: unknown,
): HotsiteModuleContractCase => ({ name: `${type}: ${name}`, type, data, valid: true });

const reject = (
  type: HotsiteModuleType,
  name: string,
  data: unknown,
): HotsiteModuleContractCase => ({ name: `${type}: ${name}`, type, data, valid: false });

const heroBase = { variant: 'centered', title: 'T', ctaLabel: 'Go', ctaTarget: 'booking-form' };
const serviceListBase = { showPrices: true, showPoints: true, layout: 'grid' };
const galleryBase = { images: [], layout: 'grid', maxVisible: 6 };
const testimonialsBase = { items: [], layout: 'grid' };
const aboutBase = { title: 'T', body: 'B', imagePosition: 'left' };
const contactBase = {
  showAddress: true,
  showPhone: true,
  showWhatsapp: true,
  showEmail: true,
  showMap: true,
};
const detailPageBase = {
  heroStyle: 'cover',
  galleryLayout: 'grid',
  showPrice: true,
  showDuration: true,
  showLoyaltyPoints: true,
};
const block = { title: 'Title' };

export const HOTSITE_MODULE_CONTRACT_CASES: readonly HotsiteModuleContractCase[] = [
  // NAVIGATION — new type, strict
  accept('NAVIGATION', 'no items', { items: [] }),
  accept('NAVIGATION', 'booking CTA', {
    items: [],
    cta: { label: 'Agendar', target: 'booking-form' },
  }),
  accept('NAVIGATION', 'lead CTA', { items: [], cta: { label: 'Começar', target: 'lead-form' } }),
  reject('NAVIGATION', 'unknown CTA target', {
    items: [],
    cta: { label: 'Go', target: 'contact' },
  }),
  reject('NAVIGATION', 'empty CTA label', {
    items: [],
    cta: { label: '', target: 'booking-form' },
  }),
  accept('NAVIGATION', 'two items', {
    items: [
      { label: 'Serviços', target: 'service-list' },
      { label: 'Contato', target: 'contact' },
    ],
  }),
  accept('NAVIGATION', 'six items (the maximum)', {
    items: ['service-list', 'gallery', 'testimonials', 'about', 'contact', 'contact'].map(
      (target) => ({ label: 'L', target }),
    ),
  }),
  accept('NAVIGATION', 'label of exactly 30 characters', {
    items: [{ label: text(30), target: 'about' }],
  }),
  reject('NAVIGATION', 'seven items', {
    items: Array.from({ length: 7 }, () => ({ label: 'L', target: 'about' })),
  }),
  reject('NAVIGATION', 'empty label', { items: [{ label: '', target: 'about' }] }),
  reject('NAVIGATION', 'label of 31 characters', {
    items: [{ label: text(31), target: 'about' }],
  }),
  reject('NAVIGATION', 'booking is never a navigation target', {
    items: [{ label: 'L', target: 'booking-form' }],
  }),
  reject('NAVIGATION', 'unknown target', { items: [{ label: 'L', target: 'pricing' }] }),
  reject('NAVIGATION', 'missing items', {}),
  reject('NAVIGATION', 'unknown key', { items: [], extra: true }),
  reject('NAVIGATION', 'unknown key on an item', {
    items: [{ label: 'L', target: 'about', href: '/x' }],
  }),

  // HERO
  accept('HERO', 'minimal', heroBase),
  accept('HERO', 'immersive variant', { ...heroBase, variant: 'immersive' }),
  accept('HERO', 'tolerates an unknown key', { ...heroBase, legacyFlag: 1 }),
  accept('HERO', 'null background image', { ...heroBase, backgroundImageUrl: null }),
  reject('HERO', 'missing ctaLabel', {
    variant: 'centered',
    title: 'T',
    ctaTarget: 'booking-form',
  }),
  reject('HERO', 'unknown variant', { ...heroBase, variant: 'zzz' }),
  reject('HERO', 'unknown ctaTarget', { ...heroBase, ctaTarget: 'pricing' }),
  reject('HERO', 'unknown rightPanel', { ...heroBase, rightPanel: 'video' }),

  // SERVICE_LIST
  accept('SERVICE_LIST', 'grid', serviceListBase),
  accept('SERVICE_LIST', 'numbered layout', { ...serviceListBase, layout: 'numbered' }),
  accept('SERVICE_LIST', 'feature-cards layout', { ...serviceListBase, layout: 'feature-cards' }),
  accept('SERVICE_LIST', 'three tinted cards', {
    ...serviceListBase,
    layout: 'feature-cards',
    cardColumns: 3,
    cardTone: 'tinted',
  }),
  accept('SERVICE_LIST', 'ruled cards', { ...serviceListBase, cardTone: 'ruled' }),
  reject('SERVICE_LIST', 'four columns', { ...serviceListBase, cardColumns: 4 }),
  reject('SERVICE_LIST', 'unknown card tone', { ...serviceListBase, cardTone: 'outline' }),
  accept('SERVICE_LIST', 'itemAction and itemCtaLabel', {
    ...serviceListBase,
    itemAction: 'details',
    itemCtaLabel: text(40),
  }),
  accept('SERVICE_LIST', 'detailPage with every field', {
    ...serviceListBase,
    detailPage: { ...detailPageBase, bookingCtaLabel: 'Reservar' },
  }),
  accept('SERVICE_LIST', 'tolerates an unknown key', { ...serviceListBase, legacyFlag: 1 }),
  reject('SERVICE_LIST', 'unknown layout', { ...serviceListBase, layout: 'zzz' }),
  reject('SERVICE_LIST', 'missing showPrices', { showPoints: true, layout: 'grid' }),
  reject('SERVICE_LIST', 'unknown itemAction', { ...serviceListBase, itemAction: 'popup' }),
  reject('SERVICE_LIST', 'itemCtaLabel of 41 characters', {
    ...serviceListBase,
    itemCtaLabel: text(41),
  }),
  reject('SERVICE_LIST', 'detailPage missing a required field', {
    ...serviceListBase,
    detailPage: { heroStyle: 'cover', galleryLayout: 'grid' },
  }),
  reject('SERVICE_LIST', 'detailPage with an unknown key', {
    ...serviceListBase,
    detailPage: { ...detailPageBase, showReviews: true },
  }),
  reject('SERVICE_LIST', 'detailPage unknown heroStyle', {
    ...serviceListBase,
    detailPage: { ...detailPageBase, heroStyle: 'full' },
  }),
  reject('SERVICE_LIST', 'detailPage bookingCtaLabel of 41 characters', {
    ...serviceListBase,
    detailPage: { ...detailPageBase, bookingCtaLabel: text(41) },
  }),

  // GALLERY
  accept('GALLERY', 'grid', galleryBase),
  accept('GALLERY', 'portfolio layout', { ...galleryBase, layout: 'portfolio' }),
  accept('GALLERY', 'an uploaded image', {
    ...galleryBase,
    images: [{ url: 'tenants/t/hotsite/gallery/a.jpg', source: 'upload' }],
  }),
  reject('GALLERY', 'unknown layout', { ...galleryBase, layout: 'zzz' }),
  reject('GALLERY', 'maxVisible of 0', { ...galleryBase, maxVisible: 0 }),
  reject('GALLERY', 'image with an unknown source', {
    ...galleryBase,
    images: [{ url: 'a.jpg', source: 'web' }],
  }),

  // TESTIMONIALS
  accept('TESTIMONIALS', 'grid', testimonialsBase),
  accept('TESTIMONIALS', 'empty title hides heading', { ...testimonialsBase, title: '' }),
  accept('TESTIMONIALS', 'editorial-quote layout', {
    ...testimonialsBase,
    layout: 'editorial-quote',
  }),
  accept('TESTIMONIALS', 'an item with a rating', {
    ...testimonialsBase,
    items: [{ authorName: 'A', text: 'T', rating: 5 }],
  }),
  reject('TESTIMONIALS', 'unknown layout', { ...testimonialsBase, layout: 'zzz' }),
  reject('TESTIMONIALS', 'rating of 6', {
    ...testimonialsBase,
    items: [{ authorName: 'A', text: 'T', rating: 6 }],
  }),
  reject('TESTIMONIALS', 'item without text', {
    ...testimonialsBase,
    items: [{ authorName: 'A' }],
  }),

  // BOOKING_CTA
  accept('BOOKING_CTA', 'minimal', { title: 'T', ctaLabel: 'Go' }),
  accept('BOOKING_CTA', 'immersive variant', { title: 'T', ctaLabel: 'Go', variant: 'immersive' }),
  reject('BOOKING_CTA', 'missing ctaLabel', { title: 'T' }),
  reject('BOOKING_CTA', 'carouselDays of 91', { title: 'T', ctaLabel: 'Go', carouselDays: 91 }),
  reject('BOOKING_CTA', 'unknown datePickerType', {
    title: 'T',
    ctaLabel: 'Go',
    datePickerType: 'list',
  }),

  // ABOUT
  accept('ABOUT', 'minimal', aboutBase),
  accept('ABOUT', 'editorial variant', { ...aboutBase, variant: 'editorial' }),
  accept('ABOUT', 'split variant', { ...aboutBase, variant: 'split' }),
  accept('ABOUT', 'bleed variant', { ...aboutBase, variant: 'bleed' }),
  reject('ABOUT', 'unknown variant', { ...aboutBase, variant: 'zzz' }),
  reject('ABOUT', 'missing imagePosition', { title: 'T', body: 'B' }),

  // CONTACT
  accept('CONTACT', 'minimal', contactBase),
  accept('CONTACT', 'icon-cards display style', { ...contactBase, displayStyle: 'icon-cards' }),
  reject('CONTACT', 'unknown displayStyle', { ...contactBase, displayStyle: 'zzz' }),
  reject('CONTACT', 'missing showMap', {
    showAddress: true,
    showPhone: true,
    showWhatsapp: true,
    showEmail: true,
  }),

  // FOOTER
  accept('FOOTER', 'empty', {}),
  accept('FOOTER', 'tagline', { tagline: 'T', showWhatsapp: false }),
  reject('FOOTER', 'showWhatsapp as a string', { showWhatsapp: 'yes' }),

  // CHATBOT
  accept('CHATBOT', 'empty', {}),
  accept('CHATBOT', 'inline variant', { variant: 'inline', accentColor: 'secondary' }),
  reject('CHATBOT', 'unknown variant', { variant: 'zzz' }),

  // LEAD_FORM
  accept('LEAD_FORM', 'minimal', { title: 'T', ctaLabel: 'Go' }),
  accept('LEAD_FORM', 'immersive variant', { title: 'T', ctaLabel: 'Go', variant: 'immersive' }),
  reject('LEAD_FORM', 'missing ctaLabel', { title: 'T' }),
  reject('LEAD_FORM', 'unknown bgStyle', { title: 'T', ctaLabel: 'Go', bgStyle: 'zzz' }),

  // CONTENT_BLOCK — new type, closed variant union, every variant strict
  accept('CONTENT_BLOCK', 'trust-grid', {
    ...block,
    variant: 'trust-grid',
    items: [{ label: 'A' }, { label: 'B', description: 'D' }],
  }),
  accept('CONTENT_BLOCK', 'numbered tiles', {
    ...block,
    variant: 'trust-grid',
    appearance: 'tiles',
    items: [{ label: 'A' }, { label: 'B' }],
  }),
  reject('CONTENT_BLOCK', 'unknown trust-grid appearance', {
    ...block,
    variant: 'trust-grid',
    appearance: 'cards',
    items: [{ label: 'A' }, { label: 'B' }],
  }),
  accept('CONTENT_BLOCK', 'process-steps', {
    ...block,
    variant: 'process-steps',
    items: [
      { title: 'One', body: 'First' },
      { title: 'Two', body: 'Second' },
    ],
  }),
  accept('CONTENT_BLOCK', 'ruled process with labels', {
    ...block,
    variant: 'process-steps',
    appearance: 'ruled',
    items: [
      { title: 'One', body: 'First', label: 'Escuta' },
      { title: 'Two', body: 'Second' },
    ],
  }),
  reject('CONTENT_BLOCK', 'unknown process appearance', {
    ...block,
    variant: 'process-steps',
    appearance: 'tiles',
    items: [
      { title: 'One', body: 'First' },
      { title: 'Two', body: 'Second' },
    ],
  }),
  accept('CONTENT_BLOCK', 'collage-callout', {
    ...block,
    variant: 'collage-callout',
    images: [{ url: 'tenants/t/hotsite/content-block/a.jpg' }, { url: 'b.jpg', alt: '' }],
  }),
  accept('CONTENT_BLOCK', 'technical-callout without facts', {
    ...block,
    variant: 'technical-callout',
  }),
  accept('CONTENT_BLOCK', 'technical kicker', {
    ...block,
    variant: 'technical-callout',
    factsPlacement: 'kicker',
    facts: [{ value: '01', label: 'Proteção' }],
  }),
  reject('CONTENT_BLOCK', 'unknown facts placement', {
    ...block,
    variant: 'technical-callout',
    factsPlacement: 'below',
  }),
  accept('CONTENT_BLOCK', 'technical-callout with four facts', {
    ...block,
    variant: 'technical-callout',
    facts: Array.from({ length: 4 }, () => ({ value: '12', label: 'Anos' })),
  }),
  accept('CONTENT_BLOCK', 'image-statement', { ...block, variant: 'image-statement' }),
  accept('CONTENT_BLOCK', 'immersive-statement with every common field', {
    variant: 'immersive-statement',
    title: text(120),
    eyebrow: text(60),
    body: text(1000),
    align: 'right',
    cta: { label: text(40), target: 'service-list' },
  }),
  reject('CONTENT_BLOCK', 'unknown variant', { ...block, variant: 'zzz' }),
  reject('CONTENT_BLOCK', 'missing variant', block),
  reject('CONTENT_BLOCK', 'missing title', { variant: 'image-statement' }),
  reject('CONTENT_BLOCK', 'title of 121 characters', {
    variant: 'image-statement',
    title: text(121),
  }),
  reject('CONTENT_BLOCK', 'eyebrow of 61 characters', {
    ...block,
    variant: 'image-statement',
    eyebrow: text(61),
  }),
  reject('CONTENT_BLOCK', 'body of 1001 characters', {
    ...block,
    variant: 'image-statement',
    body: text(1001),
  }),
  reject('CONTENT_BLOCK', 'unknown align', { ...block, variant: 'image-statement', align: 'top' }),
  reject('CONTENT_BLOCK', 'unknown key', { ...block, variant: 'image-statement', extra: 1 }),
  reject('CONTENT_BLOCK', 'cta with an unknown target', {
    ...block,
    variant: 'image-statement',
    cta: { label: 'Go', target: 'pricing' },
  }),
  reject('CONTENT_BLOCK', 'cta label of 41 characters', {
    ...block,
    variant: 'image-statement',
    cta: { label: text(41), target: 'about' },
  }),
  reject('CONTENT_BLOCK', 'trust-grid with one item', {
    ...block,
    variant: 'trust-grid',
    items: [{ label: 'A' }],
  }),
  reject('CONTENT_BLOCK', 'trust-grid with seven items', {
    ...block,
    variant: 'trust-grid',
    items: Array.from({ length: 7 }, () => ({ label: 'A' })),
  }),
  reject('CONTENT_BLOCK', 'trust-grid item description of 141 characters', {
    ...block,
    variant: 'trust-grid',
    items: [{ label: 'A' }, { label: 'B', description: text(141) }],
  }),
  reject('CONTENT_BLOCK', 'trust-grid without items', { ...block, variant: 'trust-grid' }),
  reject('CONTENT_BLOCK', 'process-steps item body of 241 characters', {
    ...block,
    variant: 'process-steps',
    items: [
      { title: 'One', body: text(241) },
      { title: 'Two', body: 'Second' },
    ],
  }),
  reject('CONTENT_BLOCK', 'process-steps with a stored number', {
    ...block,
    variant: 'process-steps',
    items: [
      { title: 'One', body: 'First', number: 1 },
      { title: 'Two', body: 'Second' },
    ],
  }),
  reject('CONTENT_BLOCK', 'collage-callout with one image', {
    ...block,
    variant: 'collage-callout',
    images: [{ url: 'a.jpg' }],
  }),
  reject('CONTENT_BLOCK', 'collage-callout with five images', {
    ...block,
    variant: 'collage-callout',
    images: Array.from({ length: 5 }, () => ({ url: 'a.jpg' })),
  }),
  reject('CONTENT_BLOCK', 'collage-callout image with an empty url', {
    ...block,
    variant: 'collage-callout',
    images: [{ url: '' }, { url: 'b.jpg' }],
  }),
  reject('CONTENT_BLOCK', 'collage-callout alt of 121 characters', {
    ...block,
    variant: 'collage-callout',
    images: [{ url: 'a.jpg', alt: text(121) }, { url: 'b.jpg' }],
  }),
  reject('CONTENT_BLOCK', 'technical-callout with five facts', {
    ...block,
    variant: 'technical-callout',
    facts: Array.from({ length: 5 }, () => ({ value: '1', label: 'L' })),
  }),
  reject('CONTENT_BLOCK', 'technical-callout fact value of 21 characters', {
    ...block,
    variant: 'technical-callout',
    facts: [{ value: text(21), label: 'L' }],
  }),
  reject('CONTENT_BLOCK', 'image-statement with another variant’s items', {
    ...block,
    variant: 'image-statement',
    items: [{ label: 'A' }, { label: 'B' }],
  }),
];

const presentationAccept = (
  name: string,
  presentation: unknown,
): HotsitePresentationContractCase => ({ name, presentation, valid: true });

const presentationReject = (
  name: string,
  presentation: unknown,
): HotsitePresentationContractCase => ({ name, presentation, valid: false });

const gradient = {
  type: 'linear-gradient',
  direction: 'to-right',
  fromColor: '#090909',
  fromOpacity: 0.9,
  toColor: '#090909',
  toOpacity: 0.1,
};

export const HOTSITE_PRESENTATION_CONTRACT_CASES: readonly HotsitePresentationContractCase[] = [
  presentationAccept('empty object', {}),
  presentationAccept('every simple field', {
    surface: 'primary',
    contentWidth: 'wide',
    minHeight: 'viewport',
    padding: 'spacious',
  }),
  presentationAccept('custom surface with a customColor', {
    surface: 'custom',
    customColor: '#0B0908',
  }),
  presentationAccept('background with an image and a focal position', {
    background: { imageUrl: 'tenants/t/hotsite/section-background/a.jpg', position: 'right' },
  }),
  presentationAccept('background without an image', { background: { imageUrl: null } }),
  presentationAccept('overlay none', { overlay: { type: 'none' } }),
  presentationAccept('overlay solid', {
    overlay: { type: 'solid', color: '#18352E', opacity: 0.84 },
  }),
  presentationAccept('overlay linear-gradient', { overlay: gradient }),
  presentationAccept('overlay opacity at both bounds', {
    overlay: { type: 'solid', color: '#000000', opacity: 0 },
  }),
  presentationReject('unknown surface', { surface: 'neon' }),
  presentationReject('custom surface without a customColor', { surface: 'custom' }),
  presentationReject('customColor with a non-custom surface', {
    surface: 'primary',
    customColor: '#0B0908',
  }),
  presentationReject('customColor without a surface', { customColor: '#0B0908' }),
  presentationReject('customColor that is not #RRGGBB', {
    surface: 'custom',
    customColor: 'red',
  }),
  presentationReject('three-digit hex customColor', { surface: 'custom', customColor: '#fff' }),
  presentationReject('unknown contentWidth', { contentWidth: 'huge' }),
  presentationReject('unknown minHeight', { minHeight: 'tall' }),
  presentationReject('unknown padding', { padding: 'giant' }),
  presentationReject('unknown key', { surface: 'primary', zIndex: 3 }),
  presentationReject('background with an unknown focal position', {
    background: { imageUrl: null, position: 'top' },
  }),
  presentationReject('background with an unknown key', {
    background: { imageUrl: null, overlay: { type: 'none' } },
  }),
  presentationReject('overlay with an unknown type', { overlay: { type: 'blur' } }),
  presentationReject('overlay none carrying irrelevant fields', {
    overlay: { type: 'none', color: '#000000' },
  }),
  presentationReject('overlay solid carrying a direction', {
    overlay: { type: 'solid', color: '#000000', opacity: 0.5, direction: 'to-right' },
  }),
  presentationReject('overlay solid with opacity above 1', {
    overlay: { type: 'solid', color: '#000000', opacity: 1.5 },
  }),
  presentationReject('overlay solid with negative opacity', {
    overlay: { type: 'solid', color: '#000000', opacity: -0.1 },
  }),
  presentationReject('overlay solid with a non-hex color', {
    overlay: { type: 'solid', color: 'black', opacity: 0.5 },
  }),
  presentationReject('overlay gradient missing toColor', {
    overlay: { ...gradient, toColor: undefined },
  }),
  presentationReject('overlay gradient with an unknown direction', {
    overlay: { ...gradient, direction: 'diagonal' },
  }),
  presentationReject('overlay gradient with opacity above 1', {
    overlay: { ...gradient, fromOpacity: 2 },
  }),
];

// ─── Image-bearing fields ────────────────────────────────────────────────────

// Every place a hotsite layout module can hold an image path. The backend walkers
// (HotsiteImagePathsService.collect/mapPaths, HotsiteImageUrlResolver) and their apps/web mirrors
// (mapHotsiteImageFields, stripResolvedImageUrls, resolveDraftImageUrls) must all visit exactly
// these paths — a field one walker misses is either never promoted from tmp/, never resolved to a
// URL, or never stripped back to a path on save. Both specs run this one table.
export interface HotsiteImageSlotCase {
  readonly name: string;
  readonly module: {
    readonly type: HotsiteModuleType;
    readonly enabled: boolean;
    readonly data: Record<string, unknown>;
    readonly presentation?: Record<string, unknown>;
  };
  /** The image paths the module holds, in the order the walkers report them. */
  readonly paths: readonly string[];
}

const img = (slot: string): string => `tenants/t1/hotsite/${slot}/u1/${slot}.jpg`;

const heroData = { variant: 'centered', title: 'T', ctaLabel: 'Go', ctaTarget: 'booking-form' };

export const HOTSITE_IMAGE_SLOT_CASES: readonly HotsiteImageSlotCase[] = [
  {
    name: 'HERO data.backgroundImageUrl',
    module: {
      type: 'HERO',
      enabled: true,
      data: { ...heroData, backgroundImageUrl: img('hero') },
    },
    paths: [img('hero')],
  },
  {
    name: 'ABOUT data.imageUrl',
    module: {
      type: 'ABOUT',
      enabled: true,
      data: { title: 'T', body: 'B', imagePosition: 'left', imageUrl: img('about') },
    },
    paths: [img('about')],
  },
  {
    name: 'BOOKING_CTA data.backgroundImageUrl',
    module: {
      type: 'BOOKING_CTA',
      enabled: true,
      data: { title: 'T', ctaLabel: 'Go', backgroundImageUrl: img('booking-cta') },
    },
    paths: [img('booking-cta')],
  },
  {
    name: 'LEAD_FORM data.backgroundImageUrl',
    module: {
      type: 'LEAD_FORM',
      enabled: true,
      data: { title: 'T', ctaLabel: 'Go', backgroundImageUrl: img('lead-form') },
    },
    paths: [img('lead-form')],
  },
  {
    name: 'GALLERY data.images[].url',
    module: {
      type: 'GALLERY',
      enabled: true,
      data: {
        layout: 'grid',
        maxVisible: 6,
        images: [
          { url: img('gallery-a'), source: 'upload' },
          { url: img('gallery-b'), source: 'booking' },
        ],
      },
    },
    paths: [img('gallery-a'), img('gallery-b')],
  },
  {
    name: 'TESTIMONIALS data.items[].avatarUrl',
    module: {
      type: 'TESTIMONIALS',
      enabled: true,
      data: {
        layout: 'grid',
        items: [
          { authorName: 'A', text: 'T', avatarUrl: img('avatar-a') },
          { authorName: 'B', text: 'T' },
        ],
      },
    },
    paths: [img('avatar-a')],
  },
  {
    name: 'CONTENT_BLOCK collage-callout data.images[].url',
    module: {
      type: 'CONTENT_BLOCK',
      enabled: true,
      data: {
        variant: 'collage-callout',
        title: 'T',
        images: [{ url: img('collage-a') }, { url: img('collage-b'), alt: 'B' }],
      },
    },
    paths: [img('collage-a'), img('collage-b')],
  },
  {
    name: 'ABOUT presentation.background.imageUrl',
    module: {
      type: 'ABOUT',
      enabled: true,
      data: { title: 'T', body: 'B', imagePosition: 'left' },
      presentation: { background: { imageUrl: img('section-background'), position: 'left' } },
    },
    paths: [img('section-background')],
  },
  {
    name: 'CONTENT_BLOCK presentation.background.imageUrl',
    module: {
      type: 'CONTENT_BLOCK',
      enabled: true,
      data: { variant: 'image-statement', title: 'T' },
      presentation: { background: { imageUrl: img('content-background') } },
    },
    paths: [img('content-background')],
  },
  {
    name: 'a module with its own image and a presentation overlay but no background',
    module: {
      type: 'HERO',
      enabled: true,
      data: { ...heroData, variant: 'immersive', backgroundImageUrl: img('hero-overlay') },
      presentation: { overlay: { type: 'solid', color: '#000000', opacity: 0.4 } },
    },
    paths: [img('hero-overlay')],
  },
  {
    name: 'a presentation background without an image (null) holds nothing',
    module: {
      type: 'GALLERY',
      enabled: true,
      data: { layout: 'grid', maxVisible: 6, images: [] },
      presentation: { background: { imageUrl: null } },
    },
    paths: [],
  },
  {
    name: 'NAVIGATION holds no image',
    module: { type: 'NAVIGATION', enabled: true, data: { items: [] } },
    paths: [],
  },
];
