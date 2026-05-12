# Tech Stack Architecture & Decisions - BeloAuto
**Date:** 2026-05-12  
**Status:** Final Pre-Development Decision Record  
**Audience:** Development team, stakeholders, AI agents  
**Related Documents:** See cross-references throughout

---

## Executive Summary

This document defines the technology stack for BeloAuto, a multi-tenant SaaS platform for car wash booking and loyalty management. The stack is designed to be **production-grade from day 1**, **cost-efficient for MVP**, and **scalable without refactoring**.

**Philosophy:**
- ✅ Robust: Every component proven at enterprise scale
- ✅ Lean: Start at $50/month, not $300+
- ✅ Future-proof: Scale to 1M users without code changes
- ✅ Cloud-agnostic: Easy migration path to AWS/Azure

**Key Metrics:**
- MVP Infrastructure Cost: $50-100/month
- Target Scaling: 1 → 1M users (same code)
- Estimated Development Ready: 2-3 weeks
- No Technical Debt: Built right from start

---

## 1. BACKEND ORM: TypeORM

### Decision
**TypeORM v0.3+** with PostgreSQL 15

### Why TypeORM

| Criterion | Evaluation |
|-----------|-----------|
| **Maturity** | ⭐⭐⭐⭐⭐ Since 2016, proven at Shopify/Airbnb scale |
| **Multi-Tenancy** | ⭐⭐⭐⭐⭐ Query builder supports complex tenant filtering |
| **Performance** | ⭐⭐⭐⭐⭐ Handles 100M+ rows efficiently with proper indexing |
| **Development Speed** | ⭐⭐⭐⭐ Decorator-based, integrates perfectly with NestJS |
| **Cloud Agnostic** | ⭐⭐⭐⭐⭐ Works identically on PostgreSQL everywhere |
| **Cost** | ⭐⭐⭐⭐⭐ Open source, $0 |

### Key Capabilities for BeloAuto

#### Multi-Tenant Query Patterns

The booking aggregates (See `docs/02-DOMAIN_MODEL.md`) require efficient multi-tenant querying. TypeORM's QueryBuilder enables:

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

Aligns perfectly with composite foreign key strategy defined in `docs/06-TENANT_ISOLATION_STRATEGY.md`:

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

TypeORM supports the immutable append-only semantics needed for `LoyaltyEntry` (See `docs/02-DOMAIN_MODEL.md`):

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
- Domain Model: `docs/02-DOMAIN_MODEL.md`
- Multi-Tenancy: `docs/06-TENANT_ISOLATION_STRATEGY.md`
- Database Schema: `docs/13-DATABASE_SCHEMA.md`

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

NestJS module structure directly maps to bounded contexts defined in `docs/05-BOUNDED_CONTEXTS.md`:

```
src/
├── booking/                    # Booking Bounded Context
│   ├── domain/
│   │   ├── entities/
│   │   ├── value-objects/
│   │   └── services/
│   ├── application/
│   │   └── use-cases/          # UC-001 through UC-009
│   ├── infrastructure/
│   │   ├── repositories/       # TypeORM repositories
│   │   └── event-publishers/
│   └── booking.module.ts
│
├── loyalty/                    # Loyalty Bounded Context
│   ├── domain/
│   ├── application/
│   └── loyalty.module.ts
│
├── notification/               # Notification Bounded Context
│   └── notification.module.ts
│
└── app.module.ts
```

#### Testing Integration

Aligns with `docs/08-TESTING_STRATEGY.md` testing pyramid:

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

Coverage target: 80% (per `docs/08-TESTING_STRATEGY.md`).

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

- v12 is pre-release (less production data)
- Marginal performance gains not worth learning curve
- v11 LTS stable through 2026
- Can upgrade post-MVP

### Cost Impact
- **Infrastructure:** $0 (open source)
- **Development:** Fast iteration with CLI generation
- **Performance:** Optimized for concurrent requests

### References
- Bounded Contexts: `docs/05-BOUNDED_CONTEXTS.md`
- Use Cases: `docs/04-USE_CASES.md`
- Testing: `docs/08-TESTING_STRATEGY.md`
- Architecture: `docs/11-ARCHITECTURE.md`

