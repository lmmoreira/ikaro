# Tech Stack Architecture & Decisions - Ikaro

> **When to load:** questioning or revisiting a technology choice (TypeORM, NestJS, Next.js, Pub/Sub, Cloud Run, PostgreSQL, Secret Manager, Terraform, the email provider, the payment providers) and why it was made, with its scaling path; current infrastructure facts are in `docs/DEPLOYMENT_STRATEGY.md` and `docs/INFRASTRUCTURE_TOOLING_MAP.md`.
> **Tags:** agent-process
**Date:** 2026-05-12  
**Status:** Decision record. The stack below is implemented, except §10 Payment Providers, which is planned (Billing milestone); the checklist and next-steps sections near the end are the original pre-development plan, kept as history.  
**Audience:** Development team, stakeholders, AI agents  
**Related Documents:** See cross-references throughout

---

> **Historical illustrations:** the Kafka, Vault, Kubernetes, AWS/Azure-provider and multi-cloud material in this document records Phase-2 options weighed at inception. The committed target is GCP only (`.copilot/context.md` §1) and none of them is planned; the sections that describe them are kept for the reasoning, not as a roadmap.

## Executive Summary

This document defines the technology stack for Ikaro, a multi-tenant SaaS platform for car wash booking and loyalty management. The stack is designed to be **production-grade from day 1**, **cost-efficient for MVP**, and **scalable without refactoring**.

**Philosophy:**
- ✅ Robust: Every component proven at enterprise scale
- ✅ Lean: Start at $50/month, not $300+
- ✅ Future-proof: Scale to 1M users without code changes
- ✅ Portable where it is cheap (containers, standard Postgres, OpenTelemetry); the committed target is GCP only

**Key Metrics:**
- MVP Infrastructure Cost: ~$43/month at launch scale (line-itemised in § COST SUMMARY below, which is the canonical figure)
- Target Scaling: 1 → 1M users (same code)
- Status: Implemented (the stack below is what the repo runs; see the note under the title)
- No Technical Debt: Built right from start

---

## 1. BACKEND ORM: TypeORM

### Decision
**TypeORM v1.0+** with PostgreSQL 17

### Why TypeORM

| Criterion | Evaluation |
|-----------|-----------|
| **Maturity** | ⭐⭐⭐⭐⭐ Since 2016, proven at Shopify/Airbnb scale |
| **Multi-Tenancy** | ⭐⭐⭐⭐⭐ Query builder supports complex tenant filtering |
| **Performance** | ⭐⭐⭐⭐⭐ Handles 100M+ rows efficiently with proper indexing |
| **Development Speed** | ⭐⭐⭐⭐ Decorator-based, integrates perfectly with NestJS |
| **Cloud Agnostic** | ⭐⭐⭐⭐⭐ Works identically on PostgreSQL everywhere |
| **Cost** | ⭐⭐⭐⭐⭐ Open source, $0 |

### Key Capabilities for Ikaro

#### Multi-Tenant Query Patterns

The booking aggregates (See `docs/DOMAIN_MODEL.md`) require efficient multi-tenant querying. TypeORM's QueryBuilder enables:

```typescript
// Tenant-scoped queries (critical for isolation)
const bookings = await bookingRepository
  .createQueryBuilder('booking')
  .leftJoinAndSelect('booking.lines', 'line')
  .leftJoinAndSelect('line.service', 'service')
  .where('booking.tenantId = :tenantId', { tenantId })
  .andWhere('booking.status IN (:...statuses)', { statuses: ['APPROVED', 'PENDING'] })
  .orderBy('booking.createdAt', 'DESC')
  .take(50)
  .skip(0)
  .getMany();
```

This pattern scales linearly from 10K bookings (day 1) to 100M bookings (year 2).

#### Composite FK Strategy

Aligns perfectly with composite foreign key strategy defined in `docs/TENANT_ISOLATION_STRATEGY.md`:

```typescript
@Entity()
export class Booking {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  tenantId: string;

  @Column('uuid')
  customerId: string | null;

  // Composite unique: prevents cross-tenant access at database level
  @Index(['tenantId', 'id'])
  @Unique(['tenantId', 'id'])
  uniqueBooking: void;

  @ManyToOne(() => Customer)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'customer_id', referencedColumnName: 'id' }
  ])
  customer: Customer;

  @OneToMany(() => BookingLine, line => line.booking, { cascade: true })
  lines: BookingLine[];
}
```

#### LoyaltyEntry Append-Only Pattern

TypeORM supports the immutable append-only semantics needed for `LoyaltyEntry` (See `docs/DOMAIN_MODEL.md`):

```typescript
@Entity()
export class LoyaltyEntry {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  tenantId: string;

  @Column('uuid')
  customerId: string;

  @Column()
  points: number;

  @Column()
  expiresAt: Date;

  // Idempotency: replaying BookingCompleted event is a no-op
  @Unique(['tenantId', 'bookingLineId'])
  @Column('uuid')
  bookingLineId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
  
  // NO UPDATE/DELETE methods - append-only by design
}
```

### Scaling Path

| Stage | Bookings | Queries | Optimization |
|-------|----------|---------|---|
| **Day 1** | 10K | Simple finds | No changes needed |
| **Day 30** | 100K | Filtered + joins | Basic index usage |
| **Day 90** | 500K | Paginated results | Query optimization |
| **Day 180** | 1M | Complex filtering | Read replicas added |
| **Year 1** | 10M | Multi-field filters | Database sharding (future) |
| **Year 2** | 100M | Analytical queries | Advanced partitioning (future) |

**Key:** Same code works at all stages. Only database infrastructure changes.

### Cost Impact
- **Infrastructure:** $0 (open source)
- **Learning:** Moderate (TypeORM decorators well-documented)
- **Performance:** No cost penalty vs. other ORMs

### References
- Domain Model: `docs/DOMAIN_MODEL.md`
- Multi-Tenancy: `docs/TENANT_ISOLATION_STRATEGY.md`
- Database Schema: `docs/DATABASE_SCHEMA.md`

---

## 2. BACKEND FRAMEWORK: NestJS v11

### Decision
**NestJS v11** with Express adapter

### Why NestJS v11

| Criterion | Evaluation |
|-----------|-----------|
| **Maturity** | ⭐⭐⭐⭐⭐ Battle-tested, enterprise-proven |
| **Ecosystem** | ⭐⭐⭐⭐⭐ All packages stable and compatible |
| **DDD Support** | ⭐⭐⭐⭐⭐ Built for domain-driven design patterns |
| **Testing** | ⭐⭐⭐⭐⭐ Built-in support for testing strategy |
| **Scalability** | ⭐⭐⭐⭐⭐ Handles 1→1000+ pods transparently |
| **Cost** | ⭐⭐⭐⭐⭐ Open source, $0 |

