# Tech Stack - Production-Ready, Cost-Efficient, Scalable Architecture
**Date:** 2026-05-12  
**Philosophy:** Robust from Day 1 + Cost-Efficient MVP + Growth Path to Enterprise

---

## 🎯 THE RIGHT BALANCE

**NOT:** Over-engineered (Kubernetes from day 1)  
**NOT:** Under-engineered (shortcuts requiring refactoring)  
**YES:** Sweet spot - Production-grade with realistic costs

```
Day 1 Cost:        $500-1000/month (lean, proven architecture)
Day 100:           $2000-3000/month (same architecture, more capacity)
Day 365:           $5000-10k/month (approaching scale, still no refactoring)
Year 2 (1M users): $20k-50k/month (same code, Kubernetes only if needed)

vs. Bad approach:
Day 1:  $500/month (quick & dirty)
Day 180: $20k/month (OMG, rewrite everything)
```

---

## 1️⃣ BACKEND ORM: TypeORM ✅

**Decision:** TypeORM  
**Cost:** $0 (open source)  
**Maturity:** ⭐⭐⭐⭐⭐ (10+ years, battle-tested)

**Why:**
- ✅ Enterprise-ready queries for multi-tenant at scale
- ✅ Works perfectly at 10M rows (not just "works, but slow")
- ✅ No lock-in to specific database
- ✅ Clear migration path later (not a constraint)

**Scales without refactoring:**
```typescript
// Day 1: Simple query (10K bookings)
const bookings = await bookingRepository.find({ where: { tenantId } });

// Day 365: Optimized for 100M bookings (SAME CODE, just better indexes)
const bookings = await bookingRepository
  .createQueryBuilder('booking')
  .where('booking.tenantId = :tenantId', { tenantId })
  .andWhere('booking.status IN (:...statuses)', { statuses: ['APPROVED', 'PENDING'] })
  .leftJoinAndSelect('booking.lines', 'line')
  .orderBy('booking.createdAt', 'DESC')
  .take(50)
  .skip(0)
  .getMany();
```

---

## 2️⃣ BACKEND FRAMEWORK: NestJS v11 ✅

**Decision:** NestJS v11  
**Cost:** $0 (open source)  
**Maturity:** ⭐⭐⭐⭐⭐

**Why:**
- ✅ Proven at Netflix scale
- ✅ Ecosystem stable and mature
- ✅ TypeORM integration perfect
- ✅ Scales from 1 pod → 100+ pods without code changes

**No change from robust recommendation.** This is lean AND powerful.

---

## 3️⃣ FRONTEND: Next.js ✅

**Decision:** Next.js  
**Cost:** $0 locally hosted (not Vercel)  
**Maturity:** ⭐⭐⭐⭐⭐

**Why:**
- ✅ Production-ready, used by Netflix/Hulu
- ✅ Built-in optimization (automatic code splitting, image optimization)
- ✅ Self-hosted on GCP (no vendor lock-in to Vercel)
- ✅ Scales from simple → complex without refactoring

**Deployment Strategy (Cost-Conscious):**

```
Day 1 - Simple (Cost: $50/month)
├─ Next.js compiled to static files
├─ Deploy to GCP Cloud Storage
├─ Free tier CDN caching
└─ Cost: Minimal

Day 100 - Growth (Cost: $200-300/month)
├─ Same Next.js code
├─ Cloud Storage + Cloud CDN (for caching)
├─ Slightly faster, better edge caching
└─ No code changes

Day 365 - Scale (Cost: $500-1k/month)
├─ Same Next.js code
├─ Cloud CDN with multiple edge locations
├─ More aggressive caching rules
└─ No code changes
```

**NOT Vercel** (cheaper to self-host on GCP):
```
Vercel: $20/month minimum + $0.15 per GB bandwidth
GCP:    $0 static storage + $0.12 per GB CDN (less traffic = cheaper)
```

---

## 4️⃣ REACT VERSION: React 18 ✅

**Decision:** React 18  
**Cost:** $0 (open source)  
**Maturity:** ⭐⭐⭐⭐⭐

**Why:**
- ✅ Ecosystem fully mature
- ✅ All libraries support it
- ✅ No performance overhead

---

## 5️⃣ EVENT BUS: GCP Pub/Sub (NOT Kafka, NOT RabbitMQ)