---

## 3. FRONTEND: Next.js with React 18

### Decision
**Next.js 14+** with **React 18**  
**Deployment:** Self-hosted on GCP Cloud Storage + CDN (NOT Vercel)

### Why Next.js

| Criterion | Evaluation |
|-----------|-----------|
| **Maturity** | ⭐⭐⭐⭐⭐ Netflix, Hulu, major SaaS companies |
| **Built-in Optimization** | ⭐⭐⭐⭐⭐ Automatic code splitting, image optimization |
| **Full-Stack** | ⭐⭐⭐⭐⭐ Can integrate with NestJS backend cleanly |
| **Deployment** | ⭐⭐⭐⭐⭐ Static export or server rendering |
| **Development** | ⭐⭐⭐⭐⭐ Hot module reloading, excellent DX |
| **Cost** | ⭐⭐⭐⭐⭐ $0 open source, self-hosted saves vendor fees |

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
// lib/contexts/TenantContext.tsx
export const TenantContext = createContext<TenantContextType>(null);

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
    <TenantContext.Provider value={{ tenantId, tenantSlug, switchTenant }}>
      {children}
    </TenantContext.Provider>
  );
}
```

This aligns with `docs/06-TENANT_ISOLATION_STRATEGY.md` - Client enforces tenant awareness.

#### API Integration Pattern

Clean separation from NestJS backend:

```typescript
// pages/api/bookings/[id].ts - BFF pattern
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const tenantSlug = req.headers['x-tenant-slug'];

  // Option A: Call NestJS backend
  const booking = await fetch(
    `${process.env.BACKEND_URL}/bookings/${id}`,
    {
      headers: {
        'X-Tenant-Slug': tenantSlug,
        'Authorization': `Bearer ${req.cookies.jwt}`,
      }
    }
  ).then(r => r.json());

  return res.status(200).json(booking);
}
```

**Key:** Frontend doesn't directly call TypeORM - always through API (enforces multi-tenancy).

### Deployment Strategy (Cost-Conscious)

#### Day 1-100: Minimal Cost

```
├─ Next.js compiled to static files
├─ Deploy to GCP Cloud Storage ($0.02/GB/month)
├─ Cloud CDN caching ($0.085/GB served)
├─ Example: 100K users, 5MB app size
│  ├─ Storage: $0.02/month
│  ├─ CDN (10GB/month): $0.85/month
│  └─ Total: <$1/month
```

#### Day 365+: Scaled

```
├─ Same deployment
├─ More aggressive caching (headers, TTL)
├─ Multiple CDN edge locations
├─ Cost: $50-100/month at 1M users
```

**Why NOT Vercel:**
- Vercel: $20/month minimum + $0.15/GB bandwidth
- GCP: $0 storage + $0.12/GB CDN (save 80% on bandwidth)
- Self-hosted saves vendor lock-in

### React 18 Choice

| Criterion | React 18 | React 19 |
|-----------|----------|----------|
| **Stability** | ⭐⭐⭐⭐⭐ Battle-tested | ⭐⭐⭐⭐ Newer |
| **Ecosystem** | ⭐⭐⭐⭐⭐ All libraries support | 🟡 Some pre-release |
| **Performance** | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐⭐⭐ Marginal gains |
| **Team Familiarity** | ⭐⭐⭐⭐⭐ Standard | 🟡 New patterns |

**Decision:** React 18 (proven, stable, no downside)

### Performance Targets

Per `docs/10-OBSERVABILITY_STRATEGY.md`, Next.js optimizations help:

```
- Largest Contentful Paint (LCP): < 2.5s (automatic with next/image)
- First Input Delay (FID): < 100ms (React 18 concurrent rendering)
- Cumulative Layout Shift (CLS): < 0.1 (next/image prevents layout shift)
```

### Cost Impact
- **Infrastructure:** $0-1/month (MVP)
- **Development:** Fast, excellent DX
- **Performance:** Built-in optimization

### References
- Multi-Tenancy: `docs/06-TENANT_ISOLATION_STRATEGY.md`
- API Contracts: `docs/14-API_CONTRACTS.md`
- Observability: `docs/10-OBSERVABILITY_STRATEGY.md`

---

## 4. EVENT BUS: GCP Pub/Sub (MVP) → Kafka (Future)

### Decision
**Phase 1 (MVP):** GCP Pub/Sub (serverless, managed)  
**Phase 2 (Year 1-2):** Apache Kafka (if needed for multi-cloud)

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

Aligns perfectly with domain events defined in `docs/03-DOMAIN_EVENTS.md`:

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

// NestJS subscriber (consumes events)
export class BookingCompletedHandler {
  @OnEvent('booking.completed')
  async handleBookingCompleted(event: BookingCompletedEvent) {
    // UC-016: Create LoyaltyEntry when booking completes
    for (const line of event.lines) {
      await this.loyaltyService.recordCompletion(line);
    }
  }
}
```

