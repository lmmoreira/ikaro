# Agent Patterns — Ikaro

> **When to load:** writing any backend, test, BFF or notification code: token-efficient code skeletons distilled from real files; the rules they follow are in `docs/CODE_STANDARDS.md` and `docs/ENGINEERING_RULES_SHARED.md`.
> **Tags:** agent-process, backend

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

**Applies to `shared/infrastructure/` cross-cutting classes too, not just bounded-context aggregates.** Any class outside a `typeorm-xxx.repository.ts` file that touches `@InjectRepository`, `Repository<T>.query()`, raw SQL, or `EntityManager` directly has the same problem a context's use case would have — extract the port to `shared/ports/xxx-repository.port.ts` and the adapter to `shared/infrastructure/<feature>/typeorm-xxx.repository.ts`. Worked example: `shared/infrastructure/outbox/typeorm-outbox.repository.ts` — `OutboxPublisher`/`OutboxRelayService` originally embedded every `INSERT`/`SELECT ... FOR UPDATE SKIP LOCKED`/`UPDATE`/`DELETE` statement directly before this split (TD24 D13; see `docs/ANTI_PATTERNS.md`).

**Transaction boundary:** a repository port describes reads/writes only. Do not add `runInTransaction(...)` to it and do not pass `EntityManager` through it. The use case/service injects `ITransactionManager` and owns the short transaction; the TypeORM repository adapter joins the ambient manager with `getActiveEntityManager()`. If the flow includes external I/O, claim durable work in one short transaction, perform I/O outside it, then mark/release in another short transaction.

**Checklist before writing a new class in `shared/infrastructure/` (or any infrastructure folder):**
1. Does it touch a database or raw SQL directly? → extract a repository port first (above), even if there's only one call site today.
2. Does it implement more than one interface/port? → confirm each interface's methods are actually invoked through the token *this* class will occupy — not merely carried along by DI alias chaining (`docs/ANTI_PATTERNS.md`'s ISP-via-alias-chaining row).
3. Is its DI registration a `useExisting` alias of a functional token that's expected to be rebound to a different implementation later? → make this class the anchor bare provider instead, and have the functional token(s) alias *it* (`docs/ANTI_PATTERNS.md`'s anchor-direction row).

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
import { HttpStatus } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { XxxDomainError, XxxNotFoundError } from '../../domain/errors/xxx-domain.error';

