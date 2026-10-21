import { Injectable } from '@nestjs/common';
import {
  AvailabilityQueryInput,
  AvailabilityQueryResult,
  AvailabilityQueryService,
} from '../services/availability-query.service';

export type GetAvailabilityUseCaseInput = AvailabilityQueryInput;
export type GetAvailabilityUseCaseResult = AvailabilityQueryResult;

// The availability computation itself lives in AvailabilityQueryService so that
// MatchAvailabilityAlertsUseCase can reuse it without one use case calling another.
@Injectable()
export class GetAvailabilityUseCase {
  constructor(private readonly availabilityQuery: AvailabilityQueryService) {}

  execute(input: GetAvailabilityUseCaseInput): Promise<GetAvailabilityUseCaseResult> {
    return this.availabilityQuery.query(input);
  }
}
