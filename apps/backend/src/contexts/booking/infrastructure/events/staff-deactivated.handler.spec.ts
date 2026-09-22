import { StaffDeactivatedEventBuilder } from '../../../../test/builders/staff';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { CascadeStaffDeactivationUseCase } from '../../application/use-cases/cascade-staff-deactivation.use-case';
import { StaffDeactivatedHandler } from './staff-deactivated.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CORRELATION_ID = '00000000-0000-7000-8000-000000000099';
const STAFF_ID = '00000000-0000-7000-8000-000000000020';

describe('StaffDeactivatedHandler', () => {
  let handler: StaffDeactivatedHandler;
  let useCase: jest.Mocked<Pick<CascadeStaffDeactivationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ cascaded: true }) };
    eventBus = new InMemoryEventBus();
    handler = new StaffDeactivatedHandler(
      useCase as unknown as CascadeStaffDeactivationUseCase,
      eventBus,
    );
  });

  it('subscribes to StaffDeactivated with CONSUMER_NAME on init', () => {
    const spy = jest.spyOn(eventBus, 'subscribe');
    handler.onModuleInit();
    expect(spy).toHaveBeenCalledWith(
      'StaffDeactivated',
      expect.any(Function),
      CascadeStaffDeactivationUseCase.CONSUMER_NAME,
    );
  });

  it('calls CascadeStaffDeactivationUseCase.execute() exactly once with the correct DTO', async () => {
    const event = new StaffDeactivatedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .withStaffId(STAFF_ID)
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      staffId: STAFF_ID,
      eventId: event.eventId,
      correlationId: CORRELATION_ID,
    });
  });

  it('rethrows when the use case fails', async () => {
    const event = new StaffDeactivatedEventBuilder().build();
    const error = new Error('boom');
    useCase.execute.mockRejectedValueOnce(error);

    await expect(handler.handle(event)).rejects.toThrow(error);
  });
});