export function mapXxxError(err: unknown): never {
  if (err instanceof XxxNotFoundError) {
    throw throwProblemDetail(HttpStatus.NOT_FOUND, err.code, err.message, err.field);
  }
  if (err instanceof XxxDomainError) {
    throw throwProblemDetail(HttpStatus.BAD_REQUEST, err.code, err.message, err.field);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
```

`code` is mandatory on every Problem Details body: the domain error carries a typed `code` (and optional `field`) from `@ikaro/types`, as `CustomerDomainError` does in `apps/backend/src/contexts/customer/domain/errors/customer-domain.error.ts`.

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

**When NOT to add a Zod schema:** if the DTO only carries a `bookingId` (or similar) that comes from a `@Param` decorated with `CanonicalParseUUIDPipe`, there is no request body to validate — a Zod schema is dead code. Use a plain TypeScript interface instead:

```typescript
// src/contexts/<ctx>/application/dtos/approve-xxx.dto.ts
// No Zod — bookingId comes from CanonicalParseUUIDPipe on the @Param
export interface ApproveXxxDto {
  bookingId: string;
}
```

Canonical examples: `approve-booking.dto.ts`, `cancel-booking-as-admin.dto.ts`

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

Canonical example: `apps/backend/src/contexts/customer/application/use-cases/get-customer-by-id.use-case.ts`

---

### 6. Use Case — Write (with transaction; events drained by the repository)

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

    // 5. No event flush here: for an event-emitting aggregate, repo.save() drains its domain
    //    events into the outbox inside the same transaction (ENGINEERING_RULES_BACKEND.md,
    //    "Aggregate domain events → outbox (repo auto-flush)"). Never inject EVENT_BUS or call
    //    clearDomainEvents() in a use case.

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
import { ZodValidationPipe } from '@ikaro/nestjs-http';
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

These tables are **not exhaustive** — they show the common entries. `ls` the directory for the full set before writing a new double, builder or helper: `apps/backend/src/test/{builders/<ctx>,infrastructure,repositories,factories,utils}`. Builder contexts: `booking`, `customer`, `loyalty`, `notification`, `platform`, `shared`, `staff`; `infrastructure/` holds about 28 `InMemory*` port doubles and `repositories/` about 30 in-memory repositories (including `loyalty/`); `utils/` also has `loyalty-integration-app.ts` and `platform-integration-app.ts`; `factories/` also has `real-outbox-publisher.factory.ts`.

#### Helpers (`apps/backend/src/test/utils/`)

| File | Export | Signature | Use for |
|------|--------|-----------|---------|
| `actor-headers.ts` | `actorHeaders` | `(tenantId, actorId, role?, correlationId?)` → `Record<string, string>` | supertest `.set()` calls in integration specs |
| `wait-for.ts` | `waitFor` | `(condition: () => Promise<boolean>, timeoutMs = 8000)` | polling async side effects in story integration specs |
| `date-helpers.ts` | `futureDate`, `pastDate`, `addDays`, `nextWeekday` | `YYYY-MM-DD` strings, UTC | any date a spec needs — see `docs/TESTING_STRATEGY.md` § Shared date helpers (mandatory — never inline) |
| `address-helpers.ts` | `testAddress`, `testAddressProps` | `testAddress(overrides?, countryCode = 'BR')` → `Address`; `testAddressProps(overrides?)` → `AddressProps` | any `Address` a spec needs — see `docs/TESTING_STRATEGY.md` § Shared address helper (mandatory — never inline) |
| `booking-integration-app.ts` | `createBookingIntegrationApp` | `(options?: { extraModules?, overrideProviders? })` → `{ app, ds, eventBus, moduleRef }` | booking context integration tests |
| `customer-integration-app.ts` | `createCustomerIntegrationApp` | `()` → `{ app, ds }` | customer context integration tests |
| `notification-integration-app.ts` | `createNotificationIntegrationApp` | `(options: { dispatcher, … })` (`dispatcher` required) → `{ app, ds, eventBus }` | notification context integration tests |

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
| `in-memory-booking-customer.port.ts` | `InMemoryBookingCustomerPort` | Booking context unit specs |
| `in-memory-notification-dispatcher.ts` | `InMemoryNotificationDispatcher` | Notification unit specs |
| `in-memory-notification-staff.port.ts` | `InMemoryNotificationStaffPort` | Notification unit specs |
| `in-memory-notification-platform.port.ts` | `InMemoryNotificationPlatformPort` | Notification unit specs |
| `in-memory-booking-availability.ts` | `InMemoryBookingAvailabilityPort` | Booking unit specs |
| `in-memory-cache.port.ts` | `InMemoryCachePort` | Any `CachingXxxRepository` unit spec — `.has(key)` for state assertions, `failNextGet/Set/Del(err)` for error-path tests |

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
import { EventBusModule } from '../../shared/infrastructure/event-bus/event-bus.module';
import { InboxModule } from '../../shared/infrastructure/inbox/inbox.module';
import { InboxRecordEntity } from '../../shared/infrastructure/inbox/inbox-record.entity';
import { OutboxModule } from '../../shared/infrastructure/outbox/outbox.module';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { EVENT_BUS } from '../../shared/ports/event-bus.port';
import { OUTBOX_PUBLISHER } from '../../shared/ports/outbox-publisher.port';
import { STORAGE_SERVICE } from '../../shared/ports/storage.service.port';
import { RequestInterceptor } from '../../shared/request/request.interceptor';
import { RequestModule } from '../../shared/request/request.module';
import { HotsiteConfigEntity } from '../../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../../contexts/platform/infrastructure/entities/tenant.entity';
import { PlatformModule } from '../../contexts/platform/platform.module';
import { XxxEntity } from '../../contexts/<ctx>/infrastructure/entities/xxx.entity';
import { XxxModule } from '../../contexts/<ctx>/xxx.module';
import { InMemoryEventBus } from '../infrastructure/in-memory-event-bus';
import { InMemoryStorageService } from '../infrastructure/in-memory-storage.service';
import { testCacheModule } from './test-cache-module';
import { testConfigModule } from './test-config-module';

export async function createXxxIntegrationApp(): Promise<{
  app: INestApplication;
  ds: DataSource;
}> {
  const eventBus = new InMemoryEventBus();

  const moduleRef = await Test.createTestingModule({
    imports: [
      testConfigModule(), // never reads .env
      testCacheModule(),
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env['TEST_DATABASE_URL'],
        entities: [TenantEntity, HotsiteConfigEntity, XxxEntity, InboxRecordEntity /* add all entities used */],
        synchronize: false,
      }),
      TransactionManagerModule, // ITransactionManager
      RequestModule,             // RequestContext + RequestInterceptor
      EventBusModule,           // PlatformModule.ProvisionTenantUseCase requires IEventBus
      OutboxModule,
      InboxModule,
      PlatformModule,           // exposes POST /internal/tenants for API-driven tenant seeding
      XxxModule,
    ],
    providers: [{ provide: APP_INTERCEPTOR, useClass: RequestInterceptor }],
  })
    .overrideProvider(EVENT_BUS)
    .useValue(eventBus) // suppress real Pub/Sub connections in tests
    .overrideProvider(OUTBOX_PUBLISHER)
    .useValue(eventBus) // same instance: publish and subscribe stay connected, no real outbox table
    .overrideProvider(STORAGE_SERVICE)
    .useValue(new InMemoryStorageService())
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, ds: moduleRef.get(DataSource) };
}
```

**Module checklist — omitting any causes a DI crash at test startup:**

| Module / provider | Why required |
|-------------------|-------------|
| `testConfigModule()` / `testCacheModule()` | A test never reads `.env`; supplies the config and cache the real modules expect |
| `TypeOrmModule.forRoot(...)` | DB connection via `TEST_DATABASE_URL` |
| `RequestModule` | `RequestContext` DI + populates `X-Tenant-ID` header |
| `TransactionManagerModule` | `ITransactionManager` DI for write use cases |
| `EventBusModule` | `PlatformModule` needs `IEventBus` for `ProvisionTenantUseCase` |
| `OutboxModule` / `InboxModule` (+ `InboxRecordEntity`) | Write use cases publish through the outbox; event handlers dedupe through the inbox |
| `PlatformModule` | Provides `POST /internal/tenants` — use it to seed tenants, never insert directly |
| `.overrideProvider(EVENT_BUS)` and `.overrideProvider(OUTBOX_PUBLISHER)` → the same `InMemoryEventBus` | Prevents real GCP Pub/Sub connections and the real outbox relay |
| `.overrideProvider(STORAGE_SERVICE).useValue(new InMemoryStorageService())` | Prevents real GCS access (add `TENANT_SETTINGS_PORT` → `InMemoryTenantSettingsPort` when the context reads tenant settings) |
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
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({ name: 'Xxx Tenant A', slug: `xxx-a-${uuidv7()}`, adminEmail: 'a@xxx.test' })
      .expect(201);
    tenantAId = a.tenantId as string;

    const { body: b } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
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

## BFF Patterns

### 17. BFF Module

```typescript
// apps/bff/src/features/<domain>/xxxs.module.ts
import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../../shared/http/backend-http.module';
import { XxxsController } from './xxxs.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [XxxsController],
})
export class XxxsModule {}
```

Register in `apps/bff/src/app.module.ts` imports array (the module lives under `apps/bff/src/features/<domain>/`).

---

### 18. BFF Controller

```typescript
// apps/bff/src/features/<domain>/xxxs.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
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

**`BackendHttpService` methods:** `.get<T>(path)` · `.post<T>(path, body)` · `.patch<T>(path, body)` · `.delete<T>(path)` · `.put<T>(path, body)` · `.getForPublic<T>(path)` (no auth headers forwarded) · `.postForPublic<T>(path, body)` · `.patchForPublic<T>(path, body, tenantId)`

Canonical example: `apps/bff/src/features/customer/customers.controller.ts`

---

### 19. BFF Unit Spec

```typescript
// apps/bff/src/features/<domain>/xxxs.controller.spec.ts
import { HttpException } from '@nestjs/common';
import { makeBackendHttp } from '../../test/backend-http.mock';
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

Canonical example: `apps/bff/src/features/customer/customers.controller.spec.ts`

---

### 20. BFF Component Spec

```typescript
// apps/bff/src/features/<domain>/xxxs.controller.component.spec.ts
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MockHttpService,
  MockBackendHttpService,
  createTestApp,
  makeCustomerJwt,   // or makeManagerJwt / makeStaffJwt
  setupActiveGuardMock,
  request,
} from '../../test/component-test.helpers';

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
- Import from `../../test/component-test.helpers` — never from `../../test/backend-http.mock` (helper-file isolation)
- Use `const { HttpException: HE } = await import('@nestjs/common')` for error propagation tests — dynamic import prevents circular references
- `makeManagerJwt(jwtService, { role: 'STAFF' })` produces a STAFF JWT (pass `role` override)
- `setupActiveGuardMock(httpService)` must be called before any request that goes through the active-staff guard

Canonical example: `apps/bff/src/features/customer/customers.controller.component.spec.ts`

---

## Notification Context Patterns

### 21. Notification Use Case — dispatch through `BaseNotificationUseCase`

Every notification use case extends `BaseNotificationUseCase` (`notification/application/use-cases/base-notification.use-case.ts`) and sends through its dispatch methods; the per-recipient inbox claim, the `NotificationLog` row (sent or failed) and the redelivery behaviour live there once. Never implement a private `sendAdminEmail` method — duplicating that flow in each use case is the smell this pattern exists to prevent.

- One recipient (a customer or guest): `dispatchTemplates(templates, dto, to, variables)`.
- Several recipients (the tenant's managers): fetch the manager emails through the staff port, then `dispatchTemplatesToMany(templates, dto, emails, variables)`. It claims one inbox row per `(eventId, template, recipient)`, so a redelivery re-sends only to the recipient(s) that failed, continues past a single failure, and throws once at the end so Pub/Sub redelivers.

```typescript
// inside execute(), after finding the templates and calling localizeTemplates():
const managerEmails = await this.staffPort.getManagerEmails(dto.tenantId);
if (managerEmails.length === 0) return { emailSent: false };
const emailSent = await this.dispatchTemplatesToMany(
  adminTemplates,
  { tenantId: dto.tenantId, eventId: dto.eventId, correlationId: dto.correlationId },
  managerEmails,
  variables, // typed TemplateVariables<typeof TRIGGER> — see pattern #22
);
```

Canonical example: `apps/backend/src/contexts/notification/application/use-cases/send-booking-info-submitted-notification/send-booking-info-submitted-notification.use-case.ts` (a manager-only email: `getManagerEmails()` → `localizeTemplates()` → variables typed as `TemplateVariables<typeof TRIGGER>` → `dispatchTemplatesToMany()`).

---

### 22. Notification variables — a contract spec, and specs that render the shipped copy

`NotificationTemplate.render()` turns any variable nobody supplied into `''`, so a mismatch between a template and the use case that fills it fails nothing and logs nothing — the email just comes out blank in that place (M23-S37 audited all 22 shipped templates and found several blank-variable defects of exactly this kind). Two rules keep it from coming back:

- **Declare the variables once.** Each `NotificationTemplateKey` entry in `notification-template-key.mapping.ts` lists its `variables`; the contract spec (`notification-template-key.mapping.spec.ts`) fails when an entry's variables differ from the placeholders actually present in the shipped template, in either language. A use case's variables object is typed against its entry.
- **Render the real copy in specs.** A use-case spec that feeds a hand-typed stand-in template can never catch a missing variable. Build the template from the shipped localized copy (see `notification-emails.handler.integration.spec.ts`) and assert on the rendered subject and body, including one `it()` per conditional branch (nullable field, boolean flag) the template renders.

Canonical examples: `apps/backend/src/contexts/notification/domain/notification-template-key.mapping.spec.ts`, `apps/backend/src/contexts/notification/infrastructure/events/notification-emails.handler.integration.spec.ts`

---

### 23. Notification Use Cases sharing one flow — abstract base with template-method hooks

When two or more notification use cases do the same thing and differ only in *which template* and *which extra variables*, they extend one abstract base that holds the flow; each subclass declares its input type and the hooks, with no constructor of its own (Nest reads the base class's parameter metadata, including the `@Inject()` tokens). Precedents: `BaseBookingReminderNotificationUseCase` (explicit subclass constructors) and `BaseRecurringScheduleCustomerNotificationUseCase` (constructor-less subclasses). Copying the flow into siblings breaches the SonarCloud 3% duplication gate (`docs/CI_TRAPS.md`).

```typescript
@Injectable()
export abstract class BaseRecurringScheduleCustomerNotificationUseCase<
  TInput extends RecurringScheduleNotificationInput,
> extends BaseNotificationUseCase {
  constructor(/* @Inject(...) ports */) { super(logRepo, inboxRepo, dispatcher, txManager); }

  protected abstract templateKeyFor(input: TInput): NotificationTemplateKey;
  protected abstract variablesFor(input: TInput, context: RecurringScheduleNotificationContext): Record<string, string>;

  async execute(input: TInput): Promise<{ emailSent: boolean }> {
    // find template rows -> resolve customer/service/tenant (null -> warn and skip)
    // -> localizeTemplates() -> dispatchTemplates() with the common + extra variables
  }
}

@Injectable()
export class SendRecurringScheduleEndedNotificationUseCase extends BaseRecurringScheduleCustomerNotificationUseCase<SendRecurringScheduleEndedNotificationUseCaseInput> {
  protected templateKeyFor(input: SendRecurringScheduleEndedNotificationUseCaseInput) {
    return input.endedBy === 'STAFF'
      ? NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_BY_STAFF_CUSTOMER
      : NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_CUSTOMER;
  }
}
```

**Rules:** the `{ClassName}Input`/`{ClassName}Result` naming detector still applies to each subclass (declare `…UseCaseInput` as an interface and `…UseCaseResult` as a type alias of the base's result). A recipient the flow does not fit (the manager alert dispatches to many and reports `adminEmailSent`) stays a standalone use case. Specs construct the subclass with the same positional ports and use the real `JsonLocalizationAdapter`, so they assert the shipped copy.

---

## Application Layering Patterns

### 23. Shared application logic — a service under thin use cases

Two entry points (two use cases, or a use case and a job) need the same logic: it goes in `application/services/`, never in one use case that the other imports. Each entry point stays a thin use case over the service, which keeps its own `{ClassName}Input`/`{ClassName}Result` naming.

```typescript
// application/services/availability-query.service.ts — the logic; no *UseCase in the name
@Injectable()
export class AvailabilityQueryService {
  async query(input: AvailabilityQueryInput): Promise<AvailabilityQueryResult> { /* ... */ }
}

// application/use-cases/get-availability.use-case.ts — the controller's entry point
export type GetAvailabilityUseCaseInput = AvailabilityQueryInput;
export type GetAvailabilityUseCaseResult = AvailabilityQueryResult;

@Injectable()
export class GetAvailabilityUseCase {
  constructor(private readonly availabilityQuery: AvailabilityQueryService) {}
  execute(input: GetAvailabilityUseCaseInput): Promise<GetAvailabilityUseCaseResult> {
    return this.availabilityQuery.query(input);
  }
}
```

A second caller (`AvailabilityAlertMatchingService`) injects `AvailabilityQueryService` directly. A type or enum another file needs goes in a sibling `*.types.ts`. Helpers used by both jobs and use cases live in `application/helpers/`. Full placement rules: `docs/ENGINEERING_RULES_BACKEND.md` § Layering inside `application/`. CI: `pnpm dep-cruise` (blocking).