This pattern scales from day 1 → year 2 unchanged.

### Multi-Tenant Event Filtering

Pub/Sub enforces tenant isolation at subscription level:

```typescript
// Each tenant gets isolated subscriptions
const subscriptionName = `projects/${projectId}/subscriptions/${tenantId}-booking-completed`;

await subscriber.createSubscription({
  subscription: subscriptionName,
  topic: 'projects/beloauto/topics/booking-completed',
  filter: `attributes.tenantId="${tenantId}"`, // Tenant-scoped
});
```

This aligns with `docs/06-TENANT_ISOLATION_STRATEGY.md` isolation rules.

### Cost Model

| Usage | Monthly Cost |
|-------|---|
| MVP (10K events/day) | $0-1 |
| Growth (100K events/day) | $5-10 |
| Scale (1M events/day) | $15-20 |
| Enterprise (10M events/day) | $150-200 |

**Key:** Linear cost scaling with actual usage (no over-provisioning).

### Guaranteed Delivery

Pub/Sub provides exactly-once semantics (critical for bookings):

```
BookingCompleted Event
├─ Published once (idempotent eventId)
├─ Delivered at-least-once (with retries)
├─ Processed exactly-once (idempotency in consumer)
└─ Result: LoyaltyEntry created once, guaranteed
```

### Future: Kafka Migration Path

If Phase 2 requires Kafka (analytics, stream processing), same interface:

```typescript
// Kafka Implementation (Phase 2+)
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
# docker-compose.yml
pubsub-emulator:
  image: google/cloud-sdk:emulators
  ports:
    - "8085:8085"
  environment:
    PUBSUB_PROJECT_ID: beloauto-local
```

### Cost Impact
- **MVP:** $0-5/month
- **Growth:** Scales linearly with usage
- **No operational overhead:** Google manages everything

### References
- Domain Events: `docs/03-DOMAIN_EVENTS.md`
- Bounded Contexts: `docs/05-BOUNDED_CONTEXTS.md`
- Multi-Tenancy: `docs/06-TENANT_ISOLATION_STRATEGY.md`

---

## 5. DEPLOYMENT: Cloud Run (MVP) → Kubernetes (Future)

### Decision
**Phase 1 (MVP):** GCP Cloud Run (serverless)  
**Phase 2 (Year 2+):** Kubernetes (GKE/EKS/AKS) only if needed

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
# Build Docker image
docker build -t gcr.io/project/beloauto-backend:latest .

# Deploy to Cloud Run
gcloud run deploy beloauto-backend \
  --image gcr.io/project/beloauto-backend:latest \
  --region us-central1 \
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
gcloud container clusters create beloauto-gke \
  --num-nodes 3 \
  --zone us-central1-a

# Deploy SAME IMAGE
kubectl apply -f kubernetes/deployment.yaml

# Application code: UNCHANGED
```

### Environment Variables

Cloud Run integrates with secrets (See `docs/21-TENANTS_SETTINGS_SCHEMA.md`):

```bash
gcloud run deploy beloauto-backend \
  --set-env-vars-from-file=.env.prod
