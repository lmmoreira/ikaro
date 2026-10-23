import { ServiceBuilder } from '../../../test/builders/booking/index';
import { Service } from './service.aggregate';
import { ServicePublicProfile } from './service-public-profile.vo';
import { ServicePublicSlug } from './service-public-slug.vo';
import { Money } from '../../../shared/value-objects/money';

const TENANT = '10000000-0000-4000-8000-000000000001';

describe('Service — public page (TD56-S03)', () => {
  it('starts unpublished with no slug and no profile', () => {
    const service = Service.create({
      tenantId: TENANT,
      name: 'Massagem',
      price: Money.from(100, 'BRL'),
      durationMinutes: 60,
      loyaltyPointsValue: 5,
    });
    expect(service.publicPagePublished).toBe(false);
    expect(service.publicSlug).toBeNull();
    expect(service.publicProfile).toBeNull();
  });

  describe('publishPublicPage()', () => {
    it('publishes and fixes the slug on the first publish', () => {
      const service = new ServiceBuilder().withTenantId(TENANT).build();
      service.publishPublicPage(ServicePublicSlug.create('massagem'));
      expect(service.publicPagePublished).toBe(true);
      expect(service.publicSlug?.value).toBe('massagem');
    });

    it('keeps the existing slug on a later publish (the URL never changes)', () => {
      const service = new ServiceBuilder().withTenantId(TENANT).withPublicSlug('massagem').build();
      service.publishPublicPage(ServicePublicSlug.create('outra-coisa'));
      expect(service.publicSlug?.value).toBe('massagem');
    });

    it('works on an inactive service (the page can be prepared while the service is off)', () => {
      const service = new ServiceBuilder().withTenantId(TENANT).build();
      service.deactivate();
      expect(() => service.publishPublicPage(ServicePublicSlug.create('massagem'))).not.toThrow();
      expect(service.publicPagePublished).toBe(true);
    });
  });

  describe('unpublishPublicPage()', () => {
    it('unpublishes but keeps the slug and the profile, so republishing restores the same page', () => {
      const profile = ServicePublicProfile.create({ longDescription: 'Texto' });
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withPublicSlug('massagem')
        .withPublicProfile(profile)
        .withPublicPagePublished(true)
        .build();

      service.unpublishPublicPage();

      expect(service.publicPagePublished).toBe(false);
      expect(service.publicSlug?.value).toBe('massagem');
      expect(service.publicProfile?.longDescription).toBe('Texto');
    });
  });

  describe('setPublicProfile()', () => {
    it('stores the profile and clears it with null', () => {
      const service = new ServiceBuilder().withTenantId(TENANT).build();
      service.setPublicProfile(ServicePublicProfile.create({ inclusions: ['Chá'] }));
      expect(service.publicProfile?.inclusions).toEqual(['Chá']);

      service.setPublicProfile(null);
      expect(service.publicProfile).toBeNull();
    });
  });

  it('rename keeps the slug (a published URL stays stable)', () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT)
      .withName('Massagem')
      .withPublicSlug('massagem')
      .withPublicPagePublished(true)
      .build();

    service.update('Massagem Premium', null, Money.from(100, 'BRL'), 60, 5, false);

    expect(service.name).toBe('Massagem Premium');
    expect(service.publicSlug?.value).toBe('massagem');
  });
});
