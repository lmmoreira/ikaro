# Agent Patterns — Ikaro

> Token-efficient code templates. Load this whenever writing any code (§10 maps it to "Writing any code").
> Each skeleton is distilled from a real file in the repo — copy and substitute `Xxx`/`xxx`/`XXX` with your context name.
> Canonical source files are noted in each section — read them only when you need something the skeleton doesn't cover.

---

## Backend — Core Patterns

### 1. Repository Port

```typescript
// src/contexts/<ctx>/application/ports/xxx-repository.port.ts
import { XxxAggregate } from '../../domain/xxx.aggregate';

export const XXX_REPOSITORY = Symbol('IXxxRepository');

export interface IXxxRepository {
  findById(id: string, tenantId: string): Promise<XxxAggregate | null>;
  findAllByTenant(tenantId: string): Promise<XxxAggregate[]>;
  save(entity: XxxAggregate): Promise<void>;
}
```

---

### 2. Domain Error Class

```typescript
// src/contexts/<ctx>/domain/errors/xxx-domain.error.ts
export class XxxDomainError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype); // required — instanceof fails without this
    this.name = 'XxxDomainError';
  }
}

export class XxxNotFoundError extends XxxDomainError {
  constructor(id: string) {
    super(`Xxx not found: ${id}`);
    this.name = 'XxxNotFoundError';
  }
}

export class XxxInvalidStateError extends XxxDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'XxxInvalidStateError';
  }
}
```

---

### 3. Error Mapper

```typescript
// src/contexts/<ctx>/infrastructure/http/xxx-error.mapper.ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { ProblemDetail } from '../../../../shared/http/problem-detail';
import { XxxDomainError, XxxNotFoundError } from '../../domain/errors/xxx-domain.error';

export function mapXxxError(err: unknown): never {
  if (err instanceof XxxNotFoundError) {
    throw new HttpException(
      {
        type: 'about:blank',
        title: 'Not Found',
        status: HttpStatus.NOT_FOUND,
        detail: err.message,
      } satisfies ProblemDetail,
      HttpStatus.NOT_FOUND,
    );
  }
  if (err instanceof XxxDomainError) {
    throw new HttpException(
      {
        type: 'about:blank',
        title: 'Bad Request',
        status: HttpStatus.BAD_REQUEST,
        detail: err.message,
      } satisfies ProblemDetail,
      HttpStatus.BAD_REQUEST,
    );
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
```

Canonical example: `apps/backend/src/contexts/customer/infrastructure/http/customer-error.mapper.ts`

---

### 4. Zod DTO Schema

```typescript
// src/contexts/<ctx>/application/dtos/update-xxx.dto.ts
import { z } from 'zod';

export const UpdateXxxSchema = z.object({
  name: z.string().min(1).optional(),
  tenantId: z.uuid(),           // z.uuid() — NOT z.string().uuid() (Zod v4)
  email: z.email().optional(),  // z.email() — NOT z.string().email() (Zod v4)
  field: z.string().nullable().optional(),
});

export type UpdateXxxDto = z.infer<typeof UpdateXxxSchema>;
```

**When NOT to add a Zod schema:** if the DTO only carries a `bookingId` (or similar) that comes from a `@Param` decorated with `ParseUUIDPipe`, there is no request body to validate — a Zod schema is dead code. Use a plain TypeScript interface instead:

```typescript
// src/contexts/<ctx>/application/dtos/approve-xxx.dto.ts
// No Zod — bookingId comes from ParseUUIDPipe on the @Param
export interface ApproveXxxDto {
  bookingId: string;
}
```

Canonical examples: `approve-booking.dto.ts`, `cancel-booking-as-customer.dto.ts`

---

### 5. Use Case — Read (no write)

> **Naming:** Input type = `{UseCaseName}Input` · Output type = `{UseCaseName}Result` — both defined in the use case file. HTTP request/query schemas stay in `dtos/` as `{Action}Schema` + `{Action}Dto` (HTTP-layer only). Never pass a Zod-inferred DTO directly as the use case input type.
>
> **No `RequestContext` in use cases.** The controller extracts `tenantId`, `actorId`, `correlationId`, and any `settings.*` fields from `RequestContext` and forwards them as plain DTO fields. Use cases are pure functions of their input — safe to call from event handlers, scheduled jobs, and cross-context adapters.