```

### Networking

Cloud Run provides:
- ✅ Automatic HTTPS
- ✅ Automatic load balancing
- ✅ DDoS protection
- ✅ Firewall rules (optional)

### Observability

Built-in to Cloud Logging (per `docs/10-OBSERVABILITY_STRATEGY.md`):

```
gcloud logging read "resource.type=cloud_run_revision AND severity=ERROR"
```

### Local Development

Same Docker image runs locally:

```yaml
# docker-compose.yml
backend:
  build: ./backend
  ports:
    - "3000:3000"
  environment:
    DATABASE_URL: postgres://db:5432/beloauto
    PUBSUB_PROJECT_ID: beloauto-local
```

### Cost Impact
- **MVP:** $0-30/month
- **Growth:** Scales linearly ($50-100/month at scale)
- **Operations:** Zero (fully managed)

### References
- API Contracts: `docs/14-API_CONTRACTS.md`
- Observability: `docs/10-OBSERVABILITY_STRATEGY.md`
- Deployment: `docs/12-DEPLOYMENT_STRATEGY.md`

---

## 6. DATABASE: Cloud SQL PostgreSQL 15 (Managed)

### Decision
**GCP Cloud SQL PostgreSQL 15** (managed database, NOT self-hosted)

### Why Cloud SQL

| Criterion | Self-Hosted PG | Cloud SQL |
|-----------|---|---|
| **Backups** | You script/manage | Automatic, 7-day retention |
| **Updates** | You schedule/test | Google handles (rolling) |
| **High Availability** | You build/test | Built-in (replicas) |
| **Monitoring** | You setup | Built-in (Cloud Console) |
| **Day 1 Cost** | $0 + your time | $10-15/month |
| **Day 100 Cost** | $100 + ops | $30-50/month |
| **Reliability** | 99.0% | 99.95% SLA |
| **On-Call Cost** | Database down = $??? | Google guarantees it |

### Database Schema

Fully specified in `docs/13-DATABASE_SCHEMA.md` with:
- ✅ All tables include `tenant_id` (multi-tenancy)
- ✅ Composite FKs prevent cross-tenant access
- ✅ Proper indexing with `tenant_id` prefix
- ✅ Audit columns on all tables

### Cloud SQL Features

#### Automatic Backups

```
Daily backups (7-day retention) included
├─ Point-in-time recovery (35 days)
├─ Automated for high availability
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
  host: 'beloauto-read-replica.postgres.googleapis.com',
  database: 'beloauto',
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

Per `docs/06-TENANT_ISOLATION_STRATEGY.md`, this is the primary isolation mechanism.

### PostgreSQL 15 Choice

| Criterion | PG 14 | PG 15 | PG 16 |
|-----------|-------|-------|-------|
| **Stability** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 🟡 Newer |
| **Performance** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Cloud SQL Support** | ✅ Available | ✅ Available | 🟡 Checking |
| **LTS Until** | 2026 | 2027 | 2028 |

**Decision:** PostgreSQL 15 (sweet spot of stability + modern features)

### Cloud SQL Terraform