### Architecture Alignment

#### Bounded Contexts as NestJS Modules

NestJS module structure directly maps to bounded contexts defined in `docs/BOUNDED_CONTEXTS.md`:

```
apps/backend/src/
├── contexts/
│   ├── booking/                    # Booking Bounded Context
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   ├── value-objects/
│   │   │   └── services/
│   │   ├── application/
│   │   │   ├── use-cases/          # UC-001 through UC-013
│   │   │   └── ports/              # IBookingRepository, etc.
│   │   ├── infrastructure/
│   │   │   ├── persistence/        # TypeORM repositories
│   │   │   ├── controllers/        # REST controllers
│   │   │   └── event-publishers/
│   │   └── booking.module.ts
│   │
│   ├── loyalty/                    # Loyalty Bounded Context
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── loyalty.module.ts
│   │
│   ├── notification/               # Notification Bounded Context
│   │   └── notification.module.ts
│   │
│   ├── customer/                   # Customer Bounded Context
│   ├── staff/                      # Staff Bounded Context
│   └── platform/                   # Platform Bounded Context
│
├── shared/                         # Cross-cutting: Logger, OTel, IEventBus, RequestContext
└── app.module.ts
```

#### Testing Integration

Aligns with `docs/TESTING_STRATEGY.md` testing pyramid:

```typescript
// Unit tests: Domain logic
describe('Booking Service', () => {
  it('should transition PENDING → APPROVED', () => {
    const booking = new Booking(...);
    booking.approve();
    expect(booking.status).toBe(BookingStatus.APPROVED);
  });
});

// Integration tests: NestJS + TypeORM
describe('BookingController (integration)', () => {
  let app: INestApplication;
  let bookingService: BookingService;

  beforeAll(async () => {
    const moduleFixture = Test.createTestingModule({
      imports: [BookingModule, TypeOrmModule.forRoot(testConfig)],
    }).compile();

    app = moduleFixture.createNestApplication();
  });

  it('POST /bookings creates booking', async () => {
    const result = await request(app.getHttpServer())
      .post('/bookings')
      .send({ tenantId, services: [...] });
    
    expect(result.status).toBe(201);
  });
});

// E2E tests: Full workflow
describe('Booking Workflow (E2E)', () => {
  it('UC-001 through UC-009 complete flow', async () => {
    // Full journey: request → approve → complete
  });
});
```

Coverage target: 80% (per `docs/TESTING_STRATEGY.md`).

#### Dependency Injection Pattern

NestJS's DI container enables clean architecture:

```typescript
// Domain service (no dependencies on framework)
export class BookingDomainService {
  completeBooking(booking: Booking): DomainEvent[] {
    // Pure domain logic
  }
}

// Application service (orchestrates use cases)
@Injectable()
export class CompleteBookingUseCase {
  constructor(
    private bookings: BookingRepository,
    private loyalty: LoyaltyService,
    private events: EventPublisher,
  ) {}

  async execute(command: CompleteBookingCommand): Promise<void> {
    // UC-009 implementation
  }
}

// API Controller (HTTP adapter)
@Controller('bookings/:id/complete')
export class CompleteBookingController {
  constructor(private useCase: CompleteBookingUseCase) {}

  @Post()
  async complete(@Param('id') bookingId: string) {
    return await this.useCase.execute({ bookingId });
  }
}
```

### Scaling Strategy

- **Day 1-100:** Single backend pod on Cloud Run
- **Day 100-365:** Horizontal scaling (auto replicas)
- **Year 1+:** Multiple regions (same code, same containers)

**Key:** NestJS services are stateless → scales transparently with infrastructure.

### Why NOT NestJS v12

- v12 was pre-release at decision time, 2026-05 (less production data; re-check before relying on this — the repo is on NestJS v11)
- Marginal performance gains not worth learning curve
- v11 LTS stable through 2026 (as of the 2026-05 decision)
- Can upgrade post-MVP

### Cost Impact
- **Infrastructure:** $0 (open source)
- **Development:** Fast iteration with CLI generation
- **Performance:** Optimized for concurrent requests

### References
- Bounded Contexts: `docs/BOUNDED_CONTEXTS.md`
- Use Cases: `docs/USE_CASES.md`
- Testing: `docs/TESTING_STRATEGY.md`
- Architecture: `docs/ARCHITECTURE.md`

---

## 3. FRONTEND: Next.js with React 19

### Decision
**Next.js 16+** with **React 19**  
**Deployment:** GCP Cloud Run container (same pattern as backend and BFF — NOT Vercel, NOT GCS static export)

### Why Next.js

| Criterion | Evaluation |
|-----------|-----------|
| **Maturity** | ⭐⭐⭐⭐⭐ Netflix, Hulu, major SaaS companies |
| **Built-in Optimization** | ⭐⭐⭐⭐⭐ Automatic code splitting, image optimization |
| **Full-Stack** | ⭐⭐⭐⭐⭐ Can integrate with NestJS backend cleanly |
| **Deployment** | ⭐⭐⭐⭐⭐ SSR on Cloud Run — same container pattern as the rest of the stack |
| **Development** | ⭐⭐⭐⭐⭐ Hot module reloading, excellent DX |
| **Cost** | ⭐⭐⭐⭐⭐ $0 open source; Cloud Run at MVP scale ≈ $5–15/month |

### Why NOT Vite + React

While Vite is faster for development, Next.js provides:
- **Built-in optimization:** Automatic image optimization, code splitting
- **Industry standard:** More developers familiar, more resources
- **Production-ready patterns:** Established best practices
- **Unified full-stack:** Can add backend routes if needed later

### Architecture Pattern

#### Multi-Tenant UI Pattern

Next.js context + hooks provide clean tenant switching (UC-023):

```typescript
// lib/contexts/RequestContext.tsx
export const RequestContext = createContext<RequestContextType>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenantId, setTenantId] = useState<string>(null);
  const [tenantSlug, setTenantSlug] = useState<string>(null);

  // Switch tenant: UC-023 Customer switches tenant
  const switchTenant = async (newTenantSlug: string) => {
    const session = await getSession();
    if (session.availableTenants.includes(newTenantSlug)) {
      setTenantSlug(newTenantSlug);
      // API calls automatically include this tenant
    }
  };

  return (
    <RequestContext.Provider value={{ tenantId, tenantSlug, switchTenant }}>
      {children}
    </RequestContext.Provider>
  );
}
```

This aligns with `docs/TENANT_ISOLATION_STRATEGY.md` - Client enforces tenant awareness.

#### BFF Integration Pattern