```typescript
// src/contexts/<ctx>/application/use-cases/get-xxx.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import { XxxNotFoundError } from '../../domain/errors/xxx-domain.error';
import { IXxxRepository, XXX_REPOSITORY } from '../ports/xxx-repository.port';

export type GetXxxUseCaseInput = {
  tenantId: string;
  actorId: string;
};

export type GetXxxUseCaseResult = {
  id: string;
  tenantId: string;
  // ... other serialisable fields (no VO types — use .value, .address, .toJSON())
};

@Injectable()
export class GetXxxUseCase {
  constructor(
    @Inject(XXX_REPOSITORY) private readonly repo: IXxxRepository,
  ) {}

  async execute(dto: GetXxxUseCaseInput): Promise<GetXxxUseCaseResult> {
    const entity = await this.repo.findById(dto.actorId, dto.tenantId);
    if (!entity) throw new XxxNotFoundError(dto.actorId);
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      // map VO fields: entity.email.address, entity.phone?.value ?? null
    };
  }
}
```

Canonical example: `apps/backend/src/contexts/customer/application/use-cases/get-customer-profile.use-case.ts`

---

### 6. Use Case — Write (with transaction + event flush)

```typescript
// src/contexts/<ctx>/application/use-cases/update-xxx.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import { ITransactionManager, TRANSACTION_MANAGER } from '../../../../shared/ports/transaction-manager.port';
import { XxxNotFoundError } from '../../domain/errors/xxx-domain.error';
import { IXxxRepository, XXX_REPOSITORY } from '../ports/xxx-repository.port';

export type UpdateXxxUseCaseInput = {
  tenantId: string;
  actorId: string;
  correlationId: string;
  // ... HTTP body fields merged in by the controller (never add these to the Zod schema)
  name?: string;
  field?: string | null;
};

export type UpdateXxxUseCaseResult = { id: string /* ... */ };

@Injectable()
export class UpdateXxxUseCase {
  constructor(
    @Inject(XXX_REPOSITORY) private readonly repo: IXxxRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    // @Inject(EVENT_BUS) private readonly eventBus: IEventBus,  // add if aggregate emits events
  ) {}

  async execute(dto: UpdateXxxUseCaseInput): Promise<UpdateXxxUseCaseResult> {
    // 1. Load BEFORE the transaction (reads are outside txManager.run)
    const entity = await this.repo.findById(dto.actorId, dto.tenantId);
    if (!entity) throw new XxxNotFoundError(dto.actorId);

    // 2. Partial-update pattern (when fields are optional)
    const name = dto.name ?? entity.name;
    const field = dto.field === undefined ? entity.field : dto.field; // use === undefined for nullable fields

    // 3. Mutate via aggregate method (records domain events internally)
    entity.update(name, field);

    // 4. Write inside transaction
    await this.txManager.run(() => this.repo.save(entity));

    // 5. Flush domain events AFTER transaction — never inside txManager.run()
    // for (const event of entity.clearDomainEvents()) {
    //   await this.eventBus.publish(event);
    // }

    return { id: entity.id /* ... */ };
  }
}
```

**Partial-update field resolution:**
- `dto.field ?? entity.field` — for fields that can't be explicitly nulled
- `dto.field === undefined ? entity.field : dto.field` — for nullable fields where `null` means "clear"

Canonical example: `apps/backend/src/contexts/customer/application/use-cases/update-customer-profile.use-case.ts`

---

### 7. Backend Controller

```typescript
// src/contexts/<ctx>/infrastructure/controllers/xxx.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { RequestContext } from '../../../../shared/request/request-context';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { mapXxxError } from '../http/xxx-error.mapper';
import { UpdateXxxDto, UpdateXxxSchema } from '../../application/dtos/update-xxx.dto';
import { GetXxxUseCase, GetXxxUseCaseResult } from '../../application/use-cases/get-xxx.use-case';
import { UpdateXxxUseCase, UpdateXxxUseCaseResult } from '../../application/use-cases/update-xxx.use-case';

@Controller('xxxs')
export class XxxController {
  constructor(
    private readonly getXxx: GetXxxUseCase,
    private readonly updateXxx: UpdateXxxUseCase,
    private readonly ctx: RequestContext,  // controller extracts context; use cases never inject it
  ) {}

  @Get('me')
  getMe(): Promise<GetXxxUseCaseResult> {
    const { tenantId, actorId } = this.ctx;
    return this.getXxx.execute({ tenantId, actorId: actorId! }).catch(mapXxxError);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  updateMe(
    @Body(new ZodValidationPipe(UpdateXxxSchema)) body: UpdateXxxDto,
  ): Promise<UpdateXxxUseCaseResult> {
    const { tenantId, actorId, correlationId } = this.ctx;
    return this.updateXxx
      .execute({ ...body, tenantId, actorId: actorId!, correlationId })
      .catch(mapXxxError);
  }
}
```