```hcl
resource "google_sql_database_instance" "beloauto" {
  name             = "beloauto-postgres"
  database_version = "POSTGRES_15"
  region           = "us-central1"

  settings {
    tier = "db-f1-micro"  # MVP

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
    }

    ip_configuration {
      ipv4_enabled                                  = true
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
- Database Schema: `docs/13-DATABASE_SCHEMA.md`
- Multi-Tenancy: `docs/06-TENANT_ISOLATION_STRATEGY.md`
- Deployment: `docs/12-DEPLOYMENT_STRATEGY.md`

---

## 7. SECRETS MANAGEMENT: GCP Secret Manager (MVP) → Vault (Future)

### Decision
**Phase 1 (MVP):** GCP Secret Manager (simple, managed)  
**Phase 2 (Year 1-2):** HashiCorp Vault (cloud-agnostic, when multi-cloud needed)

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

Per `docs/21-TENANTS_SETTINGS_SCHEMA.md` and `docs/14-API_CONTRACTS.md`:

```
├─ database-url (PostgreSQL connection string)
├─ jwt-secret (JWT signing key)
├─ oauth-client-secret (OAuth provider secret)
├─ pubsub-project-id (GCP project for Pub/Sub)
├─ storage-bucket-url (GCP Cloud Storage URL)
└─ email-api-key (Email provider API key)
```

#### Terraform Configuration

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

### Phase 2: HashiCorp Vault

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

// Phase 2: Vault
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
- **Phase 2:** $200-500/month (Vault, enterprise-grade)
- **No cost to switch:** Just configuration changes

### References
- Tenants Settings: `docs/21-TENANTS_SETTINGS_SCHEMA.md`
- API Contracts: `docs/14-API_CONTRACTS.md`
- Deployment: `docs/12-DEPLOYMENT_STRATEGY.md`

---

## 8. INFRASTRUCTURE AS CODE: Terraform

### Decision
**Terraform** with GCP provider (AWS/Azure providers as future paths)

### Why Terraform

| Criterion | Manual Setup | Terraform |
|-----------|---|---|
| **Reproducibility** | ❌ Manual steps error-prone | ✅ Identical every time |
| **Documentation** | ❌ Outdated quickly | ✅ Code is documentation |
| **Cloud Migration** | ❌ Rebuild everything | ✅ Change provider, redeploy |
| **Version Control** | ❌ History lost | ✅ Git history of all changes |
| **Team Onboarding** | ❌ Complex runbooks | ✅ Code review process |

### Repository Structure

```
terraform/
├── main.tf                 # GCP resources (MVP)
├── variables.tf            # Input variables
├── outputs.tf              # Output values
├── terraform.gcp.tfvars    # GCP-specific values
├── terraform.aws.tfvars    # AWS-specific (future)
└── providers.tf            # Provider configuration
```

### GCP Resources (MVP)

```hcl
# terraform/main.tf

# Cloud SQL Database
resource "google_sql_database_instance" "postgres" {
  name             = "beloauto-postgres"
  database_version = "POSTGRES_15"
  # ... (see section 6)
}

# Cloud Run Backend
resource "google_cloud_run_service" "backend" {
  name     = "beloauto-backend"
  location = "us-central1"
  # ... (see section 5)
}

# Cloud Storage for Frontend
resource "google_storage_bucket" "frontend" {
  name          = "beloauto-frontend"
  location      = "US"
  storage_class = "STANDARD"
}

# Cloud CDN
resource "google_compute_backend_bucket" "frontend_cdn" {
  name            = "beloauto-frontend-cdn"
  bucket_name     = google_storage_bucket.frontend.name
  cdn_policy {
    client_ttl          = 3600
    default_ttl         = 3600
    max_ttl             = 86400
    serve_while_stale   = 86400
  }
}

# Cloud Pub/Sub Topics
resource "google_pubsub_topic" "booking_events" {
  name = "booking-events"
}

# GCP Secret Manager
resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
}
```

### Multi-Cloud Ready (Future)

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

# Add AWS (future)
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
    tier = var.environment == "prod" ? "db-n1-standard-2" : "db-f1-micro"
    # Automatically different costs per environment
  }
}
```

### Local Development

```bash
# Local setup (docker-compose)
docker-compose up -d

# Local environment variables
export DATABASE_URL=postgres://localhost/beloauto
export PUBSUB_PROJECT_ID=beloauto-local

# Same code works everywhere
npm run start
```

### Cost Impact
- **Tool:** $0 (open source)
- **Benefits:** Infrastructure consistency, easy migration

### References
- Architecture: `docs/11-ARCHITECTURE.md`
- Deployment: `docs/12-DEPLOYMENT_STRATEGY.md`
- Infrastructure: `docs/19-INFRASTRUCTURE_TOOLING_MAP.md`

---

## 📊 COST SUMMARY

### MVP (Month 1)

| Component | Cost | Notes |
|-----------|------|-------|
| Cloud Run | $20 | 10-30 requests/sec |
| Cloud SQL db-f1-micro | $15 | 0.6 GB RAM, 100 GB storage |
| Pub/Sub | $5 | 10K events/day |
| Cloud Storage CDN | $9 | Frontend static files |
| Secret Manager | $1 | 6 secrets |
| **TOTAL** | **~$50/month** | Lean, production-ready |

