import { ConfigService } from '@nestjs/config';
import { NestApplicationConfigAdapter } from './nest-application-config.adapter';

describe('NestApplicationConfigAdapter', () => {
  it('returns the required configuration value', () => {
    const config = { getOrThrow: jest.fn().mockReturnValue('https://app.example.test') };
    const adapter = new NestApplicationConfigAdapter(config as unknown as ConfigService);

    expect(adapter.getOrThrow('FRONTEND_URL')).toBe('https://app.example.test');
    expect(config.getOrThrow).toHaveBeenCalledWith('FRONTEND_URL');
  });

  it('returns an optional value, and null when it is unset', () => {
    const adapter = new NestApplicationConfigAdapter(new ConfigService({ SET_KEY: 'ikaro' }));

    expect(adapter.getOptional('SET_KEY')).toBe('ikaro');
    expect(adapter.getOptional('UNSET_KEY')).toBeNull();
  });
});
