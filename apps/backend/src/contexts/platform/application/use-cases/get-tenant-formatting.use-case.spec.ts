import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { GetTenantFormattingUseCase } from './get-tenant-formatting.use-case';

describe('GetTenantFormattingUseCase', () => {
  let repo: InMemoryTenantRepository;
  let useCase: GetTenantFormattingUseCase;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    useCase = new GetTenantFormattingUseCase(repo);
  });

  it('throws TenantNotFoundError when the tenant does not exist', async () => {
    await expect(useCase.execute('unknown-id')).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('returns locale, currency, timezone, dateFormat, timeFormat for a known tenant', async () => {
    const tenant = new TenantBuilder().withSlug('lavacar-bh').build();
    await repo.save(tenant);

    const result = await useCase.execute(tenant.id);

    expect(result.locale).toBe('pt-BR');
    expect(result.currency).toBe('BRL');
    expect(result.timezone).toBe('America/Sao_Paulo');
    expect(result.dateFormat).toBe('DD/MM/YYYY');
    expect(result.timeFormat).toBe('24h');
  });
});