The frontend (`apps/web/`) calls the **separate NestJS BFF** (`apps/bff/`), not the backend directly. The BFF validates the JWT, injects `tenantId`, and aggregates data from backend contexts. The session JWT lives in an httpOnly cookie, never in client-readable code; server-side web code calls the BFF only through the transport helpers (`bffServerFetch` for authenticated calls, `bffPublicFetch` for public ones, `bffClient` in client components), documented in `docs/BFF_ARCHITECTURE.md` § Web → BFF Transport Layer.

```typescript
// apps/web/features/booking/api/availability-alerts.server.ts — server-only fetcher
const res = await bffServerFetch(token, '/availability-alerts');
await assertOk(res, CustomerFetchError);
return (await res.json()) as AvailabilityAlertListResponse;
```

**Key:** Next.js never calls the backend or TypeORM directly. All API traffic goes through the NestJS BFF, which enforces multi-tenancy.

### Deployment Strategy

Ikaro's Next.js app requires **server-side rendering** — GCS static export is not viable because:

- `/[slug]` hotsite routing must resolve tenant branding dynamically per request
- Google OAuth callbacks and session redirects (UC-021, UC-022) require server-side handling
- Next.js middleware for auth guards runs server-side
- Hotsite content updates (UC-027) must be reflected immediately without a rebuild

**Decision: GCP Cloud Run** — the same pattern as backend and BFF. One Docker image, deployed as a container.

#### Scaling path

| Stage | Timeline | Cloud Run config | Est. cost |
|---|---|---|---|
| MVP | Month 0–3 | `min=0, max=100, memory=512Mi` (the module default; a 256Mi spec was rejected by GCP) | ~$5–15/month |
| Growth | Month 3–12 | `min=1, max=50, memory=512Mi` | ~$30–60/month |
| Scale | Month 12+ | `min=2, max=100` + Cloud CDN in front | ~$80–150/month |

**Why NOT Vercel:** Vendor lock-in, $20/month floor, and incompatible with the GCP-native infrastructure already in place. The BFF URL, IAM, and VPC are all GCP — Vercel would sit outside that trust boundary.

**Why NOT GCS + CDN static export:** Requires `output: 'export'` in `next.config.js`, which disables middleware, SSR, and server components. Every feature that makes Next.js 16 worth using depends on the Node.js runtime.

### React 19 Choice

| Criterion | Previous baseline | Current baseline |
|-----------|-------------------|-----------------|
| **Stability** | ⭐⭐⭐⭐⭐ Battle-tested | ⭐⭐⭐⭐⭐ Stable baseline |
| **Ecosystem** | ⭐⭐⭐⭐⭐ All libraries support | ⭐⭐⭐⭐⭐ All libraries support |
| **Performance** | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐⭐ Excellent |
| **Team Familiarity** | ⭐⭐⭐⭐⭐ Standard | ⭐⭐⭐⭐⭐ Standard |

**Decision:** React 19 (current repo baseline; no migration penalty)

### Performance Targets

Per `docs/OBSERVABILITY_STRATEGY.md`, Next.js optimizations help:

```
- Largest Contentful Paint (LCP): < 2.5s (automatic with next/image)
- First Input Delay (FID): < 100ms (React 19 concurrent rendering)
- Cumulative Layout Shift (CLS): < 0.1 (next/image prevents layout shift)
```

### Cost Impact
- **Infrastructure:** $0-1/month (MVP)
- **Development:** Fast, excellent DX
- **Performance:** Built-in optimization

### References
- Multi-Tenancy: `docs/TENANT_ISOLATION_STRATEGY.md`
- API Contracts: `docs/API_CONTRACTS.md`
- Observability: `docs/OBSERVABILITY_STRATEGY.md`

---

## 4. EVENT BUS: GCP Pub/Sub (Kafka: historical option, not planned)

### Decision
**Phase 1 (MVP):** GCP Pub/Sub (serverless, managed)  
**Historical option (not planned):** Apache Kafka, weighed at inception for a multi-cloud future

### Why GCP Pub/Sub for MVP

| Criterion | RabbitMQ | Kafka | GCP Pub/Sub |
|-----------|----------|-------|-------------|
| **MVP Cost** | $0 + ops | $500+ | $0-5 |
| **Operations** | Must manage | Must manage | Zero (managed) |
| **Scaling** | Manual (complex) | Manual (complex) | Automatic |
| **Reliability** | Needs HA setup | Needs cluster | 99.95% SLA |
| **Dev Parity** | Docker container | Docker container | Free emulator |
| **Future Path** | Painful migration | Good foundation | Migrate to Kafka (easy) |

### Why NOT RabbitMQ

Self-hosted RabbitMQ becomes a liability at scale:

```
Week 1:  ✅ Works great ($0)
Month 1: 🟠 Queue buildup → manual intervention
Month 2: 🔴 Clustering needed → complex Terraform
Month 3: 🔴 Memory pressure → restart cycles
Month 6: 🔴 Replication issues → potential data loss
```

GCP Pub/Sub eliminates this operational burden.

### Event-Driven Architecture Integration

Aligns perfectly with domain events defined in `docs/DOMAIN_EVENTS.md`:

```typescript
// Event publisher abstraction (cloud-agnostic interface)
export interface EventPublisher {
  publish(topic: string, event: DomainEvent): Promise<void>;
}

// GCP Implementation (MVP)
@Injectable()
export class PubSubPublisher implements EventPublisher {
  async publish(topic: string, event: DomainEvent): Promise<void> {
    const message = Buffer.from(JSON.stringify({
      eventId: event.eventId,
      tenantId: event.tenantId,
      occurredAt: event.occurredAt,
      correlationId: event.correlationId,
      eventName: event.eventName,
      data: event.data,
    }));

    await this.pubsub.topic(topic).publish(message);
  }
}

// NestJS subscriber — uses IEventBus port, NOT @OnEvent() (which is in-memory only)
// The PubSubEventBus adapter calls this handler when a message arrives on the subscription.
@Injectable()
export class BookingCompletedHandler implements IEventHandler<BookingCompletedEvent> {
  constructor(private eventBus: IEventBus) {}

  onModuleInit() {
    // Register this handler for BookingCompleted messages on the loyalty subscription
    this.eventBus.subscribe('BookingCompleted', (event: BookingCompletedEvent) =>
      this.handle(event),
    );
  }

  async handle(event: BookingCompletedEvent): Promise<void> {
    if (!event.data.customerId) return; // guest booking — no loyalty entry
    for (const line of event.data.lines) {
      await this.loyaltyService.recordCompletion(event, line);
    }
  }
}
```

This pattern scales from day 1 → year 2 unchanged.

### Multi-Tenant Event Filtering

