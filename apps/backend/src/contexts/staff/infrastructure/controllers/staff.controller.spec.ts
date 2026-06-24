import { HttpException, HttpStatus } from '@nestjs/common';
import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { DeactivateStaffUseCase } from '../../application/use-cases/deactivate-staff.use-case';
import { GetStaffByIdUseCase } from '../../application/use-cases/get-staff-by-id.use-case';
import { InviteStaffUseCase } from '../../application/use-cases/invite-staff.use-case';
import { ListStaffUseCase } from '../../application/use-cases/list-staff.use-case';
import { StaffController } from './staff.controller';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';
const CORRELATION_ID = 'corr-ctrl-test';

function makeController(
  repo: InMemoryStaffRepository,
  eventBus: InMemoryEventBus,
  tenantId = TENANT_A,
  actorId: string | undefined = MANAGER_ID,
): StaffController {
  const builder = new RequestContextBuilder()
    .withTenantId(tenantId)
    .withCorrelationId(CORRELATION_ID)
    .withActorType('STAFF')
    .withActorRole('MANAGER');
  if (actorId) builder.withActorId(actorId);
  const ctx = builder.build();
  return new StaffController(
    ctx,
    new ListStaffUseCase(repo),
    new GetStaffByIdUseCase(repo),
    new InviteStaffUseCase(repo, new InMemoryTransactionManager(), eventBus, ctx),
    new DeactivateStaffUseCase(repo, new InMemoryTransactionManager(), eventBus, ctx),
  );
}

describe('StaffController', () => {
  let repo: InMemoryStaffRepository;
  let eventBus: InMemoryEventBus;
  let controller: StaffController;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    eventBus = new InMemoryEventBus();
    controller = makeController(repo, eventBus);
  });

  describe('list()', () => {
    it('returns empty list when tenant has no staff', async () => {
      const result = await controller.list(50, 0);
      expect(result.items).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });

    it('returns only staff from the tenant in RequestContext', async () => {
      const staffA = new StaffBuilder().withTenantId(TENANT_A).withEmail('a@a.com').build();
      const staffB = new StaffBuilder().withTenantId(TENANT_B).withEmail('b@b.com').build();
      await repo.save(staffA);
      await repo.save(staffB);

      const result = await controller.list(50, 0);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].email).toBe('a@a.com');
    });

    it('caps limit at 100', async () => {
      const result = await controller.list(999, 0);
      expect(result.pagination.limit).toBe(100);
    });
  });

  describe('getById()', () => {
    it('maps StaffNotFoundError to 404 when id does not exist', async () => {
      const err = await controller.getById('non-existent').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('returns the staff member with correct shape', async () => {
      const staff = new StaffBuilder()
        .withTenantId(TENANT_A)
        .withEmail('gerente@lavacar.com.br')
        .withRole('MANAGER')
        .withGoogleOAuthId('google-sub-1')
        .withName('Gerente Silva')
        .build();
      await repo.save(staff);

      const result = await controller.getById(staff.id);

      expect(result.id).toBe(staff.id);
      expect(result.email).toBe('gerente@lavacar.com.br');
      expect(result.name).toBe('Gerente Silva');
    });

    it('maps StaffNotFoundError to 404 for staff from a different tenant (isolation)', async () => {
      const staff = new StaffBuilder().withTenantId(TENANT_B).withEmail('b@b.com').build();
      await repo.save(staff);

      const err = await controller.getById(staff.id).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('invite()', () => {
    it('creates staff using tenantId and actorId from RequestContext', async () => {
      const result = await controller.invite({
        email: 'novo@lavacar.com.br',
        firstName: 'João',
        lastName: 'Silva',
        role: 'STAFF',
      });

      expect(result.email).toBe('novo@lavacar.com.br');
      expect(result.isActive).toBe(true);
      const saved = await repo.findByTenantAndEmail(TENANT_A, 'novo@lavacar.com.br');
      expect(saved!.tenantId).toBe(TENANT_A);
      expect(saved!.name).toBe('João Silva');
      expect(saved!.invitedBy).toBe(MANAGER_ID);
    });

    it('maps StaffAlreadyExistsError to 409', async () => {
      const active = new StaffBuilder()
        .withTenantId(TENANT_A)
        .withEmail('novo@lavacar.com.br')
        .withGoogleOAuthId('google-active')
        .build();
      await repo.save(active);

      const err = await controller
        .invite({ email: 'novo@lavacar.com.br', firstName: 'J', lastName: 'S', role: 'STAFF' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    });
  });

  describe('deactivate()', () => {
    it('returns 400 when X-Actor-ID header is missing', async () => {
      const ctxNoActor = new RequestContextBuilder()
        .withTenantId(TENANT_A)
        .withCorrelationId(CORRELATION_ID)
        .build();
      const txMgr = new InMemoryTransactionManager();
      const ctrl = new StaffController(
        ctxNoActor,
        new ListStaffUseCase(repo),
        new GetStaffByIdUseCase(repo),
        new InviteStaffUseCase(repo, txMgr, eventBus, ctxNoActor),
        new DeactivateStaffUseCase(repo, txMgr, eventBus, ctxNoActor),
      );
      const err = await ctrl
        .deactivate('10000000-0000-4000-8000-000000000001')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('deactivates a STAFF member using tenantId from RequestContext', async () => {
      const manager = new StaffBuilder()
        .withTenantId(TENANT_A)
        .withRole('MANAGER')
        .withEmail('manager@lavacar.com.br')
        .withGoogleOAuthId('google-manager')
        .build();
      const staff = new StaffBuilder()
        .withTenantId(TENANT_A)
        .withRole('STAFF')
        .withEmail('staff@lavacar.com.br')
        .withGoogleOAuthId('google-staff')
        .build();
      await repo.save(manager);
      await repo.save(staff);

      const ctrl = makeController(repo, eventBus, TENANT_A, manager.id);
      const result = await ctrl.deactivate(staff.id);

      expect(result.staffId).toBe(staff.id);
      expect(result.isActive).toBe(false);

      const saved = await repo.findById(staff.id, TENANT_A);
      expect(saved!.deactivatedBy).toBe(manager.id);
    });

    it('maps StaffSelfDeactivationError to 403', async () => {
      const manager = new StaffBuilder()
        .withTenantId(TENANT_A)
        .withRole('MANAGER')
        .withEmail('manager@lavacar.com.br')
        .withGoogleOAuthId('google-manager')
        .build();
      await repo.save(manager);

      const ctrl = makeController(repo, eventBus, TENANT_A, manager.id);
      const err = await ctrl.deactivate(manager.id).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    });

    it('maps LastActiveManagerError to 409', async () => {
      const manager = new StaffBuilder()
        .withTenantId(TENANT_A)
        .withRole('MANAGER')
        .withEmail('manager@lavacar.com.br')
        .withGoogleOAuthId('google-manager')
        .build();
      const actor = new StaffBuilder()
        .withTenantId(TENANT_A)
        .withRole('MANAGER')
        .withEmail('actor@lavacar.com.br')
        .withGoogleOAuthId('google-actor')
        .build();
      actor.deactivate(manager.id, 'corr-setup');
      await repo.save(manager);
      await repo.save(actor);

      const ctrl = makeController(repo, eventBus, TENANT_A, actor.id);
      const err = await ctrl.deactivate(manager.id).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    });
  });
});
