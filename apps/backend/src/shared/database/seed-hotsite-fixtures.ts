// The hotsite rows `seed.ts` writes for the three seeded tenants. Held here as plain data (not
// inline JSON strings inside the seed script) so a spec can run them through the same request
// schemas the API enforces — the legacy-layout audit in hotsite-legacy-layouts.audit.spec.ts
// a stored layout that violates the schema is rejected on its next save.
export const SEED_HOTSITE_BASE_BRANDING = {
  secondaryColor: '#eff6ff',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  headingFontFamily: 'Inter, sans-serif',
  bodyFontFamily: 'Inter, sans-serif',
  logoUrl: '',
  borderRadius: 'rounded',
  buttonStyle: 'filled',
  spacing: 'comfortable',
  shadowStyle: 'subtle',
};

export const SEED_HOTSITE_BRANDING_OVERRIDES = {
  ikaro: { primaryColor: '#6366F1' },
  tenantA: { primaryColor: '#0055A4' },
  tenantB: { primaryColor: '#C8102E' },
} as const;

export const SEED_HOTSITE_LAYOUT_IKARO = [
  {
    type: 'HERO',
    enabled: true,
    data: {
      variant: 'centered',
      title: 'Book your service in a few clicks',
      ctaLabel: 'Book now',
      ctaTarget: 'booking-form',
    },
  },
  {
    type: 'SERVICE_LIST',
    enabled: true,
    data: { showPrices: true, showPoints: true, layout: 'grid' },
  },
  {
    type: 'BOOKING_CTA',
    enabled: true,
    data: { title: 'Book your appointment', ctaLabel: 'Book now' },
  },
];

export const SEED_HOTSITE_LAYOUT_A = [
  {
    type: 'HERO',
    enabled: true,
    data: {
      variant: 'centered',
      title: 'Cuidado completo para o seu carro',
      ctaLabel: 'Agendar agora',
      ctaTarget: 'booking-form',
    },
  },
  {
    type: 'SERVICE_LIST',
    enabled: true,
    data: { showPrices: true, showPoints: true, layout: 'grid' },
  },
  {
    type: 'BOOKING_CTA',
    enabled: true,
    data: { title: 'Agende seu horário', ctaLabel: 'Agendar agora' },
  },
];

export const SEED_HOTSITE_LAYOUT_B = [
  {
    type: 'HERO',
    enabled: true,
    data: {
      variant: 'centered',
      title: 'Seu carro impecável',
      ctaLabel: 'Agendar agora',
      ctaTarget: 'booking-form',
    },
  },
  {
    type: 'SERVICE_LIST',
    enabled: true,
    data: { showPrices: true, showPoints: true, layout: 'grid' },
  },
];