Subscriptions are per consumer, not per tenant: every domain event has one topic (`ikaro-{event}`) and one push subscription per consuming handler (`ikaro-{event}-{consumer}`, each with its own DLQ), all generated from `infra/terraform/pubsub-catalog.json` by `modules/pubsub`. Tenant isolation happens in the message, not in the subscription: every event envelope carries `tenantId`, and each consumer scopes its work to that tenant and deduplicates by `eventId`.

Push delivery is at-least-once and may redeliver a message, so every consumer deduplicates by `eventId`. This aligns with `docs/TENANT_ISOLATION_STRATEGY.md` isolation rules; the event envelope is in `docs/DOMAIN_EVENTS.md`.

### Cost Model

| Usage | Monthly Cost |
|-------|---|
| MVP (10K events/day) | $0-1 |
| Growth (100K events/day) | $5-10 |
| Scale (1M events/day) | $15-20 |
| Enterprise (10M events/day) | $150-200 |

**Key:** Linear cost scaling with actual usage (no over-provisioning).

### Guaranteed Delivery

Pub/Sub push subscriptions deliver at-least-once and can redeliver a message; exactly-once is achieved in the consumer through `eventId` deduplication (critical for bookings):

```
BookingCompleted Event
├─ Published once (idempotent eventId)
├─ Delivered at-least-once (with retries, so a message can arrive twice)
├─ Processed exactly-once (idempotency in consumer)
└─ Result: LoyaltyEntry created once, guaranteed
```

### Historical: Kafka Migration Path

Had a later phase required Kafka (analytics, stream processing), the same interface would apply:

```typescript
// Kafka Implementation (historical option)
@Injectable()
export class KafkaPublisher implements EventPublisher {
  async publish(topic: string, event: DomainEvent): Promise<void> {
    await this.producer.send({
      topic,
      messages: [{
        key: event.tenantId,
        value: JSON.stringify(event),
      }],
    });
  }
}

// Application code: ZERO CHANGES
// Just swap implementations at runtime
```

### Local Development

Free emulator enables dev parity:

```yaml
# docker/docker-compose.yml
pubsub-emulator:
  image: gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators
  command: gcloud beta emulators pubsub start --host-port=0.0.0.0:8085 --project=ikaro-local
  ports:
    - '8085:8085'
  environment:
    CLOUDSDK_CORE_PROJECT: ikaro-local
```

### Cost Impact
- **MVP:** $0-5/month
- **Growth:** Scales linearly with usage
- **No operational overhead:** Google manages everything

### References
- Domain Events: `docs/DOMAIN_EVENTS.md`
- Bounded Contexts: `docs/BOUNDED_CONTEXTS.md`
- Multi-Tenancy: `docs/TENANT_ISOLATION_STRATEGY.md`

---

## 5. DEPLOYMENT: Cloud Run (Kubernetes: historical option, not planned)

### Decision
**Phase 1 (MVP):** GCP Cloud Run (serverless)  
**Historical option (not planned):** Kubernetes (GKE), only if ever needed

### Why Cloud Run for MVP

| Criterion | Kubernetes | Cloud Run |
|-----------|-----------|-----------|
| **MVP Cost** | $100-300/month | $0-30/month |
| **Operations** | Full responsibility | Google manages everything |
| **Scaling** | Manual HPA config | Automatic (instant) |
| **Cold Starts** | N/A | ~100ms (acceptable) |
| **Day 100 Cost** | $200-500/month | $50-100/month |
| **Multi-Region** | Complex setup | One-line config |
| **Migration** | Must rewrite | Easy: add K8s later |

### Cloud Run Architecture

#### Deployment Model

```bash
# Illustrative only; real: images live in the Artifact Registry repo `ikaro-registry` (infra/terraform/modules/registry), the backend is capped at 3 max instances (infra/terraform/envs/prod/variables.tf, envs/staging/variables.tf), and it reads DB_HOST / DB_INSTANCE_CONNECTION_NAME / DB_PASSWORD, not DATABASE_URL (apps/backend/src/config/env.validation.ts)
# Build Docker image
docker build -t gcr.io/project/ikaro-backend:latest .

# Deploy to Cloud Run
gcloud run deploy ikaro-backend \
  --image gcr.io/project/ikaro-backend:latest \
  --region southamerica-east1 \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 80 \
  --min-instances 0 \
  --max-instances 100 \
  --set-env-vars DATABASE_URL=...,PUBSUB_PROJECT_ID=...
```

#### Automatic Scaling

Cloud Run scales transparently:

```
Day 1:   10 requests/sec  → 1 pod
Day 30:  100 requests/sec → 10 pods
Day 90:  500 requests/sec → 50 pods
Day 365: 2000 requests/sec → 200 pods

All automatic. Zero configuration needed.
```

#### Cost Examples

```
Day 1 (1M requests/month):
├─ Compute: 0.45 * 1M * $0.00001 = $4.50
├─ Request charges: 1M * $0.40 = $0.40
└─ Total: ~$5/month

Month 12 (100M requests/month):
├─ Compute: 500 * 1M * $0.00001 = $50
├─ Request charges: 100M * $0.40 = $4.00
└─ Total: ~$54/month

Year 2 (1B requests/month):
├─ Compute: 5000 * 1M * $0.00001 = $500
├─ Request charges: 1B * $0.40 = $400
└─ Total: ~$900/month
```

**Key:** Linear cost scaling with actual traffic.

### NOT a Dead-End

If Kubernetes becomes necessary later (multi-region orchestration), same Docker image:

```bash
# Year 2: Add Kubernetes
gcloud container clusters create ikaro-gke \
  --num-nodes 3 \
  --zone southamerica-east1-a

# Deploy SAME IMAGE
kubectl apply -f kubernetes/deployment.yaml

# Application code: UNCHANGED
```

### Environment Variables

Cloud Run integrates with secrets (the real list is `base_secret_ids` in `infra/terraform/modules/secrets/main.tf`; they are injected through the `secret_env_vars` of `infra/terraform/modules/cloudrun-service`):

Illustrative only; real: `infra/terraform/modules/cloudrun-service` (`secret_env_vars`) — there is no `.env.prod` file.

```bash
gcloud run deploy ikaro-backend \
  --set-env-vars-from-file=.env.prod
```

### Networking

Cloud Run provides:
- ✅ Automatic HTTPS
- ✅ Automatic load balancing
- ✅ DDoS protection
- ✅ Firewall rules (optional)

### Observability

Built-in to Cloud Logging (per `docs/OBSERVABILITY_STRATEGY.md`):

```
gcloud logging read "resource.type=cloud_run_revision AND severity=ERROR"
```

### Local Development

