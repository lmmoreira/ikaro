import { Inject, Injectable } from '@nestjs/common';
import { ServiceNotFoundError } from '../../domain/errors/booking-service.error';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { BookingQuoteService } from '../services/booking-quote.service';

export type QuoteServiceDurationUseCaseInput = {
  id: string;
  tenantId: string;
  durationMinutes?: number;
};

export interface QuoteServiceDurationUseCaseResult {
  durationMinutes: number;
  price: { amount: number; currency: string };
}

@Injectable()
export class QuoteServiceDurationUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    private readonly quoteService: BookingQuoteService,
  ) {}

  async execute(
    input: QuoteServiceDurationUseCaseInput,
  ): Promise<QuoteServiceDurationUseCaseResult> {
    const service = await this.serviceRepo.findById(input.id, input.tenantId);
    if (!service?.isActive) throw new ServiceNotFoundError(input.id);

    const quote = this.quoteService.quote(service, input.durationMinutes);
    return {
      durationMinutes: quote.durationMinutes,
      price: {
        amount: quote.priceAtBooking.amount.toNumber(),
        currency: quote.priceAtBooking.currency,
      },
    };
  }
}
