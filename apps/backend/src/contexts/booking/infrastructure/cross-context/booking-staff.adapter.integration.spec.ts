import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import { StaffBuilder, StaffEntityBuilder } from '../../../../test/builders/staff/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { GetStaffUseCase } from '../../../staff/application/use-cases/get-staff.use-case';
import { GetStaffByIdUseCase } from '../../../staff/application/use-cases/get-staff-by-id.use-case';
import { StaffEntity } from '../../../staff/infrastructure/entities/staff.entity';
import { TypeOrmStaffRepository } from '../../../staff/infrastructure/repositories/typeorm-staff.repository';
import { BookingStaffAdapter } from './booking-staff.adapter';

const TENANT_A = uuidv7();
const TENANT_B = uuidv7();

describe('BookingStaffAdapter.findNamesByIds (integration)', () => {
  let dataSource: DataSource;
  let staffRepo: TypeOrmStaffRepository;
  let adapter: BookingStaffAdapter;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    staffRepo = new TypeOrmStaffRepository(
      dataSource.getRepository(StaffEntity),
      new InMemoryEventBus(),
    );
    adapter = new BookingStaffAdapter(
      new GetStaffByIdUseCase(staffRepo),
      new GetStaffUseCase(staffRepo),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  async function saveStaff(tenantId: string, name: string | null, active = true) {
    if (name === null) {
      // The domain builder always names its staff; an invited, never-activated member has no name.
      const entity = new StaffEntityBuilder()
        .withTenantId(tenantId)
        .withEmail(`${uuidv7()}@names.example`)
        .withName(null)
        .build();
      await dataSource.getRepository(StaffEntity).save(entity);
      return entity;
    }
    const staff = new StaffBuilder()
      .withTenantId(tenantId)
      .withEmail(`${uuidv7()}@names.example`)
      .withRole('STAFF')
      .build();
    staff.linkGoogleAccount(`sub-${uuidv7()}`, name);
    await staffRepo.save(staff);
    if (!active) {
      staff.deactivate(uuidv7(), uuidv7());
      await staffRepo.save(staff);
    }
    return staff;
  }

  it('resolves several names in one read, keeping deactivated staff and mapping a nameless one to null', async () => {
    const named = await saveStaff(TENANT_A, 'Camila Duarte');
    const deactivated = await saveStaff(TENANT_A, 'Rafael Gomes', false);
    const nameless = await saveStaff(TENANT_A, null);

    const names = await adapter.findNamesByIds(
      [named.id, deactivated.id, nameless.id, named.id],
      TENANT_A,
    );

    expect(names).toEqual(
      new Map<string, string | null>([
        [named.id, 'Camila Duarte'],
        [deactivated.id, 'Rafael Gomes'],
        [nameless.id, null],
      ]),
    );
  });

  it('never returns a name for a staff member of another tenant', async () => {
    const other = await saveStaff(TENANT_B, 'Pessoa de Outro Tenant');

    const names = await adapter.findNamesByIds([other.id], TENANT_A);

    expect(names.get(other.id)).toBeNull();
  });

  it('maps an unknown id to null', async () => {
    const unknown = uuidv7();

    const names = await adapter.findNamesByIds([unknown], TENANT_A);

    expect(names).toEqual(new Map([[unknown, null]]));
  });
});