Illustrative only: the local stack (`docker/docker-compose.yml`, started with `pnpm infra:up`) runs just postgres, the Pub/Sub emulator, the GCS emulator and mailhog; the apps themselves run on the host with pnpm, not in compose. A backend service would look like this:

```yaml
# docker-compose.yml
backend:
  build: ./backend
  ports:
    - "3000:3000"
  environment:
    DATABASE_URL: postgres://db:5432/ikaro
    PUBSUB_PROJECT_ID: ikaro-local
```

### Cost Impact
- **MVP:** $0-30/month
- **Growth:** Scales linearly ($50-100/month at scale)
- **Operations:** Zero (fully managed)

### References
- API Contracts: `docs/API_CONTRACTS.md`
- Observability: `docs/OBSERVABILITY_STRATEGY.md`
- Deployment: `docs/DEPLOYMENT_STRATEGY.md`

---

## 6. DATABASE: Cloud SQL PostgreSQL 17 (Managed)

### Decision
**GCP Cloud SQL PostgreSQL 17** (managed database, NOT self-hosted)

### Why Cloud SQL

| Criterion | Self-Hosted PG | Cloud SQL |
|-----------|---|---|
| **Backups** | You script/manage | Automatic, 7-day retention |
| **Updates** | You schedule/test | Google handles (rolling) |
| **High Availability** | You build/test | Available as a Cloud SQL option (not configured here: the instance is ZONAL) |
| **Monitoring** | You setup | Built-in (Cloud Console) |
| **Day 1 Cost** | $0 + your time | $10-15/month |
| **Day 100 Cost** | $100 + ops | $30-50/month |
| **Reliability** | 99.0% | Higher with a regional (HA) instance; ours is ZONAL, so the HA SLA does not apply |
| **On-Call Cost** | Database down = $??? | Google guarantees it |

### Database Schema

Fully specified in `docs/DATABASE_SCHEMA.md` with:
- ✅ All tables include `tenant_id` (multi-tenancy)
- ✅ Composite FKs prevent cross-tenant access
- ✅ Proper indexing with `tenant_id` prefix
- ✅ Audit columns on all tables

### Cloud SQL Features

#### Automatic Backups

```
Daily backups (7 retained) included
├─ Point-in-time recovery: on in production (`enable_pitr`), off in staging
├─ Instance is ZONAL (no HA failover configured; HA is a one-click upgrade)
└─ Zero operational overhead
```

#### Scaling Without Downtime

```
Day 1:    db-f1-micro (0.6 GB RAM)    $10/month  → 10K bookings
Day 30:   db-n1-standard-1 (3.75 GB)  $30/month  → 100K bookings
Day 90:   db-n1-standard-2 (7.5 GB)   $50/month  → 500K bookings
Day 180:  db-n1-standard-4 (15 GB)    $100/month → 1M bookings
Year 1:   db-n1-highmem-16 (104 GB)   $300/month → 10M bookings

Each upgrade: Zero downtime, zero code changes
```

#### Read Replicas for Scaling Reads

```typescript
// Day 1-180: Single instance
const bookingRepository = bookingDataSource.getRepository(Booking);

// Day 365: Add read replica for reporting
const readReplica = createReadOnlyDataSource({
  host: 'ikaro-read-replica.postgres.googleapis.com',
  database: 'ikaro',
});

// Reporting queries use read replica (same queries, different connection)
const analyticsRepository = readReplica.getRepository(Booking);
```

### Multi-Tenant Query Patterns

Cloud SQL with TypeORM enables efficient tenant-scoped queries:

```typescript
// Automatically filtered by tenant
@Injectable()
export class BookingRepository extends Repository<Booking> {
  async findByTenant(tenantId: string): Promise<Booking[]> {
    return this.find({
      where: { tenantId },
    });
  }
}

// At database level, composite indexes ensure performance
// INDEX: (tenant_id, status, created_at)
```

Per `docs/TENANT_ISOLATION_STRATEGY.md`, this is the primary isolation mechanism.

### PostgreSQL 17 Choice

> **Revised 2026-07-17 (M17-S13 discovery)** — superseded the original PostgreSQL 15 pick below. That decision was made at project inception (~2023, when PG16 was brand new and "🟡 Checking" on Cloud SQL) and was never revisited as the project sat in development. M17-S13 is the first story to ever provision a real Cloud SQL instance — zero data exists anywhere yet — making this the cheapest possible moment to correct a stale pin: no migration, no downtime, no risk.

| Criterion | PG 16 | PG 17 | PG 18 |
|-----------|-------|-------|-------|
| **Stability** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Cloud SQL maturity** | Long-proven | ✅ 1+ year of Cloud SQL production hardening (GA Sept 2024) | 🟡 Cloud SQL support only added 2026 — least battle-tested *as a managed service* despite stable upstream |
| **LTS runway** | Shorter | Well past 2027 (PG15's old ceiling) | Longest, but immature on Cloud SQL today |

**Decision:** PostgreSQL 17 — same "stability + modern features" criterion the original 2023 decision used, correctly re-applied to today's landscape instead of carrying a 3-version-old pin into go-live. PG18 was considered and rejected only for *managed-service* immaturity (Cloud SQL-specific HA/PITR/flag hardening), not upstream engine risk — revisit at the next deliberate version review.

<details>
<summary>Original 2023 decision (superseded — kept for history)</summary>

| Criterion | PG 14 | PG 15 | PG 16 |
|-----------|-------|-------|-------|
| **Stability** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 🟡 Newer |
| **Performance** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Cloud SQL Support** | ✅ Available | ✅ Available | 🟡 Checking |
| **LTS Until** | 2026 | 2027 | 2028 |

Original decision: PostgreSQL 15 (sweet spot of stability + modern features).

</details>

### Cloud SQL Terraform

Illustrative; the real definition is `infra/terraform/modules/database/main.tf` (instance `ikaro-db-<env>`, private IP only).

```hcl
resource "google_sql_database_instance" "ikaro" {
  name             = "ikaro-db-${var.environment}"
  database_version = "POSTGRES_17"
  region           = "southamerica-east1"

  settings {
    tier = "db-f1-micro"  # MVP

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.enable_pitr
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.private_net.id
      enable_private_path_access                    = true
    }
  }
}
```

### Cost Impact
- **MVP:** $10-15/month
- **Growth:** Scales linearly ($50-100/month at 1M+ bookings)
- **Operations:** Zero (fully managed)

### References
- Database Schema: `docs/DATABASE_SCHEMA.md`
- Multi-Tenancy: `docs/TENANT_ISOLATION_STRATEGY.md`
- Deployment: `docs/DEPLOYMENT_STRATEGY.md`

---

## 7. SECRETS MANAGEMENT: GCP Secret Manager (Vault: historical option, not planned)

### Decision
**Phase 1 (MVP):** GCP Secret Manager (simple, managed)  
**Historical option (not planned):** HashiCorp Vault, weighed for a multi-cloud future

### Phase 1: GCP Secret Manager

#### Why GCP Secret Manager for MVP

| Criterion | Vault | GCP Secret Manager |
|-----------|-------|---|
| **Cost** | $200-500/month | $0-6/month |
| **Complexity** | High (ops burden) | Low (managed) |
| **MVP Need** | Overkill | Perfect |
| **Learning Curve** | Steep | Shallow |
| **Cloud-Agnostic** | ✅ Yes | ❌ GCP-only |

**Decision:** GCP Secret Manager for MVP (simpler, cheaper, cloud-native)

#### Secrets Stored

Per `base_secret_ids` in `infra/terraform/modules/secrets/main.tf`:

```
├─ db-password, db-migrator-password (runtime DML role and DDL-capable migrator role)
├─ jwt-secret (JWT signing key)
├─ google-oauth-client-id, google-oauth-client-secret (OAuth client)
├─ internal-api-key, platform-admin-key, web-internal-key (service-to-service and operator keys)
├─ hotsite-revalidate-secret, turnstile-secret-key
├─ brevo-smtp-key (email provider)
├─ openrouter-api-key, openrouter-management-api-key, anthropic-api-key, openai-api-key (chatbot LLM providers)
└─ cloudflare-api-token (production only)
```

The authoritative list is `base_secret_ids` in `infra/terraform/modules/secrets/main.tf`. Non-secret values (the Pub/Sub project, bucket names) are plain environment variables, not secrets.

#### Terraform Configuration

Illustrative only; real: `infra/terraform/modules/secrets/main.tf` (no `database-url` secret exists; the backend gets `db-password` as `DB_PASSWORD` through Cloud Run `secret_env_vars`).

```hcl
resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
  
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = var.database_url
}

# Grant Cloud Run access to secrets
resource "google_secret_manager_secret_iam_member" "backend_access" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_cloud_run_service.backend.service_account}"
}
```

#### NestJS Integration

Illustrative only; real: `apps/backend/src/config/env.validation.ts` (Zod-validated `process.env`; secrets arrive as env vars from Cloud Run, no `.env.prod`).

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({
      // Use GCP Secret Manager
      envFilePath: '.env.prod',
    }),
  ],
})
export class AppModule {}

