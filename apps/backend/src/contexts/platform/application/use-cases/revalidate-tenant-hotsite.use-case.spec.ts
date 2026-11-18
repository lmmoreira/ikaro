import { AppLogger } from '../../../../shared/observability/app-logger';
import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryFrontendRevalidationPort } from '../../../../test/infrastructure/in-memory-frontend-revalidation.port';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { IFrontendRevalidationPort } from '../ports/frontend-revalidation.port';
import { RevalidateTenantHotsiteUseCase } from './revalidate-tenant-hotsite.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';
const CORRELATION_ID = '10000000-0000-4000-8000-0000000000aa';

describe('RevalidateTenantHotsiteUseCase', () => {
  let tenantRepo: InMemoryTenantRepository;
  let revalidation: InMemoryFrontendRevalidationPort;
  let useCase: RevalidateTenantHotsiteUseCase;

  beforeEach(async () => {
    tenantRepo = new InMemoryTenantRepository();
    revalidation = new InMemoryFrontendRevalidationPort();
    useCase = new RevalidateTenantHotsiteUseCase(tenantRepo, revalidation);
    await tenantRepo.save(new TenantBuilder().withId(TENANT_A).withSlug('lava-rapido').build());
    await tenantRepo.save(new TenantBuilder().withId(TENANT_B).withSlug('lava-outro').build());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('revalidates the slug of the tenant, and only that tenant', async () => {
    const result = await useCase.execute({ tenantId: TENANT_A, correlationId: CORRELATION_ID });

    expect(result).toEqual({ revalidated: true });
    expect(revalidation.revalidatedSlugs).toEqual(['lava-rapido']);
  });

  it('logs the successful revalidation once, after the port call, with the tenant and correlation ids', async () => {
    const order: string[] = [];
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation(() => {
      order.push('log');
    });
    const recording: IFrontendRevalidationPort = {
      revalidate: () => {
        order.push('revalidate');
        return Promise.resolve();
      },
    };

    await new RevalidateTenantHotsiteUseCase(tenantRepo, recording).execute({
      tenantId: TENANT_A,
      correlationId: CORRELATION_ID,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('Hotsite revalidated', {
      tenantId: TENANT_A,
      correlationId: CORRELATION_ID,
    });
    expect(order).toEqual(['revalidate', 'log']);
  });

  it('does not log a success line when the tenant no longer exists', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();

    await useCase.execute({
      tenantId: '10000000-0000-4000-8000-0000000000ff',
      correlationId: CORRELATION_ID,
    });

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('does not log a success line when the revalidation port rejects', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    const failing: IFrontendRevalidationPort = {
      revalidate: () => Promise.reject(new Error('frontend down')),
    };

    await new RevalidateTenantHotsiteUseCase(tenantRepo, failing).execute({
      tenantId: TENANT_A,
      correlationId: CORRELATION_ID,
    });

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('does nothing and does not throw when the tenant no longer exists', async () => {
    const result = await useCase.execute({
      tenantId: '10000000-0000-4000-8000-0000000000ff',
      correlationId: CORRELATION_ID,
    });

    expect(result).toEqual({ revalidated: false });
    expect(revalidation.revalidatedSlugs).toEqual([]);
  });

  it('never throws into the caller when the revalidation port fails', async () => {
    const failing: IFrontendRevalidationPort = {
      revalidate: () => Promise.reject(new Error('frontend down')),
    };

    const result = await new RevalidateTenantHotsiteUseCase(tenantRepo, failing).execute({
      tenantId: TENANT_A,
      correlationId: CORRELATION_ID,
    });

    expect(result).toEqual({ revalidated: false });
  });

  it('names one consumer per event, both distinct', () => {
    expect(RevalidateTenantHotsiteUseCase.CONSUMER_NAME_ON_SUSPENSION).toBe(
      'revalidate-hotsite-on-suspension',
    );
    expect(RevalidateTenantHotsiteUseCase.CONSUMER_NAME_ON_REACTIVATION).toBe(
      'revalidate-hotsite-on-reactivation',
    );
  });
});
