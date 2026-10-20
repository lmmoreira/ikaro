import {
  LeadFormPublicConfigResult,
  LeadFormPublicConfigService,
} from '../services/lead-form-public-config.service';
import { GetLeadFormPublicConfigUseCase } from './get-lead-form-public-config.use-case';

describe('GetLeadFormPublicConfigUseCase', () => {
  it('delegates to LeadFormPublicConfigService and returns its result unchanged', async () => {
    const result: LeadFormPublicConfigResult = {
      audienceMode: 'GUEST_AND_CUSTOMER',
      questions: [],
    };
    const read = jest.fn().mockResolvedValue(result);
    const useCase = new GetLeadFormPublicConfigUseCase({
      read,
    } as unknown as LeadFormPublicConfigService);
    const input = { tenantId: '00000000-0000-7000-8000-000000000001' };

    await expect(useCase.execute(input)).resolves.toBe(result);
    expect(read).toHaveBeenCalledWith(input);
  });
});
