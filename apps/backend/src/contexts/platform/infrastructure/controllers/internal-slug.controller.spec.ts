import { CheckSlugAvailabilityUseCase } from '../../application/use-cases/check-slug-availability.use-case';
import { InternalSlugController } from './internal-slug.controller';

function controllerWith(result: unknown): {
  controller: InternalSlugController;
  execute: jest.Mock;
} {
  const execute = jest.fn().mockResolvedValue(result);
  const controller = new InternalSlugController({
    execute,
  } as unknown as CheckSlugAvailabilityUseCase);
  return { controller, execute };
}

describe('InternalSlugController', () => {
  it('forwards the slug to the use case', async () => {
    const { controller, execute } = controllerWith({ status: 'available' });

    await expect(controller.getSlugAvailability('lavacar-top')).resolves.toEqual({
      status: 'available',
    });
    expect(execute).toHaveBeenCalledWith({ slug: 'lavacar-top' });
  });

  it('treats a missing slug as empty, which the policy reports as too short', async () => {
    const { controller, execute } = controllerWith({ status: 'invalid', reason: 'TOO_SHORT' });

    await controller.getSlugAvailability(undefined);

    expect(execute).toHaveBeenCalledWith({ slug: '' });
  });

  it('is mounted outside internal/tenants, where :tenantId would shadow it', () => {
    expect(Reflect.getMetadata('path', InternalSlugController)).toBe('internal/signup');
  });
});