@Injectable()
export class ConfigService {
  get databaseUrl(): string {
    return process.env.DATABASE_URL;
  }
}
```

### Historical option: HashiCorp Vault

#### When to Migrate

- **Trigger:** Planning AWS/Azure expansion
- **Timeline:** Year 1-2 when multi-cloud needed
- **Cost:** $200-500/month (self-hosted on VM)

#### Why Vault for Multi-Cloud

```typescript
// Same interface everywhere
export interface SecretsProvider {
  getSecret(path: string): Promise<string>;
}

// Phase 1: GCP
export class GcpSecretsProvider implements SecretsProvider {
  async getSecret(path: string): Promise<string> {
    // Call GCP Secret Manager
  }
}

// Historical option: Vault
export class VaultSecretsProvider implements SecretsProvider {
  async getSecret(path: string): Promise<string> {
    // Call Vault API (works on GCP, AWS, Azure)
  }
}

// Application: ZERO CHANGES
// Swap implementations at startup via DI
```

#### Migration Path

```
Month 1-12:  GCP Secret Manager ($5/month)
Month 13:    Deploy Vault on small VM ($50/month)
Month 14:    Migrate secrets (migration scripts provided)
Month 15+:   Ready for AWS/Azure (same Vault everywhere)
```

### Cost Impact
- **Phase 1:** $0-6/month (GCP, minimal)
- **Historical option (Vault):** $200-500/month, enterprise-grade
- **No cost to switch:** Just configuration changes

### References
- Secrets: `base_secret_ids` in `infra/terraform/modules/secrets/main.tf`
- API Contracts: `docs/API_CONTRACTS.md`
- Deployment: `docs/DEPLOYMENT_STRATEGY.md`

---

## 8. INFRASTRUCTURE AS CODE: Terraform

### Decision
**Terraform** with the GCP provider (GCP only; other providers were a historical illustration)

### Why Terraform

| Criterion | Manual Setup | Terraform |
|-----------|---|---|
| **Reproducibility** | ❌ Manual steps error-prone | ✅ Identical every time |
| **Documentation** | ❌ Outdated quickly | ✅ Code is documentation |
| **Cloud Migration** | ❌ Rebuild everything | ✅ Change provider, redeploy |
| **Version Control** | ❌ History lost | ✅ Git history of all changes |
| **Team Onboarding** | ❌ Complex runbooks | ✅ Code review process |

### Repository Structure

> Illustrative layout from the original plan. The real one is `infra/terraform/{foundation,envs/staging,envs/prod,modules}` (see `docs/INFRASTRUCTURE_SETUP.md`); bucket, topic and secret names in the snippets below are placeholders, the real ones come from the modules.

```
terraform/
├── main.tf                 # GCP resources (MVP)
├── variables.tf            # Input variables
├── outputs.tf              # Output values
├── terraform.gcp.tfvars    # GCP-specific values
├── terraform.aws.tfvars    # AWS-specific (NOT planned: GCP-only decision; kept as a design illustration)
└── providers.tf            # Provider configuration
```

### GCP Resources (MVP)

```hcl
# terraform/main.tf

# Cloud SQL Database
resource "google_sql_database_instance" "postgres" {
  name             = "ikaro-postgres"
  database_version = "POSTGRES_17"
  # ... (see section 6)
}

# Cloud Run — backend, BFF, and web (Next.js SSR) all run as containers
resource "google_cloud_run_v2_service" "backend" {
  name     = "ikaro-backend"
  location = "southamerica-east1"
  # ... (real definition: infra/terraform/modules/cloudrun-service/)
}

# Cloud Storage — media uploads only (tenant photos), NOT for the frontend
resource "google_storage_bucket" "media" {
  name     = "ikaro-media-prod"
  location = "US"
  # ... (real definition: infra/terraform/modules/storage/)
}

# Cloud Pub/Sub
resource "google_pubsub_topic" "domain_events" {
  name = "ikaro-domain-events"
  # ... (real definition: infra/terraform/modules/pubsub/)
}

# GCP Secret Manager
resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
  # ... (real definition: infra/terraform/modules/secrets/)
}

# Authoritative Terraform: infra/terraform/ (layout in docs/INFRASTRUCTURE_SETUP.md)
```

### Multi-Cloud Ready (historical illustration — not planned)

```hcl
# terraform/providers.tf

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