**Decision:** GCP Pub/Sub (serverless, managed)  
**Cost:** $0-50/month for MVP  
**Maturity:** ⭐⭐⭐⭐⭐ (Google's own)

### Why GCP Pub/Sub Wins Here:

| Aspect | RabbitMQ | Kafka | GCP Pub/Sub |
|---|---|---|---|
| **Day 1 Cost** | $0 (container) + ops time | $500+ (cluster) | $0-5 |
| **Operations** | Must manage, monitor, fix | Must manage cluster | Zero (managed) |
| **Scaling** | Manual clusters (complex) | Manual clusters (complex) | Automatic |
| **Dev Cost** | Free (local Docker) | Free (local Docker) | Free emulator |
| **Future Path** | RabbitMQ clustering (pain) | Kafka as enterprise (good) | Migrate to Kafka later (easy) |
| **Mistakes/Outages** | We fix it | We fix it | Google fixes it |

### GCP Pub/Sub Architecture (Cost-Efficient):

```yaml
# Day 1-100: Minimal cost
# Local development
docker-compose:
  services:
    pubsub-emulator:  # Free local emulator
      image: google/cloud-sdk:emulators
      
# GCP Production (serverless, auto-scales)
# You pay only for messages published
# Example: 1M messages/day = ~$0.50/day = $15/month

# Day 365+: If you need Kafka features
# Migrate to Kafka Streams (same event interface)
# Cost: $500-2k/month for managed Kafka
```

**Cloud Agnostic Abstraction:**

```typescript
// Interface stays the same
export interface EventBus {
  publish(topic: string, event: DomainEvent): Promise<void>;
}

// Day 1-100: GCP Pub/Sub (cheap)
export class PubSubEventBus implements EventBus {
  async publish(topic: string, event: DomainEvent): Promise<void> {
    const message = Buffer.from(JSON.stringify(event));
    await this.pubsub.topic(topic).publish(message);
  }
}

// Day 365+: If needed, switch to Kafka (same interface)
export class KafkaEventBus implements EventBus {
  async publish(topic: string, event: DomainEvent): Promise<void> {
    await this.producer.send({
      topic,
      messages: [{ value: JSON.stringify(event) }],
    });
  }
}

// Application code: NEVER CHANGES
```

### ✅ Decision: **GCP Pub/Sub (MVP) → Kafka (when it becomes cost-inefficient)**

---

## 6️⃣ DEPLOYMENT: Cloud Run (NOT Kubernetes Day 1)

**Decision:** GCP Cloud Run  
**Cost:** $0-100/month for MVP  
**Maturity:** ⭐⭐⭐⭐⭐ (Google's own)

### Why Cloud Run is Perfect for "Cost-Conscious, Production-Ready":

| Aspect | Kubernetes | Cloud Run |
|---|---|---|
| **Day 1 Cost** | $100-300/month (minimum cluster) | $0-20/month (pay-per-use) |
| **Operations** | Manage nodes, updates, security | Zero (Google manages) |
| **Scaling** | Manual HPA config | Automatic (instant) |
| **Cold Starts** | Not applicable | ~100ms (acceptable for MVP) |
| **Day 100 Cost** | $200-500/month | $30-100/month |
| **Day 365 Cost** | $500-1k/month | $100-300/month |
| **Future: Multi-region** | Must setup (complex) | Built-in (one flag) |
| **Future: Migration Path** | Migrate to K8s (pain) | Easy: add Kubernetes later if needed |

### The Sweet Spot:

```
Cloud Run Day 1-365:
├─ Backend Pod (3000 users/day): $20-50/month
├─ Automatic scaling: 0 → 100 pods
├─ Global: deployed in 1 second
└─ Zero operations needed

Kubernetes Day 0: $200/month minimum
├─ 3-node cluster
├─ Manual scaling config
├─ You manage all upgrades
└─ 10x cost for same reliability

Cloud Run Day 1: You're proven, lean, ready to scale
Kubernetes Day 366: "We need reliability" → Migrate if needed (but you don't)
```

### NOT a Dead-End (Easy Migration Path):

```bash
# Cloud Run Day 365
gcloud run deploy beloauto-backend \
  --image gcr.io/project/beloauto:latest \
  --region us-central1

# Day 730: If you REALLY need Kubernetes for some reason
# Same Docker image
gcloud container clusters create beloauto-gke --num-nodes 3
kubectl apply -f kubernetes/deployment.yaml
# Image deployed identically (no code changes)
```

### ✅ Decision: **Cloud Run (MVP + Growth) → Kubernetes (only if Truly Needed)**

---

## 7️⃣ DATABASE: Cloud SQL PostgreSQL 15 (Managed, NOT Self-Hosted)

**Decision:** GCP Cloud SQL PostgreSQL 15  
**Cost:** $10-30/month MVP → $100-300/month at scale  
**Maturity:** ⭐⭐⭐⭐⭐

**Why Cloud SQL (NOT self-hosted PostgreSQL):**

| Aspect | Self-Hosted PG | Cloud SQL |
|---|---|---|
| **Backups** | You script & manage | Automatic, 7-day retention |
| **Updates** | You schedule, plan, test | Google handles (rolling) |
| **High Availability** | You build/test | Built-in (replicas) |
| **Monitoring** | You setup | Built-in (Google Cloud Console) |
| **Day 1 Cost** | $0 + your time | $10-15/month |
| **Day 100 Cost** | $100 + ops overhead | $30-50/month |
| **Day 365 Cost** | $300 + on-call stress | $100-200/month |
| **Scaling Reads** | Manual replica setup | One button: "Create read replica" |

**Cost Example (Day 1):**
```
Cloud SQL db-f1-micro: $10/month
├─ 0.6 GB RAM
├─ Shared CPU (good for MVP)
├─ 100 GB storage
└─ Automatic backups included

vs. Self-managed:
├─ Compute Engine instance: $30-50/month
├─ Storage: $5/month
├─ Backup script maintenance: $0 but you're oncall
├─ HDD failure at 2am: $priceless
```

**Scales seamlessly (NO refactoring):**
```
Day 1:    db-f1-micro   (10K bookings)     = $10/month
Day 100:  db-n1-standard-1 (1M bookings)   = $50/month
Day 365:  db-n1-standard-4 (10M bookings)  = $200/month
Year 2:   Read replicas + sharding         = depends
```

### ✅ Decision: **Cloud SQL PostgreSQL 15 (Managed)**

---

## 8️⃣ SECRETS MANAGEMENT: GCP Secret Manager (MVP) → Vault (When Multi-Cloud)

**Decision:** Two-Phase Pragmatic Approach

### Phase 1 (MVP): GCP Secret Manager

**Cost:** $0-6/month  
**Maturity:** ⭐⭐⭐⭐⭐

```hcl
# Terraform: GCP Secret Manager (simple, cheap)
resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = var.database_url
}
```

**Why GCP Secret Manager for MVP:**
- ✅ $0-6/month (pay per secret)
- ✅ Automatic rotation possible
- ✅ Built-in to GCP (no extra infrastructure)
- ✅ Audit logging included
- ✅ Perfectly production-ready for 1-5 years

**Why NOT Vault Day 1:**
- ❌ Adds $100-300/month infrastructure cost
- ❌ Adds operational overhead
- ❌ Overkill for GCP-only MVP

### Phase 2 (When Multi-Cloud): HashiCorp Vault

**Timeline:** Year 1-2 (when AWS/Azure expansion needed)  
**Cost:** $200-500/month (self-hosted on small VM)  
**Benefit:** Cloud-agnostic, ready for multi-cloud

```typescript
// Same interface everywhere
export interface SecretsProvider {
  getSecret(path: string): Promise<string>;
}

// Phase 1: GCP (cheap, simple)
export class GcpSecretsProvider implements SecretsProvider {
  async getSecret(path: string): Promise<string> {
    return await this.client.accessSecretVersion({ name: path });
  }
}

// Phase 2: Vault (cloud-agnostic)
export class VaultSecretsProvider implements SecretsProvider {
  async getSecret(path: string): Promise<string> {
    return await this.vault.read(path);
  }
}

// Application: SAME INTERFACE
// Switch implementations: 1 line config change
```

### ✅ Decision: **GCP Secret Manager (MVP) → Vault (When Needed)**

---

## 📊 FINAL TECH STACK: Production-Ready + Cost-Conscious

| Component | Choice | MVP Cost | Growth Cost | Cloud-Agnostic |
|-----------|--------|----------|-------------|---|
| **ORM** | TypeORM | $0 | $0 | ✅ Yes |
| **Backend** | NestJS v11 | $0 | $0 | ✅ Yes |
| **Frontend** | Next.js | $0 | $0 | ✅ Yes (self-hosted) |
| **React** | React 18 | $0 | $0 | ✅ Yes |
| **Events** | GCP Pub/Sub | $0-5 | $10-50 | 🟡 Phase 2 → Kafka |
| **Deployment** | Cloud Run | $10-30 | $50-200 | ✅ Yes |
| **Database** | Cloud SQL PG15 | $10-15 | $50-200 | ✅ Yes |
| **Secrets** | GCP Secret Mgr | $0-6 | $0-6 | 🟡 Phase 2 → Vault |
| **TOTAL MVP** | | **$20-56/month** | **$110-456/month** | **Mostly yes** |

---

## 🏗️ COST PROJECTION

```
Month 1 (Launch):        $50
├─ Cloud Run: $20
├─ Cloud SQL: $15
├─ Pub/Sub: $5
├─ Secret Manager: $1
└─ Cloud Storage CDN: $9

Month 3 (Growing):       $150
├─ Cloud Run: $60 (more traffic)
├─ Cloud SQL: $50 (more data)
├─ Pub/Sub: $20
├─ Other: $20

Month 12 (Proving):      $300
├─ Cloud Run: $120 (solid traffic)
├─ Cloud SQL: $100 (read replicas added)
├─ Pub/Sub: $40
├─ Other: $40

Month 24 (Scaling):      $800
├─ Cloud Run: $300
├─ Cloud SQL: $300
├─ Pub/Sub: $100
├─ Multi-region: $100

Year 3 (Decision Point):
├─ If traffic stays reasonable: Stay on Cloud Run + Cloud SQL = $1-2k/month
├─ If traffic explodes: "Should we go Kubernetes?" (optional)
├─ No code changes needed for either path
```

**vs. Wrong Approach:**
```
Month 1 (Kubernetes): $300/month
├─ GKE cluster minimum: $300
├─ Operations team: $??? (you're managing it)

Month 3: $500/month
Month 12: $1000+/month (because you built for scale that doesn't exist yet)
```

---

## 🎯 THE REAL VALUE: No Refactoring

**Same Code Path:**
```typescript
// Application code (NEVER CHANGES)
@Injectable()
export class BookingService {
  constructor(
    private bookings: BookingRepository,  // TypeORM (day 1 → day 1000)
    private events: EventBus,              // GCP Pub/Sub → Kafka (no code change)
    private secrets: SecretsProvider,      // GCP → Vault (no code change)
  ) {}

  async createBooking(request: CreateBookingRequest): Promise<Booking> {
    // This code works on day 1 with 100 users
    // Same code on day 365 with 1M users
    // No refactoring needed
  }
}
```

**Infrastructure Changes (Easy):**
```bash
# Month 1: Cloud Run
gcloud run deploy beloauto --image gcr.io/project/beloauto:v1

# Month 24: Add Kubernetes (if needed)
kubectl apply -f kubernetes/deployment.yaml
# Deploy SAME IMAGE
# Same code runs on both Cloud Run and Kubernetes

# Year 3: Migrate to AWS
# Same image
# Same code
# Just different terraform providers
```

---

## ✅ FINAL DECISION CHECKLIST

- ✅ **Production-grade from Day 1**: Yes (TypeORM, NestJS, Next.js, Cloud SQL)
- ✅ **Cost-efficient MVP**: Yes ($50/month for MVP, not $300+)
- ✅ **Scales without refactoring**: Yes (same code day 1 → day 1000)
- ✅ **No technical debt**: Yes (not building shortcuts)
- ✅ **Cloud-agnostic**: 90% (Pub/Sub → Kafka, Secrets → Vault when needed)
- ✅ **Easy migration path**: Yes (from Cloud Run → Kubernetes, GCP → AWS)
- ✅ **No over-engineering**: Yes (Kubernetes is optional, not mandatory)

---

## 📋 SUMMARY FOR YOUR TEAM

**This is the tech stack of a professional SaaS company that:**
- ✅ Starts lean ($50/month)
- ✅ Stays lean as it grows ($300-500/month at real scale)
- ✅ Builds production-grade from day 1 (no shortcuts)
- ✅ Can scale to 1M+ users without rewriting
- ✅ Can migrate clouds when needed (no lock-in)
- ✅ Doesn't over-engineer for problems that don't exist yet

---

**Ready to create the final Tech Stack ADR document with this approach?**

If yes → I'll prepare:
1. 📋 **Tech Stack ADR** (final decision record)
2. 🏗️ **Terraform scaffolding** (GCP, with AWS/Azure paths)
3. 🐳 **docker-compose.yml** (local dev parity)
4. 📊 **Cost tracking sheet** (monthly projections)
5. 🛣️ **Growth roadmap** (when to scale components)