**Controller rules (non-negotiable):**
- Controller is the **only** layer that injects `RequestContext`. Extract `tenantId`, `actorId`, `correlationId`, and any `settings.*` values here; forward as DTO fields to the use case.
- One-liner method body: `return this.useCase.execute(input).catch(mapXxxError)`
- Never `throw` inside a controller method — synchronous `throw` bypasses `.catch(mapXxxError)`
- No business logic — controllers call use cases only

Canonical example: `apps/backend/src/contexts/customer/infrastructure/controllers/customer.controller.ts`

---

### 8. Backend Module

```typescript
// src/contexts/<ctx>/xxx.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { RequestModule } from '../../shared/request/request.module';
import { XXX_REPOSITORY } from './application/ports/xxx-repository.port';
import { GetXxxUseCase } from './application/use-cases/get-xxx.use-case';
import { UpdateXxxUseCase } from './application/use-cases/update-xxx.use-case';
import { XxxController } from './infrastructure/controllers/xxx.controller';
import { XxxEntity } from './infrastructure/entities/xxx.entity';
import { TypeOrmXxxRepository } from './infrastructure/repositories/typeorm-xxx.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([XxxEntity]),
    RequestModule,             // always — controller injects RequestContext; RequestModule is NOT @Global()
    TransactionManagerModule, // always — write use cases use ITransactionManager
    // EventBusModule,        // add only if use cases publish domain events
    // OtherContextModule,    // add only if cross-context port+adapter needed (import the module, not its repo token)
  ],
  controllers: [XxxController],
  providers: [
    { provide: XXX_REPOSITORY, useClass: TypeOrmXxxRepository },
    GetXxxUseCase,
    UpdateXxxUseCase,
  ],
  exports: [
    // Export read use cases only when another context's adapter injects them.
    // Prefer GetXxxByIdUseCase or broad GetXxxsUseCase with filter DTOs.
  ],
})
export class XxxModule {}
```

Canonical example: `apps/backend/src/contexts/customer/customer.module.ts`

---

### 9. HTTP Request File

```http
# apps/backend/http/<ctx>/xxxs.http
@baseUrl    = http://localhost:3001
@tenantId   = 10000000-0000-4000-8000-000000000001
@actorId    = 20000000-0000-4000-8000-000000000001

### GET /xxxs/me — happy path
GET {{baseUrl}}/xxxs/me
X-Tenant-ID: {{tenantId}}
X-Actor-ID: {{actorId}}
X-Actor-Type: CUSTOMER
X-Actor-Role: CUSTOMER
X-Correlation-ID: test-corr-id

###

### PATCH /xxxs/me — partial update
PATCH {{baseUrl}}/xxxs/me
Content-Type: application/json
X-Tenant-ID: {{tenantId}}
X-Actor-ID: {{actorId}}
X-Actor-Type: CUSTOMER
X-Actor-Role: CUSTOMER
X-Correlation-ID: test-corr-id

{
  "field": "new-value"
}

###

### GET /xxxs/me — 404 (unknown actorId)
GET {{baseUrl}}/xxxs/me
X-Tenant-ID: {{tenantId}}
X-Actor-ID: 00000000-0000-4000-8000-000000009999
X-Actor-Type: CUSTOMER
X-Actor-Role: CUSTOMER
X-Correlation-ID: test-corr-id
```

Required: one happy-path block + one block per 4xx case. Every endpoint must have a `.http` file.

Canonical example: `apps/backend/http/customer/customers.http`

---

## Test Patterns

### Test Utilities — Complete Reference

Do not search for these — they exist at the paths below.

#### Helpers (`apps/backend/src/test/utils/`)

