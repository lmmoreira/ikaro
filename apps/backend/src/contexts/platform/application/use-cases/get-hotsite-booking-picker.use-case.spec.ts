import { HotsiteConfigBuilder } from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { HotsiteModule } from '../../domain/hotsite-config.aggregate';
import { GetHotsiteBookingPickerUseCase } from './get-hotsite-booking-picker.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

const HERO: HotsiteModule = {
  type: 'HERO',
  enabled: true,
  data: { variant: 'centered', title: 'Titulo', ctaLabel: 'Agendar', ctaTarget: 'booking-form' },
};

function bookingCta(
  data: { datePickerType?: 'carousel' | 'calendar'; carouselDays?: number },
  enabled = true,
): HotsiteModule {
  return {
    type: 'BOOKING_CTA',
    enabled,
    data: { title: 'Agende já', ctaLabel: 'Agendar', ...data },
  };
}

describe('GetHotsiteBookingPickerUseCase', () => {
  let repo: InMemoryHotsiteConfigRepository;
  let useCase: GetHotsiteBookingPickerUseCase;

  beforeEach(() => {
    repo = new InMemoryHotsiteConfigRepository();
    useCase = new GetHotsiteBookingPickerUseCase(repo);
  });

  async function seed(tenantId: string, layout: HotsiteModule[]) {
    await repo.save(
      new HotsiteConfigBuilder().withTenantId(tenantId).buildWithContent(undefined, layout),
    );
  }

  it('returns the configured carousel picker and its size', async () => {
    await seed(TENANT_A, [HERO, bookingCta({ datePickerType: 'carousel', carouselDays: 7 })]);

    expect(await useCase.execute({ tenantId: TENANT_A })).toEqual({
      datePickerType: 'carousel',
      carouselDays: 7,
    });
  });

  it('returns a calendar picker', async () => {
    await seed(TENANT_A, [HERO, bookingCta({ datePickerType: 'calendar', carouselDays: 30 })]);

    expect(await useCase.execute({ tenantId: TENANT_A })).toEqual({
      datePickerType: 'calendar',
      carouselDays: 30,
    });
  });

  it('reads the BOOKING_CTA module whether or not it is enabled, as the public page does', async () => {
    await seed(TENANT_A, [HERO, bookingCta({ datePickerType: 'calendar' }, false)]);

    expect((await useCase.execute({ tenantId: TENANT_A })).datePickerType).toBe('calendar');
  });

  it('falls back to a 14-day carousel for a field the module leaves unset', async () => {
    await seed(TENANT_A, [HERO, bookingCta({})]);

    expect(await useCase.execute({ tenantId: TENANT_A })).toEqual({
      datePickerType: 'carousel',
      carouselDays: 14,
    });
  });

  it('falls back to a 14-day carousel when the hotsite has no BOOKING_CTA module', async () => {
    await seed(TENANT_A, [HERO]);

    expect(await useCase.execute({ tenantId: TENANT_A })).toEqual({
      datePickerType: 'carousel',
      carouselDays: 14,
    });
  });

  it('falls back to a 14-day carousel when the tenant has no hotsite config at all', async () => {
    expect(await useCase.execute({ tenantId: TENANT_A })).toEqual({
      datePickerType: 'carousel',
      carouselDays: 14,
    });
  });

  it("tenant isolation: never returns another tenant's picker", async () => {
    await seed(TENANT_B, [HERO, bookingCta({ datePickerType: 'calendar', carouselDays: 60 })]);

    expect(await useCase.execute({ tenantId: TENANT_A })).toEqual({
      datePickerType: 'carousel',
      carouselDays: 14,
    });
  });
});
