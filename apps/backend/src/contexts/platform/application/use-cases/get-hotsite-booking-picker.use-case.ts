import { Inject, Injectable } from '@nestjs/common';
import {
  HOTSITE_CONFIG_REPOSITORY,
  IHotsiteConfigRepository,
} from '../ports/hotsite-config-repository.port';

// The carousel size the public booking page falls back to when the hotsite sets none
// (apps/web app/[slug]/booking/page.tsx) — keep the two in step.
export const DEFAULT_HOTSITE_CAROUSEL_DAYS = 14;

export interface GetHotsiteBookingPickerUseCaseInput {
  tenantId: string;
}

export interface GetHotsiteBookingPickerUseCaseResult {
  datePickerType: 'carousel' | 'calendar';
  carouselDays: number;
}

// A deliberately narrow read of the hotsite's BOOKING_CTA date picker — how the public booking page
// lets a customer choose a date (a carousel of `carouselDays`, or a calendar). The Booking context
// needs it to match availability alerts only against dates a customer can actually select. It reads
// no image or URL data, so it needs none of HotsiteContentReader's dependencies.
//
// The page takes the first BOOKING_CTA module whether or not it is enabled and falls back to a
// 14-day carousel when the module, a field, or the whole hotsite config is missing; so does this.
@Injectable()
export class GetHotsiteBookingPickerUseCase {
  constructor(
    @Inject(HOTSITE_CONFIG_REPOSITORY) private readonly hotsiteRepo: IHotsiteConfigRepository,
  ) {}

  async execute(
    input: GetHotsiteBookingPickerUseCaseInput,
  ): Promise<GetHotsiteBookingPickerUseCaseResult> {
    const config = await this.hotsiteRepo.findByTenantId(input.tenantId);
    const data = config?.layout.find((module) => module.type === 'BOOKING_CTA')?.data;
    return {
      datePickerType:
        data && 'datePickerType' in data && data.datePickerType === 'calendar'
          ? 'calendar'
          : 'carousel',
      carouselDays:
        data && 'carouselDays' in data && typeof data.carouselDays === 'number'
          ? data.carouselDays
          : DEFAULT_HOTSITE_CAROUSEL_DAYS,
    };
  }
}