| File | Export | Signature | Use for |
|------|--------|-----------|---------|
| `actor-headers.ts` | `actorHeaders` | `(tenantId, actorId, role?)` → `Record<string, string>` | supertest `.set()` calls in integration specs |
| `wait-for.ts` | `waitFor` | `(fn: () => Promise<void>, opts?)` | polling async side effects in story integration specs |
| `date-helpers.ts` | various date utils | — | date manipulation in tests |
| `booking-integration-app.ts` | `createBookingIntegrationApp` | `()` → `{ app, ds }` | booking context integration tests |
| `customer-integration-app.ts` | `createCustomerIntegrationApp` | `()` → `{ app, ds }` | customer context integration tests |
| `notification-integration-app.ts` | `createNotificationIntegrationApp` | `()` → `{ app, ds, dispatcher }` | notification context integration tests |

#### Builders (`apps/backend/src/test/builders/<ctx>/`)

| Context | Aggregate builder | Entity builder |
|---------|------------------|----------------|
| `customer` | `customer.builder.ts` → `CustomerBuilder` | `customer-entity.builder.ts` → `CustomerEntityBuilder` |
| `staff` | `staff.builder.ts` → `StaffBuilder` | `staff-entity.builder.ts` → `StaffEntityBuilder` |
| `booking` | `booking.builder.ts` → `BookingBuilder` | `booking-entity.builder.ts` → `BookingEntityBuilder` |
| `platform` | `platform/tenant.builder.ts` → `TenantBuilder` | `platform/tenant-entity.builder.ts` → `TenantEntityBuilder` |

#### InMemory infrastructure (`apps/backend/src/test/infrastructure/`)

| File | Class | Use for |
|------|-------|---------|
| `in-memory-transaction-manager.ts` | `InMemoryTransactionManager` | All unit + controller specs |
| `in-memory-event-bus.ts` | `InMemoryEventBus` | Unit specs; integration app override |
| `in-memory-customer-profile.port.ts` | `InMemoryCustomerProfilePort` | Booking context unit specs |
| `in-memory-notification-dispatcher.ts` | `InMemoryNotificationDispatcher` | Notification unit specs |
| `in-memory-notification-staff.port.ts` | `InMemoryNotificationStaffPort` | Notification unit specs |
| `in-memory-notification-tenant.port.ts` | `InMemoryNotificationTenantPort` | Notification unit specs |
| `in-memory-booking-availability.ts` | `InMemoryBookingAvailability` | Booking unit specs |

#### InMemory repositories (`apps/backend/src/test/repositories/<ctx>/`)

| File | Class |
|------|-------|
| `customer/in-memory-customer.repository.ts` | `InMemoryCustomerRepository` |
| `staff/in-memory-staff.repository.ts` | `InMemoryStaffRepository` |
| `booking/in-memory-booking.repository.ts` | `InMemoryBookingRepository` |
| `notification/in-memory-notification-log.repository.ts` | `InMemoryNotificationLogRepository` |
| `platform/in-memory-tenant.repository.ts` | `InMemoryTenantRepository` |

#### Factories

| File | Class | Builds |
|------|-------|--------|
| `factories/request-context.factory.ts` | `RequestContextBuilder` | `RequestContext` stubs for unit/controller specs |

---

### 10. Aggregate Builder

```typescript
// src/test/builders/<ctx>/xxx.builder.ts
import { XxxAggregate } from '../../../contexts/<ctx>/domain/xxx.aggregate';

export class XxxBuilder {
  private tenantId = '10000000-0000-4000-8000-000000000001';
  private field = 'default-value';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withField(field: string): this {
    this.field = field;
    return this;
  }

  build(): XxxAggregate {
    const agg = XxxAggregate.create(this.tenantId, this.field);
    agg.clearDomainEvents(); // builders don't produce events — tests assert events explicitly
    return agg;
  }
}
```

---

### 11. Entity Builder

```typescript
// src/test/builders/<ctx>/xxx-entity.builder.ts
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { XxxEntity } from '../../../contexts/<ctx>/infrastructure/entities/xxx.entity';

export class XxxEntityBuilder {
  private id = uuidv7();              // always uuidv7() — never Date.now() or Math.random()
  private tenantId = '10000000-0000-4000-8000-000000000001';
  private field = 'default';
  private readonly createdAt = new Date('2026-01-01T00:00:00Z');
  private readonly updatedAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this { this.id = id; return this; }
  withTenantId(tenantId: string): this { this.tenantId = tenantId; return this; }
  withField(field: string): this { this.field = field; return this; }

  build(): XxxEntity {
    const e = new XxxEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.field = this.field;
    e.createdAt = this.createdAt;
    e.updatedAt = this.updatedAt;
    return e;
  }
}
```