provider "aws" {
  region = var.aws_region
}
```

### Deployment Commands

```bash
# MVP (GCP)
terraform apply -var-file=terraform.gcp.tfvars

# Watch deployment
terraform show

# Add AWS (illustration only: not planned, the project is GCP-only)
terraform apply -var-file=terraform.aws.tfvars
# Same resources, different provider
```

### Version Control

All Terraform files in Git:
- ✅ History of all infrastructure changes
- ✅ Code review process for infrastructure changes
- ✅ Easy rollback if needed

### Cost Tracking

```hcl
# terraform/variables.tf
variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}

# terraform/main.tf
resource "google_sql_database_instance" "postgres" {
  settings {
    tier = var.db_tier  # db-f1-micro in both environments today
    # Automatically different costs per environment
  }
}
```

### Local Development

Illustrative only; real: root `package.json` scripts (`pnpm infra:up`, `pnpm dev`, `pnpm up`; there is no `pnpm start`) and `apps/backend/src/config/env.validation.ts` (`DB_HOST` etc., not `DATABASE_URL`).

```bash
# Local setup (docker/docker-compose.yml: postgres, pubsub, gcs, mailhog)
pnpm infra:up

# Local environment variables
export DATABASE_URL=postgres://localhost/ikaro
export PUBSUB_PROJECT_ID=ikaro-local

# Same code works everywhere
pnpm start
```

### Cost Impact
- **Tool:** $0 (open source)
- **Benefits:** Infrastructure consistency, easy migration

### References
- Architecture: `docs/ARCHITECTURE.md`
- Deployment: `docs/DEPLOYMENT_STRATEGY.md`
- Infrastructure: `docs/INFRASTRUCTURE_TOOLING_MAP.md`

---

## 9. EMAIL PROVIDER: Brevo (prod) / Mailhog (local)

### Decision
**Brevo** in production, **Mailhog** for local dev — accessed exclusively through the `IEmailSender` port (`BrevoEmailAdapter` / `MailhogEmailAdapter`), never called directly from application code.

### Why Brevo
High-deliverability free tier (3k–10k emails/month) suitable at MVP scale; standard SMTP/API adapter shape, so swapping providers later means changing one adapter behind `IEmailSender`, not touching any use case or event handler.

**Added 2026-08-04** (a full `/docs-audit` sweep found the previously-documented provider, SendGrid/AWS SES, was never actually implemented — stale across 6 docs at once because none of them had a single canonical decision record to point to. This section exists so that's no longer true.)

---

## 10. PAYMENT PROVIDERS: Asaas (BRL) + Stripe (USD) behind one port *(planned, Billing milestone)*

**Added 2026-10-29** (promoted from the tenant-billing discovery; nothing under `contexts/billing` exists yet).

### Decision
Ikaro charges its tenants through **Asaas for BRL** (the first adapter, Brazil) and **Stripe for USD** (the same milestone sequence, released only after its real account and sandbox flow is verified), both behind one `BillingProviderPort` defined in Ikaro's terms — never a provider type beyond the adapter. **The provider owns the money** (charging, retries, hosted payment pages, receipts, refunds, chargebacks): Ikaro never stores card data and never renders a card form; it keeps only the status it needs, mirrored from the provider by webhook plus a reconcile job.

| Provider | Verdict | Why |
|---|---|---|
| **Asaas** | First adapter (BRL) | Pix, boleto and card on one hosted invoice (`billingType UNDEFINED`); recurring Pix (Pix Automático) supported; webhook with a token header, at-least-once delivery and a documented event id; NFS-e emitted by the provider with the charge. Recurring Pix and NFS-e emission need a PJ account (a CNPJ active 6+ months). |
| **Stripe** | USD adapter (cards only) | Best API, portal and hosted invoices; **Invoices** with `automatic_tax` are the hosted object. A Brazilian CNPJ account settles in BRL only (no USD payouts, no ACH), so the first US account is that account; an Atlas US entity is a later option only if ACH or USD payouts are needed. Stripe Tax calculates only where the account is registered and never files — registration is the accountant's call. |
| **Appmax** | Rejected | E-commerce checkout; webhooks, NFS-e and Pix Automático are not confirmed for a recurring-subscription use. |

### Consequences
- **No provider subscriptions in the baseline:** Ikaro issues its own charges so plan changes at period boundaries, dated price versions and the early invoice stay Ikaro's policy; optional provider-collected card billing (a hosted recurring checkout) is a later slice that mirrors provider-generated charges into ordinary charges.
- **Test environments never touch a live provider:** a `FakeBillingProvider` and one contract suite run on every PR, the provider sandboxes run nightly and in staging, and a live adapter refuses to start outside production — `docs/TESTING_STRATEGY.md` § Testing the billing provider — fake, sandbox, contract suite and clock.
- **Ikaro absorbs provider fees** in the list price.
- Secrets (`ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, sandbox and live separately) live in Secret Manager — § 7 above.
- The verified provider facts, the account-opening checklist and the launch gates: `docs/discovery/tenant-billing/tenant-billing_PROVIDERS.md`; the decision's context: `docs/discovery/tenant-billing/tenant-billing.md` § 3.

---

## 📊 COST SUMMARY

### MVP (Month 1)

| Component | Cost | Notes |
|-----------|------|-------|
| Cloud Run (backend + BFF + web) | $20 | 10-30 requests/sec across 3 services |
| Cloud SQL db-f1-micro | $15 | 0.6 GB RAM, 100 GB storage |
| Pub/Sub | $5 | 10K events/day |
| Cloud Storage (media only) | $1 | Tenant photo uploads |
| Cloud Scheduler | $1 | 8 cron jobs ($0.10/job/month) |
| Secret Manager | $1 | ~15 secrets |
| **TOTAL** | **~$43/month** | Lean, production-ready |

### Growth Phase (Month 12)

| Component | Cost | Notes |
|-----------|------|-------|
| Cloud Run (backend + BFF + web) | $120 | 100-200 requests/sec |
| Cloud SQL db-n1-standard-1 | $100 | 3.75 GB RAM, 500 GB storage |
| Pub/Sub | $40 | 100K events/day |
| Cloud Storage (media) | $10 | Growing photo library |
| Cloud Scheduler | $1 | 8 cron jobs |
| Secret Manager | $1 | ~15 secrets |
| **TOTAL** | **~$272/month** | Proven traffic |

### Scale Phase (Month 24)

| Component | Cost | Notes |
|-----------|------|-------|
| Cloud Run (backend + BFF + web) | $300 | 500-1000 requests/sec |
| Cloud SQL db-n1-standard-4 | $300 | 15 GB RAM, read replicas |
| Pub/Sub | $100 | 500K events/day |
| Cloud Storage (media) | $30 | Large photo library |
| Cloud Scheduler | $1 | 8 cron jobs |
| Secret Manager | $1 | ~15 secrets |
| **TOTAL** | **~$732/month** | Approaching scale |

