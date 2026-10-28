import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { ServicePublicProfile } from '../../domain/service-public-profile.vo';
import { resolveBookingPolicyResult, toServiceResult } from './service-result.mapper';

const TENANT_WINDOW = { minBookingAdvanceHours: 2, maxBookingAdvanceDays: 90 };

describe('resolveBookingPolicyResult', () => {
  it('carries the tenant window when the service sets no override', () => {
    const service = new ServiceBuilder().build();

    expect(resolveBookingPolicyResult(service, false, TENANT_WINDOW)).toMatchObject({
      effectiveMinBookingAdvanceHours: 2,
      effectiveMaxBookingAdvanceDays: 90,
    });
  });

  it('narrows the window to a tighter service override', () => {
    const service = new ServiceBuilder()
      .withBookingPolicy({ minBookingAdvanceHoursOverride: 24, maxBookingAdvanceDaysOverride: 30 })
      .build();

    expect(resolveBookingPolicyResult(service, false, TENANT_WINDOW)).toMatchObject({
      effectiveMinBookingAdvanceHours: 24,
      effectiveMaxBookingAdvanceDays: 30,
    });
  });

  it('clamps a stale override that is looser than the tenant window', () => {
    const service = new ServiceBuilder()
      .withBookingPolicy({ minBookingAdvanceHoursOverride: 0, maxBookingAdvanceDaysOverride: 365 })
      .build();

    expect(resolveBookingPolicyResult(service, false, TENANT_WINDOW)).toMatchObject({
      effectiveMinBookingAdvanceHours: 2,
      effectiveMaxBookingAdvanceDays: 90,
    });
  });

  it('keeps the raw overrides and still resolves the inherited approval mode', () => {
    const service = new ServiceBuilder()
      .withBookingPolicy({ maxBookingAdvanceDaysOverride: 30 })
      .build();

    expect(resolveBookingPolicyResult(service, true, TENANT_WINDOW)).toMatchObject({
      maxBookingAdvanceDaysOverride: 30,
      defaultApprovalMode: 'AUTO_CONFIRM',
    });
  });
});

describe('toServiceResult', () => {
  it('puts the effective window on the result policy', () => {
    const service = new ServiceBuilder()
      .withBookingPolicy({ maxBookingAdvanceDaysOverride: 14 })
      .build();

    expect(
      toServiceResult(service, 'pt-BR', false, TENANT_WINDOW, 60, (path) => path).bookingPolicy,
    ).toMatchObject({
      effectiveMinBookingAdvanceHours: 2,
      effectiveMaxBookingAdvanceDays: 14,
    });
  });

  describe('public profile', () => {
    const resolveUrl = (path: string) => `https://img.example.test/${path}`;

    it('resolves the stored image paths through the given callback', () => {
      const path = 'tenants/t1/hotsite/service-profile/u1/cover.webp';
      const service = new ServiceBuilder()
        .withPublicProfile(ServicePublicProfile.create({ coverImageUrl: path }))
        .build();

      const result = toServiceResult(service, 'pt-BR', false, TENANT_WINDOW, 60, resolveUrl);

      expect(result.publicProfile?.coverImageUrl).toBe(resolveUrl(path));
    });

    it('keeps a service without a profile at null', () => {
      const result = toServiceResult(
        new ServiceBuilder().build(),
        'pt-BR',
        false,
        TENANT_WINDOW,
        60,
        resolveUrl,
      );

      expect(result.publicProfile).toBeNull();
    });
  });
});