---

### 12. InMemory Repository

```typescript
// src/test/repositories/<ctx>/in-memory-xxx.repository.ts
import { IXxxRepository } from '../../../contexts/<ctx>/application/ports/xxx-repository.port';
import { XxxAggregate } from '../../../contexts/<ctx>/domain/xxx.aggregate';

export class InMemoryXxxRepository implements IXxxRepository {
  private readonly store = new Map<string, XxxAggregate>();

  async findById(id: string, tenantId: string): Promise<XxxAggregate | null> {
    const entity = this.store.get(id);
    return entity?.tenantId === tenantId ? entity : null; // tenant isolation enforced even in-memory
  }

  async findAllByTenant(tenantId: string): Promise<XxxAggregate[]> {
    return [...this.store.values()].filter((e) => e.tenantId === tenantId);
  }

  async save(entity: XxxAggregate): Promise<void> {
    this.store.set(entity.id, entity);
  }
}
```

---

### 13. Unit Spec — Use Case

```typescript
// src/contexts/<ctx>/application/use-cases/get-xxx.use-case.spec.ts
import { XxxNotFoundError } from '../../domain/errors/xxx-domain.error';
import { XxxBuilder } from '../../../../test/builders/<ctx>/xxx.builder';
import { InMemoryXxxRepository } from '../../../../test/repositories/<ctx>/in-memory-xxx.repository';
import { GetXxxUseCase } from './get-xxx.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000011'; // unique across ALL spec files in the project

describe('GetXxxUseCase', () => {
  let useCase: GetXxxUseCase;
  let repo: InMemoryXxxRepository;
  let entityId: string;

  beforeEach(async () => {
    repo = new InMemoryXxxRepository();
    const entity = new XxxBuilder().withTenantId(TENANT_A).build();
    await repo.save(entity);
    entityId = entity.id;
    useCase = new GetXxxUseCase(repo); // no RequestContext — pass context fields via DTO
  });

  it('returns the entity for the actor', async () => {
    const result = await useCase.execute({ tenantId: TENANT_A, actorId: entityId });
    expect(result.id).toBeDefined();
  });

  it('throws XxxNotFoundError when actor has no matching entity', async () => {
    await expect(
      useCase.execute({ tenantId: TENANT_A, actorId: '00000000-0000-4000-8000-000000009999' }),
    ).rejects.toBeInstanceOf(XxxNotFoundError);
  });

  it('throws XxxNotFoundError when tenantId does not match (tenant isolation)', async () => {
    const TENANT_B = '10000000-0000-4000-8000-000000000012';
    await expect(
      useCase.execute({ tenantId: TENANT_B, actorId: entityId }),
    ).rejects.toBeInstanceOf(XxxNotFoundError);
  });
});
```

---

### 14. Unit Spec — Controller

```typescript
// src/contexts/<ctx>/infrastructure/controllers/xxx.controller.spec.ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { XxxBuilder } from '../../../../test/builders/<ctx>/xxx.builder';
import { InMemoryXxxRepository } from '../../../../test/repositories/<ctx>/in-memory-xxx.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { GetXxxUseCase } from '../../application/use-cases/get-xxx.use-case';
import { UpdateXxxUseCase } from '../../application/use-cases/update-xxx.use-case';
import { XxxController } from './xxx.controller';

const TENANT_A = '10000000-0000-4000-8000-000000000013'; // unique across ALL spec files

describe('XxxController', () => {
  let controller: XxxController;
  let repo: InMemoryXxxRepository;
  let entityId: string;

  beforeEach(async () => {
    repo = new InMemoryXxxRepository();
    const entity = new XxxBuilder().withTenantId(TENANT_A).build();
    await repo.save(entity);
    entityId = entity.id;

    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withActorId(entityId)
      .withActorType('CUSTOMER')
      .build();

    // Construct controller directly — no Test.createTestingModule needed for unit specs
    // Use cases receive no RequestContext — ctx goes to the controller, which extracts fields into DTOs
    controller = new XxxController(
      new GetXxxUseCase(repo),
      new UpdateXxxUseCase(repo, new InMemoryTransactionManager()),
      ctx,
    );
  });

  it('getMe() returns the entity', async () => {
    const result = await controller.getMe();
    expect(result.id).toBe(entityId);
  });

  it('getMe() maps XxxNotFoundError to 404', async () => {
    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withActorId('00000000-0000-4000-8000-000000009998')
      .build();
    const ctrl = new XxxController(
      new GetXxxUseCase(repo),
      new UpdateXxxUseCase(repo, new InMemoryTransactionManager()),
      ctx,
    );
    const err = await ctrl.getMe().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });
});
```

