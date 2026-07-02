import { describe, expect, it } from 'vitest';
import {
  AboutModuleDataSchema,
  BookingCtaModuleDataSchema,
  ContactModuleDataSchema,
  GalleryModuleDataSchema,
  HeroModuleDataSchema,
  ServiceListModuleDataSchema,
  TestimonialsModuleDataSchema,
  isValidModuleData,
} from './module-schemas';

const validHeroData = {
  variant: 'centered',
  title: 'Bem-vindo à Lavacar',
  ctaLabel: 'Agendar agora',
  ctaTarget: 'booking-form',
};

const validServiceListData = {
  showPrices: true,
  showPoints: true,
  layout: 'grid',
};

const validGalleryData = {
  images: [{ url: 'https://storage.example.com/gallery/photo.jpg', source: 'upload' }],
  layout: 'grid',
  maxVisible: 6,
};

const validTestimonialsData = {
  items: [{ authorName: 'Maria Silva', text: 'Ótimo serviço!' }],
  layout: 'grid',
};

const validAboutData = {
  title: 'Sobre nós',
  body: 'Texto sobre a empresa.',
  imagePosition: 'right',
};

describe('HeroModuleDataSchema', () => {
  it('accepts the minimal required fields', () => {
    expect(HeroModuleDataSchema.safeParse(validHeroData).success).toBe(true);
  });

  it('accepts optional subtitle and backgroundImageUrl', () => {
    const result = HeroModuleDataSchema.safeParse({
      ...validHeroData,
      subtitle: 'O melhor serviço da cidade',
      backgroundImageUrl: 'https://storage.example.com/hero.jpg',
    });

    expect(result.success).toBe(true);
  });

  it('accepts optional eyebrow, secondaryCtaLabel, secondaryCtaTarget, rightPanel', () => {
    const result = HeroModuleDataSchema.safeParse({
      ...validHeroData,
      eyebrow: 'Estética premium',
      secondaryCtaLabel: 'Ver serviços',
      secondaryCtaTarget: 'service-list',
      rightPanel: 'brand-card',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid rightPanel value', () => {
    const result = HeroModuleDataSchema.safeParse({ ...validHeroData, rightPanel: 'video' });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid variant', () => {
    const result = HeroModuleDataSchema.safeParse({ ...validHeroData, variant: 'invalid' });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid ctaTarget', () => {
    const result = HeroModuleDataSchema.safeParse({ ...validHeroData, ctaTarget: 'invalid' });

    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = HeroModuleDataSchema.safeParse({
      variant: 'centered',
      ctaTarget: 'booking-form',
    });

    expect(result.success).toBe(false);
  });
});

describe('ServiceListModuleDataSchema', () => {
  it('accepts the required fields', () => {
    expect(ServiceListModuleDataSchema.safeParse(validServiceListData).success).toBe(true);
  });

  it('accepts an optional title', () => {
    const result = ServiceListModuleDataSchema.safeParse({
      ...validServiceListData,
      title: 'Nossos Serviços',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid layout', () => {
    const result = ServiceListModuleDataSchema.safeParse({
      ...validServiceListData,
      layout: 'invalid',
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = ServiceListModuleDataSchema.safeParse({ layout: 'grid' });

    expect(result.success).toBe(false);
  });
});

describe('GalleryModuleDataSchema', () => {
  it('accepts the required fields', () => {
    expect(GalleryModuleDataSchema.safeParse(validGalleryData).success).toBe(true);
  });

  it('accepts optional title and image fields', () => {
    const result = GalleryModuleDataSchema.safeParse({
      ...validGalleryData,
      title: 'Nossos Resultados',
      images: [
        {
          url: 'https://storage.example.com/gallery/photo.jpg',
          caption: 'Antes e depois',
          source: 'booking',
          bookingId: 'booking-123',
          photoType: 'after',
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid layout', () => {
    const result = GalleryModuleDataSchema.safeParse({ ...validGalleryData, layout: 'invalid' });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid photoType', () => {
    const result = GalleryModuleDataSchema.safeParse({
      ...validGalleryData,
      images: [
        {
          url: 'https://storage.example.com/gallery/photo.jpg',
          source: 'upload',
          photoType: 'during',
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = GalleryModuleDataSchema.safeParse({ images: [], layout: 'grid' });

    expect(result.success).toBe(false);
  });
});

describe('TestimonialsModuleDataSchema', () => {
  it('accepts the required fields', () => {
    expect(TestimonialsModuleDataSchema.safeParse(validTestimonialsData).success).toBe(true);
  });

  it('accepts optional title, rating and avatarUrl', () => {
    const result = TestimonialsModuleDataSchema.safeParse({
      ...validTestimonialsData,
      title: 'Avaliações',
      items: [
        {
          authorName: 'Maria Silva',
          text: 'Ótimo serviço!',
          rating: 5,
          avatarUrl: 'https://storage.example.com/avatars/maria.jpg',
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid layout', () => {
    const result = TestimonialsModuleDataSchema.safeParse({
      ...validTestimonialsData,
      layout: 'invalid',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an out-of-range rating', () => {
    const result = TestimonialsModuleDataSchema.safeParse({
      ...validTestimonialsData,
      items: [{ authorName: 'Maria Silva', text: 'Ótimo serviço!', rating: 6 }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = TestimonialsModuleDataSchema.safeParse({ items: [] });

    expect(result.success).toBe(false);
  });
});

describe('AboutModuleDataSchema', () => {
  it('accepts the required fields', () => {
    expect(AboutModuleDataSchema.safeParse(validAboutData).success).toBe(true);
  });

  it('accepts an optional imageUrl', () => {
    const result = AboutModuleDataSchema.safeParse({
      ...validAboutData,
      imageUrl: 'https://storage.example.com/about.jpg',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid imagePosition', () => {
    const result = AboutModuleDataSchema.safeParse({ ...validAboutData, imagePosition: 'top' });

    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = AboutModuleDataSchema.safeParse({ title: 'Sobre nós', imagePosition: 'right' });

    expect(result.success).toBe(false);
  });
});

const validBookingCtaData = {
  title: 'Agende seu serviço',
  ctaLabel: 'Agendar agora',
};

describe('BookingCtaModuleDataSchema', () => {
  it('accepts the minimal required fields without carouselDays', () => {
    expect(BookingCtaModuleDataSchema.safeParse(validBookingCtaData).success).toBe(true);
  });

  it('accepts a valid carouselDays value', () => {
    const result = BookingCtaModuleDataSchema.safeParse({
      ...validBookingCtaData,
      carouselDays: 30,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.carouselDays).toBe(30);
  });

  it('rejects carouselDays below 1', () => {
    const result = BookingCtaModuleDataSchema.safeParse({
      ...validBookingCtaData,
      carouselDays: 0,
    });

    expect(result.success).toBe(false);
  });

  it('rejects carouselDays above 90', () => {
    const result = BookingCtaModuleDataSchema.safeParse({
      ...validBookingCtaData,
      carouselDays: 91,
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = BookingCtaModuleDataSchema.safeParse({ ctaLabel: 'Agendar' });

    expect(result.success).toBe(false);
  });
});

const validContactData = {
  showAddress: true,
  showPhone: true,
  showWhatsapp: true,
  showEmail: false,
  showMap: false,
};

describe('ContactModuleDataSchema', () => {
  it('accepts the required fields', () => {
    expect(ContactModuleDataSchema.safeParse(validContactData).success).toBe(true);
  });

  it('accepts an optional title', () => {
    const result = ContactModuleDataSchema.safeParse({ ...validContactData, title: 'Contato' });

    expect(result.success).toBe(true);
  });

  it('rejects missing required boolean fields', () => {
    const result = ContactModuleDataSchema.safeParse({ showAddress: true, showPhone: true });

    expect(result.success).toBe(false);
  });

  it('rejects a non-boolean value for a show flag', () => {
    const result = ContactModuleDataSchema.safeParse({ ...validContactData, showMap: 'yes' });

    expect(result.success).toBe(false);
  });

  it('accepts optional displayStyle, showInstagram, showFacebook, whatsappCtaLabel', () => {
    const result = ContactModuleDataSchema.safeParse({
      ...validContactData,
      displayStyle: 'icon-cards',
      showInstagram: false,
      showFacebook: true,
      whatsappCtaLabel: 'Chamar no WhatsApp',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid displayStyle', () => {
    const result = ContactModuleDataSchema.safeParse({ ...validContactData, displayStyle: 'grid' });

    expect(result.success).toBe(false);
  });
});

describe('isValidModuleData', () => {
  it('returns true for valid HERO data', () => {
    expect(isValidModuleData('HERO', validHeroData)).toBe(true);
  });

  it('returns false for invalid HERO data', () => {
    expect(isValidModuleData('HERO', { variant: 'centered' })).toBe(false);
  });

  it('returns true for valid SERVICE_LIST data', () => {
    expect(isValidModuleData('SERVICE_LIST', validServiceListData)).toBe(true);
  });

  it('returns false for invalid SERVICE_LIST data', () => {
    expect(isValidModuleData('SERVICE_LIST', { layout: 'grid' })).toBe(false);
  });

  it('returns true for valid GALLERY data', () => {
    expect(isValidModuleData('GALLERY', validGalleryData)).toBe(true);
  });

  it('returns false for invalid GALLERY data', () => {
    expect(isValidModuleData('GALLERY', { images: [], layout: 'grid' })).toBe(false);
  });

  it('returns true for valid TESTIMONIALS data', () => {
    expect(isValidModuleData('TESTIMONIALS', validTestimonialsData)).toBe(true);
  });

  it('returns false for invalid TESTIMONIALS data', () => {
    expect(isValidModuleData('TESTIMONIALS', { items: [] })).toBe(false);
  });

  it('returns true for valid ABOUT data', () => {
    expect(isValidModuleData('ABOUT', validAboutData)).toBe(true);
  });

  it('returns false for invalid ABOUT data', () => {
    expect(isValidModuleData('ABOUT', { title: 'Sobre nós', imagePosition: 'right' })).toBe(false);
  });

  it('returns true for valid CONTACT data', () => {
    expect(
      isValidModuleData('CONTACT', {
        showAddress: true,
        showPhone: true,
        showWhatsapp: true,
        showEmail: false,
        showMap: false,
      }),
    ).toBe(true);
  });

  it('returns false for invalid CONTACT data', () => {
    expect(isValidModuleData('CONTACT', { showAddress: true })).toBe(false);
  });

  it('returns true for valid BOOKING_CTA data', () => {
    expect(isValidModuleData('BOOKING_CTA', validBookingCtaData)).toBe(true);
  });

  it('returns false for invalid BOOKING_CTA data', () => {
    expect(isValidModuleData('BOOKING_CTA', { ctaLabel: 'Agendar' })).toBe(false);
  });
});
