import { Injectable } from '@nestjs/common';
import {
  LeadFormPublicConfigInput,
  LeadFormPublicConfigResult,
  LeadFormPublicConfigService,
} from '../services/lead-form-public-config.service';

export type GetLeadFormPublicConfigUseCaseInput = LeadFormPublicConfigInput;
export type GetLeadFormPublicConfigUseCaseResult = LeadFormPublicConfigResult;

// The read itself lives in LeadFormPublicConfigService so that CreateLeadFormSubmissionUseCase can
// re-verify the config at submit time without one use case calling another. The page's initial
// load (LeadFormPublicController's GET config) calls this use case.
@Injectable()
export class GetLeadFormPublicConfigUseCase {
  constructor(private readonly publicConfig: LeadFormPublicConfigService) {}

  execute(
    input: GetLeadFormPublicConfigUseCaseInput,
  ): Promise<GetLeadFormPublicConfigUseCaseResult> {
    return this.publicConfig.read(input);
  }
}