---

### 15. Integration App Helper

```typescript
// src/test/utils/xxx-integration-app.ts
import { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventBusModule } from '../../shared/infrastructure/event-bus.module';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { EVENT_BUS } from '../../shared/ports/event-bus.port';
import { RequestInterceptor } from '../../shared/request/request.interceptor';
import { RequestModule } from '../../shared/request/request.module';
import { HotsiteConfigEntity } from '../../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../../contexts/platform/infrastructure/entities/tenant.entity';
import { PlatformModule } from '../../contexts/platform/platform.module';
import { XxxEntity } from '../../contexts/<ctx>/infrastructure/entities/xxx.entity';
import { XxxModule } from '../../contexts/<ctx>/xxx.module';
import { InMemoryEventBus } from '../infrastructure/in-memory-event-bus';

export async function createXxxIntegrationApp(): Promise<{
  app: INestApplication;
  ds: DataSource;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env['TEST_DATABASE_URL'],
        entities: [TenantEntity, HotsiteConfigEntity, XxxEntity /* add all entities used */],
        synchronize: false,
      }),
      TransactionManagerModule, // ITransactionManager
      RequestModule,             // RequestContext + RequestInterceptor
      EventBusModule,           // PlatformModule.ProvisionTenantUseCase requires IEventBus
      PlatformModule,           // exposes POST /internal/tenants for API-driven tenant seeding
      XxxModule,
    ],
    providers: [{ provide: APP_INTERCEPTOR, useClass: RequestInterceptor }],
  })
    .overrideProvider(EVENT_BUS)
    .useValue(new InMemoryEventBus()) // suppress real Pub/Sub connections in tests
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, ds: moduleRef.get(DataSource) };
}
```

**Module checklist — omitting any causes a DI crash at test startup:**

| Module / provider | Why required |
|-------------------|-------------|
| `TypeOrmModule.forRoot(...)` | DB connection via `TEST_DATABASE_URL` |
| `RequestModule` | `RequestContext` DI + populates `X-Tenant-ID` header |
| `TransactionManagerModule` | `ITransactionManager` DI for write use cases |
| `EventBusModule` | `PlatformModule` needs `IEventBus` for `ProvisionTenantUseCase` |
| `PlatformModule` | Provides `POST /internal/tenants` — use it to seed tenants, never insert directly |
| `.overrideProvider(EVENT_BUS).useValue(new InMemoryEventBus())` | Prevents real GCP Pub/Sub connections |
| `{ provide: APP_INTERCEPTOR, useClass: RequestInterceptor }` | Populates `RequestContext` from `X-Tenant-ID` header on each request |

Canonical example: `apps/backend/src/test/utils/customer-integration-app.ts`

---

### 16. Integration Spec

```typescript
// src/contexts/<ctx>/infrastructure/controllers/xxx.controller.integration.spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { XxxEntityBuilder } from '../../../../test/builders/<ctx>/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createXxxIntegrationApp } from '../../../../test/utils/xxx-integration-app';
import { XxxEntity } from '../entities/xxx.entity';

const TEST_KEY = 'xxx-integ-test-key-must-be-min-32ch!'; // ≥ 32 chars

describe('XxxController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createXxxIntegrationApp());

    // Always provision tenants via API — never insert into DB directly
    const { body: a } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({ name: 'Xxx Tenant A', slug: `xxx-a-${uuidv7()}`, adminEmail: 'a@xxx.test' })
      .expect(201);
    tenantAId = a.tenantId as string;

    const { body: b } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({ name: 'Xxx Tenant B', slug: `xxx-b-${uuidv7()}`, adminEmail: 'b@xxx.test' })
      .expect(201);
    tenantBId = b.tenantId as string;
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  describe('GET /xxxs/me', () => {
    let entityId: string;

    beforeAll(async () => {
      const entity = new XxxEntityBuilder()
        .withTenantId(tenantAId)
        .withId(uuidv7())
        .build();
      await ds.getRepository(XxxEntity).save(entity);
      entityId = entity.id;
    });

    it('returns the entity for the authenticated actor', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/xxxs/me')
        .set(actorHeaders(tenantAId, entityId, 'CUSTOMER'))
        .expect(200);
      expect(body.id).toBe(entityId);
    });

    // Mandatory tenant-isolation test on every endpoint
    it('tenant isolation: entity from tenant A returns 404 under tenant B context', async () => {
      await request(app.getHttpServer())
        .get('/xxxs/me')
        .set(actorHeaders(tenantBId, entityId, 'CUSTOMER'))
        .expect(404);
    });
  });
});
```