### Growth Phase (Month 12)

| Component | Cost | Notes |
|-----------|------|-------|
| Cloud Run | $120 | 100-200 requests/sec |
| Cloud SQL db-n1-standard-1 | $100 | 3.75 GB RAM, 500 GB storage |
| Pub/Sub | $40 | 100K events/day |
| Cloud Storage CDN | $30 | More traffic |
| Secret Manager | $1 | 6 secrets |
| **TOTAL** | **~$300/month** | Proven traffic |

### Scale Phase (Month 24)

| Component | Cost | Notes |
|-----------|------|-------|
| Cloud Run | $300 | 500-1000 requests/sec |
| Cloud SQL db-n1-standard-4 | $300 | 15 GB RAM, read replicas |
| Pub/Sub | $100 | 500K events/day |
| Cloud Storage CDN | $50 | Scaled traffic |
| Secret Manager | $1 | 6 secrets |
| **TOTAL** | **~$800/month** | Approaching scale |

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
├─ Database read replicas (one-click)
├─ Cloud CDN caching (config change)
└─ Multi-region Cloud Run (config change)
Cost: $300/month
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

Per `docs/06-TENANT_ISOLATION_STRATEGY.md`:

- ✅ **Database level:** Composite FKs enforce tenant isolation
- ✅ **API level:** JWT includes tenantId, validated on every request
- ✅ **Application level:** TypeORM queries automatically filtered by tenant
- ✅ **Infrastructure level:** Cloud Run service accounts scoped to tenant data

### Secrets Rotation

Cloud SQL passwords auto-rotated by GCP.  
JWT secrets managed via Secret Manager with rotation policies.

### Encryption

- ✅ **In Transit:** HTTPS enforced on all endpoints
- ✅ **At Rest:** Cloud SQL encrypted (AES-256)
- ✅ **Secrets:** GCP Secret Manager encrypted

### Audit Logging

Per `docs/10-OBSERVABILITY_STRATEGY.md`:

```
gcloud logging read "resource.type=cloud_sql_database OR resource.type=cloud_run_revision"
```

---

## 📚 CROSS-REFERENCES

This tech stack integrates with all architectural decisions:

| Document | Integration |
|----------|---|
| `docs/02-DOMAIN_MODEL.md` | TypeORM entities map to aggregates |
| `docs/03-DOMAIN_EVENTS.md` | Pub/Sub publishes events with exact envelope |
| `docs/04-USE_CASES.md` | NestJS modules implement use cases |
| `docs/05-BOUNDED_CONTEXTS.md` | NestJS modules map to contexts |
| `docs/06-TENANT_ISOLATION_STRATEGY.md` | Composite FKs, multi-tenant queries |
| `docs/08-TESTING_STRATEGY.md` | NestJS testing infrastructure |
| `docs/11-ARCHITECTURE.md` | Hexagonal pattern with these technologies |
| `docs/13-DATABASE_SCHEMA.md` | TypeORM entities + Cloud SQL |
| `docs/14-API_CONTRACTS.md` | NestJS controllers + Next.js clients |
| `docs/21-TENANTS_SETTINGS_SCHEMA.md` | Secrets in Secret Manager |

---

## ⚠️ REVISITING THIS DOCUMENT

This tech stack decision is **not immutable**:

- **Monthly review:** Evaluate cost vs. traffic, adjust tier if needed
- **Quarterly review:** New version releases, security updates
- **Annual review:** Major architectural changes if needed

**Revision Process:**
1. Document proposed change
2. Impact analysis (cost, performance, effort)
3. Team review
4. Implementation plan
5. Commit to Git with rationale

---

## ✅ DECISION CHECKLIST

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

## 📋 NEXT STEPS

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

**Document Version:** 1.0  
**Last Updated:** 2026-05-12  
**Next Review:** 2026-08-12 (post-MVP)  
**Status:** Approved for development