### vs. Wrong Approach

```
Kubernetes from Day 1: $300+/month minimum
├─ GKE cluster: $200-300/month
├─ Operations team: $???
└─ No traffic yet: Wasted capacity

Year 2 (with actual traffic): $1-5k/month
```

---

## 🎯 SCALING PATH (No Refactoring)

### Stage 1: MVP (Month 1-3)

```
Architecture: TypeORM + NestJS → Cloud Run + Cloud SQL
Traffic: 10-1000 users
Cost: $50/month
Code Changes: Zero
```

### Stage 2: Growth (Month 3-12)

```
Architecture: Same code, scaled infrastructure
Traffic: 1K-100K users
Additions:
├─ Database read replicas (one-click in Cloud Console)
├─ Cloud Run min-instances bumped to avoid cold starts
└─ Multi-region Cloud Run if latency becomes an issue (config change)
Cost: ~$272/month
Code Changes: Zero
```

### Stage 3: Scale (Month 12+)

```
Architecture: Same code, further scaled
Traffic: 100K-1M users
Additions:
├─ Cloud SQL High Availability (one-click)
├─ Load balancing (config)
└─ API caching layer (optional)
Cost: $800/month → $2k/month
Code Changes: Zero
```

### Stage 4: Enterprise (Year 2+)

```
Architecture: Same code, Kubernetes if needed
Traffic: 1M+ users
Optional:
├─ Kubernetes (if cost > $2k/month)
├─ Apache Kafka (if event volume > 10M/day)
├─ Multi-cloud (AWS/Azure)
└─ Vault (cloud-agnostic secrets)
Cost: Varies by choice
Code Changes: Zero (swap implementations via DI)
```

---

## 🔐 SECURITY CONSIDERATIONS

### Multi-Tenancy Isolation

Per `docs/TENANT_ISOLATION_STRATEGY.md`:

- ✅ **Database level:** Composite FKs enforce tenant isolation
- ✅ **API level:** JWT includes tenantId, validated on every request
- ✅ **Application level:** TypeORM queries automatically filtered by tenant
- ✅ **Infrastructure level:** Cloud Run runtime service accounts are per service (`ikaro-<service>`), not per tenant; tenant scoping is enforced in the application and the database

### Secrets Rotation

No automatic rotation is configured: the database passwords (`db-password`, `db-migrator-password`) and the JWT secret are plain Secret Manager secrets, rotated by adding a new secret version.

### Encryption

- ✅ **In Transit:** HTTPS enforced on all endpoints
- ✅ **At Rest:** Cloud SQL encrypted (AES-256)
- ✅ **Secrets:** GCP Secret Manager encrypted

### Audit Logging

Per `docs/OBSERVABILITY_STRATEGY.md`:

```
gcloud logging read "resource.type=cloud_sql_database OR resource.type=cloud_run_revision"
```

---

## 📚 CROSS-REFERENCES

This tech stack integrates with all architectural decisions:

| Document | Integration |
|----------|---|
| `docs/DOMAIN_MODEL.md` | TypeORM entities map to aggregates |
| `docs/DOMAIN_EVENTS.md` | Pub/Sub publishes events with exact envelope |
| `docs/USE_CASES.md` | NestJS modules implement use cases |
| `docs/BOUNDED_CONTEXTS.md` | NestJS modules map to contexts |
| `docs/TENANT_ISOLATION_STRATEGY.md` | Composite FKs, multi-tenant queries |
| `docs/TESTING_STRATEGY.md` | NestJS testing infrastructure |
| `docs/ARCHITECTURE.md` | Hexagonal pattern with these technologies |
| `docs/DATABASE_SCHEMA.md` | TypeORM entities + Cloud SQL |
| `docs/API_CONTRACTS.md` | NestJS controllers + Next.js clients; § Billing — Provider Webhooks and Internal API for the payment-provider routes and § Billing — Manager API for the manager billing page |
| `infra/terraform/modules/secrets/main.tf` (`base_secret_ids`) | Secrets in Secret Manager |

---

## ⚠️ REVISITING THIS DOCUMENT

This tech stack decision is **not immutable**:

- **Review cadence (no review is currently scheduled — see the footer):** monthly for cost vs. traffic and tier, quarterly for new versions and security updates, annually for major architectural changes

**Revision Process:**
1. Document proposed change
2. Impact analysis (cost, performance, effort)
3. Team review
4. Implementation plan
5. Commit to Git with rationale

---

## ✅ DECISION CHECKLIST (historical — pre-development, all superseded by what shipped)

Before development begins, confirm:

- [ ] **All stakeholders reviewed** this document
- [ ] **Cost projections approved** ($50/month MVP)
- [ ] **Scalability path understood** (no refactoring needed)
- [ ] **Team comfortable with** TypeORM, NestJS, Next.js
- [ ] **Local dev environment** tested (docker-compose)
- [ ] **Terraform scaffolding** prepared
- [ ] **GCP project** configured and billing enabled
- [ ] **GitHub** secrets configured for CI/CD

---

## 📋 NEXT STEPS (historical — the original pre-development plan; delivery is tracked in `plan/`)

### Before Development (Week 1)
1. [ ] Terraform scaffold created and tested
2. [ ] docker-compose.yml ready for local dev
3. [ ] GCP resources provisioned (via Terraform)
4. [ ] Repository structure created
5. [ ] CI/CD pipeline setup

### During Development (Weeks 2+)
1. [ ] Implement UC-001 (Guest Requests Booking)
2. [ ] Verify multi-tenant isolation working
3. [ ] Deploy to Cloud Run for testing
4. [ ] Monitor costs (should be minimal)

### Post-MVP (Month 4+)
1. [ ] Gather real traffic data
2. [ ] Re-evaluate costs vs. actual usage
3. [ ] Plan for Phase 2 (read replicas, Kafka, etc.)
4. [ ] Document learnings and optimizations

---

## 📞 REFERENCES & RESOURCES

**Official Documentation:**
- NestJS: https://docs.nestjs.com
- TypeORM: https://typeorm.io
- Next.js: https://nextjs.org
- GCP: https://cloud.google.com/docs
- Terraform: https://www.terraform.io/docs

**Performance:**
- Core Web Vitals: https://web.dev/vitals
- PostgreSQL Optimization: https://wiki.postgresql.org/wiki/Performance_Optimization

---

**Document Version:** 1.0 (historical decision record; later edits are dated where they occur)  
**Originally written:** 2026-05-12  
**Next Review:** none scheduled  
**Status:** Implemented (see the note under the title)