**Integration spec rules:**
- `uuidv7()` for all generated IDs — never `Date.now()`, `Math.random()`, or fixed string literals
- Slugs must be unique per test run: `` `prefix-${uuidv7()}` ``
- Provision tenants via `POST /internal/tenants`, never direct DB insert
- One tenant-isolation test (`it('tenant isolation: ...')`) per endpoint — mandatory for Definition of Done
- For aggregate-count assertions, use an inline unique tenantId per `it()`, never reuse `tenantAId`/`tenantBId`

Canonical example: `apps/backend/src/contexts/customer/infrastructure/controllers/customer.controller.integration.spec.ts`

---

## Notification Context Patterns

### 21. Notification Use Case — admin email via shared utility

All notification use cases that dispatch to managers must call `dispatchAdminEmailToManagers()` from `notification-log.helper.ts`. Never implement a private `sendAdminEmail` method — duplicating 18+ lines across two use cases breaches the SonarCloud 3% CPD gate.

```typescript
// src/contexts/notification/application/use-cases/send-booking-xxx-notification/send-booking-xxx-notification.use-case.ts
import {
  dispatchAdminEmailToManagers,
  saveNotificationLog,
} from '../../utils/notification-log.helper';

// inside execute():
if (!existingAdmin) {
  adminEmailSent = await dispatchAdminEmailToManagers(
    {
      staffPort: this.staffPort,
      dispatcher: this.dispatcher,
      logRepo: this.logRepo,
      txManager: this.txManager,
    },
    {
      tenantId: dto.tenantId,
      eventId: dto.eventId,
      notificationType: ADMIN_NOTIFICATION_TYPE,
      subject: 'Agendamento xxx',
      templateKey: 'booking-xxx-admin',
      data: { /* event-specific fields */ },
    },
  );
}
```

`dispatchAdminEmailToManagers` fetches manager emails, fans out `dispatcher.dispatch()` in parallel, saves the log, and returns `boolean` (false when no managers).

Canonical example: `apps/backend/src/contexts/notification/application/utils/notification-log.helper.ts`

---

### 22. SMTP Adapter Spec — one describe per template case

Every `case` in the SMTP adapter's `render()` switch must have its own `describe` block in the adapter spec. Missing cases leave the adapter lines uncovered even when use-case specs are complete — SonarCloud flags the adapter file.

For templates with conditional rendering (nullable fields, boolean flags), add one `it()` per branch:

```typescript
describe('booking-xxx-admin', () => {
  it('renders subject and body', () => {
    const result = adapter.render('booking-xxx-admin', { contactName: 'Ana', ... });
    expect(result.subject).toContain('...');
    expect(result.html).toContain('Ana');
  });

  it('renders isBusiness=false variant', () => {
    const result = adapter.render('booking-xxx-admin', { isBusiness: false, ... });
    expect(result.html).toContain('...');
  });

  it('renders without reason when reason is null', () => {
    const result = adapter.render('booking-xxx-admin', { reason: null, ... });
    expect(result.html).not.toContain('Motivo:');
  });
});
```

**Rule:** count the `if`/ternary branches inside the template render logic; each branch needs one `it()`.

Canonical example: `apps/backend/src/contexts/notification/infrastructure/delivery/smtp-email.adapter.spec.ts`

---

## BFF Patterns

### 17. BFF Module

```typescript
// apps/bff/src/xxxs/xxxs.module.ts
import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../shared/http/backend-http.module';
import { XxxsController } from './xxxs.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [XxxsController],
})
export class XxxsModule {}
```

Register in `apps/bff/src/app.module.ts` imports array.

---

### 18. BFF Controller

```typescript
// apps/bff/src/xxxs/xxxs.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { Roles } from '../shared/decorators/roles.decorator';
import { BackendHttpService } from '../shared/http/backend-http.service';
import { XxxResponse } from './xxxs.types';

const UpdateXxxBodySchema = z.object({
  field: z.string().min(1).optional(),
});
type UpdateXxxBody = z.infer<typeof UpdateXxxBodySchema>;

@Controller('xxxs')
@Roles('CUSTOMER') // or 'MANAGER' | 'STAFF' — enforced by RolesGuard before reaching backend
export class XxxsController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get('me')
  get(): Promise<XxxResponse> {
    return this.backendHttp.get<XxxResponse>('/xxxs/me');
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  update(
    @Body(new ZodValidationPipe(UpdateXxxBodySchema)) body: UpdateXxxBody,
  ): Promise<XxxResponse> {
    return this.backendHttp.patch<XxxResponse>('/xxxs/me', body);
  }
}
```

**`BackendHttpService` methods:** `.get<T>(path)` · `.post<T>(path, body)` · `.patch<T>(path, body)` · `.delete<T>(path)` · `.getForPublic<T>(path)` (no auth headers forwarded) · `.postForPublic<T>(path, body)`

Canonical example: `apps/bff/src/customers/customers.controller.ts`

---

### 19. BFF Unit Spec

```typescript
// apps/bff/src/xxxs/xxxs.controller.spec.ts
import { HttpException } from '@nestjs/common';
import { makeBackendHttp } from '../test/backend-http.mock';
import { XxxsController } from './xxxs.controller';

describe('XxxsController', () => {
  afterEach(() => jest.resetAllMocks());

  it('calls GET /xxxs/me and returns the result', async () => {
    const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue({ id: '1' }) });
    const ctrl = new XxxsController(backendHttp);
    const result = await ctrl.get();
    expect(backendHttp.get).toHaveBeenCalledWith('/xxxs/me');
    expect(result).toEqual({ id: '1' });
  });

  it('propagates backend 404', async () => {
    const backendHttp = makeBackendHttp({
      get: jest.fn().mockRejectedValue(new HttpException({ status: 404 }, 404)),
    });
    const err = await new XxxsController(backendHttp).get().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(404);
  });
});
```

Canonical example: `apps/bff/src/customers/customers.controller.spec.ts`

---

### 20. BFF Component Spec

```typescript
// apps/bff/src/xxxs/xxxs.controller.component.spec.ts
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MockHttpService,
  MockBackendHttpService,
  createTestApp,
  makeCustomerJwt,   // or makeManagerJwt / makeStaffJwt
  setupActiveGuardMock,
  request,
} from '../test/component-test.helpers';

describe('XxxsController (component)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let httpService: MockHttpService;
  let backendHttpService: MockBackendHttpService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, jwtService, httpService, backendHttpService, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  afterEach(() => jest.resetAllMocks());

  // Always test all four: 401, 403, 200, error propagation
  it('returns 401 with no JWT', async () => {
    expect((await request(app.getHttpServer()).get('/v1/xxxs/me')).status).toBe(401);
  });

  it('returns 403 when JWT role is wrong', async () => {
    const token = makeCustomerJwt(jwtService, { role: 'MANAGER' });
    setupActiveGuardMock(httpService);
    const res = await request(app.getHttpServer())
      .get('/v1/xxxs/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 on success', async () => {
    const token = makeCustomerJwt(jwtService);
    backendHttpService.get.mockResolvedValue({ id: '1' });
    const res = await request(app.getHttpServer())
      .get('/v1/xxxs/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(backendHttpService.get).toHaveBeenCalledWith('/xxxs/me');
  });

  it('propagates backend error', async () => {
    const token = makeCustomerJwt(jwtService);
    // Dynamic import avoids circular-import issues in component test context
    const { HttpException: HE } = await import('@nestjs/common');
    backendHttpService.get.mockRejectedValue(new HE({ status: 404 }, 404));
    const res = await request(app.getHttpServer())
      .get('/v1/xxxs/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
```

**Component spec rules:**
- Import from `../test/component-test.helpers` — never from `../test/backend-http.mock` (helper-file isolation)
- Use `const { HttpException: HE } = await import('@nestjs/common')` for error propagation tests — dynamic import prevents circular references
- `makeManagerJwt(jwtService, { role: 'STAFF' })` produces a STAFF JWT (pass `role` override)
- `setupActiveGuardMock(httpService)` must be called before any request that goes through the active-staff guard

Canonical example: `apps/bff/src/customers/customers.controller.component.spec.ts`
