# Tech Stack Architecture - Detailed Analysis & Recommendations
**Date:** 2026-05-12  
**Context:** BeloAuto SaaS - Multi-tenant car wash booking platform  
**Constraints:** 
- Primary deployment: GCP (for MVP)
- Architecture: Cloud-agnostic (Terraform IaC)
- Local development: Parity with production
- Future: Easy cloud migration (AWS, Azure)

---

## 🎯 GUIDING PRINCIPLES

1. **Cloud Agnosticism First**
   - All cloud-specific code isolated behind abstractions
   - Infrastructure as Code (Terraform) handles cloud differences
   - Services use cloud-agnostic patterns (where possible)

2. **Local Development Parity**
   - Docker Compose replicates production stack locally
   - Same database, event bus, storage (locally containerized)
   - No "it works on my machine but not in prod" issues

3. **GCP Primary, But Portable**
   - GCP is production target for MVP
   - Terraform manages all infrastructure
   - Switching cloud = change Terraform vars + rebuild

4. **Production-Grade from Day 1**
   - No technical debt
   - Scalable architecture
   - Observable and maintainable

---

## 1️⃣ BACKEND ORM: Prisma vs TypeORM

### Analysis

| Aspect | Prisma | TypeORM |
|--------|--------|---------|
| **Cloud Agnosticism** | ✅ Excellent (DB-agnostic) | ✅ Excellent (DB-agnostic) |
| **Local Development** | ✅ Easy (SQLite or local PG) | ✅ Easy (local PG) |
| **NestJS Integration** | ✅ Good (plugins available) | ✅⭐ Excellent (decorators native) |
| **Type Safety** | ✅⭐ Best-in-class | ✅ Good (decorators provide it) |
| **Schema Migration** | ✅⭐ Excellent DX | ✅ Good (good CLI) |
| **Multi-tenancy Support** | ✅ Great (filtering at query level) | ✅ Great (same approach) |
| **Learning Curve** | ✅ Lower (simpler API) | ✅ Steeper (more concepts) |
| **Production Maturity** | ✅ Very mature now | ✅⭐ Battle-tested for years |
| **Team Preference** | - | - | - |

### Recommendation: **PRISMA** ✅

**Why Prisma:**
1. **Type Safety**: Prisma generates types from schema - zero-cost abstraction
2. **Developer Experience**: Simpler, cleaner API - faster onboarding for AI agents
3. **Multi-tenancy**: Query filtering is native and elegant
4. **Cloud Agnostic**: Works identically on GCP PostgreSQL, AWS RDS, Azure DB, local PostgreSQL
5. **Schema Management**: Prisma migrations are cleaner and easier to reason about
6. **Local Development**: SQLite support for quick local iteration (can switch to local PG for parity)

**When Applied:**
- Backend: `src/*/domain/repositories/*.ts` - Prisma Client injected
- Local Dev: `docker-compose.yml` - PostgreSQL 15
- GCP Production: Cloud SQL PostgreSQL 15
- Migrations: Prisma `migrations/` directory (version controlled)

**Cloud Agnosticism:**
```
# Same code everywhere:
const user = await prisma.customer.findUnique({ where: { id } });

# Works on:
✅ Local PostgreSQL (docker-compose)
✅ GCP Cloud SQL PostgreSQL
✅ AWS RDS PostgreSQL (future)
✅ Azure Database for PostgreSQL (future)
```

---

## 2️⃣ BACKEND FRAMEWORK: NestJS v11 vs v12

### Analysis

| Aspect | NestJS v11 | NestJS v12 |
|--------|-----------|-----------|
| **Stability** | ✅⭐ Proven stable | 🟡 Newer, less field-tested |
| **NestJS Ecosystem** | ✅⭐ All packages support | 🟡 Some packages pre-release |
| **TypeORM Integration** | ✅⭐ Solid | ✅ Same support |
| **Community** | ✅⭐ Larger, more examples | 🟡 Smaller (newer) |
| **Performance** | ✅ Excellent | ✅ Slightly better (marginal) |
| **Learning Resources** | ✅⭐ Abundant | 🟡 Limited |
| **Long-term Support** | ✅⭐ LTS guarantees | 🟡 Unknown yet |

### Recommendation: **NestJS v11** ✅

**Why NestJS v11:**
1. **Stability**: Production-proven, used by enterprises
2. **Ecosystem Maturity**: All needed packages (auth, queues, etc.) stable
3. **Documentation**: Abundant examples and community support
4. **AI Agent Friendly**: More examples online = better code generation
5. **No Performance Cost**: Marginal v12 gains not worth the risk for MVP

**When Applied:**
- Project setup: `package.json` → `"@nestjs/core": "^11.x"`
- Backend scaffold: All modules, services, controllers in NestJS 11 patterns
- CI/CD: Node 20 LTS (official NestJS 11 target)

**When to Upgrade to v12:**
- Post-MVP
- Once v12 has 6+ months production data
- No urgent need for v12 features

---

## 3️⃣ FRONTEND BUILD TOOL: Next.js vs Vite + React

### Analysis

| Aspect | Next.js | Vite + React |
|--------|---------|------------|
| **Cloud Agnosticism** | ✅ Good (static exports) | ✅⭐ Excellent (pure static) |
| **Local Development** | ✅ Good | ✅⭐ Extremely fast (HMR) |
| **API Integration** | ✅⭐ Built-in API routes | ✅ Separate backend (better separation) |
| **SSR/SSG** | ✅⭐ Built-in | 🟡 Not built-in (not needed for SaaS) |
| **Deployment** | ✅ Simple (Vercel-aware) | ✅⭐ Simple static hosting |
| **Full-Stack** | ✅⭐ Yes (possible API routes) | ❌ Frontend only (clear separation) |
| **Learning Curve** | 🟡 Higher (conventions) | ✅⭐ Lower (pure React) |
| **For Microservices** | 🟡 More complex | ✅⭐ Better separation |

### Recommendation: **Vite + React** ✅

**Why Vite + React:**
1. **Clean Separation**: Frontend ≠ Backend (better for backend-first architecture)
2. **Cloud Agnostic**: Vite produces pure static files → deploy anywhere
   - GCP: Cloud Storage + Cloud CDN
   - AWS: S3 + CloudFront (future)
   - Local: nginx in Docker
3. **Local Development**: Vite HMR is lightning fast (better DX)
4. **Terraform Friendly**: Static hosting is easier to manage as code
5. **No API Route Confusion**: Backend is NestJS, Frontend is Vite (clear boundaries)
6. **Easy Cloud Migration**: Just change CDN config in Terraform

**When Applied:**
- Frontend scaffold: `frontend/` directory with Vite + React
- Local Dev: `docker-compose.yml` → nginx serving Vite dev server
- GCP Production: 
  - Build: `npm run build` → `dist/`
  - Deploy: Terraform → Cloud Storage bucket + Cloud CDN
- AWS Future: Same Terraform with `aws` provider → S3 + CloudFront

**Cloud Agnosticism:**
```
# Local (docker-compose):
frontend:
  image: node:20
  volumes:
    - ./frontend:/app
  command: npm run dev
  ports:
    - "5173:5173"

# GCP (Terraform):
resource "google_storage_bucket" "frontend" {
  name = "beloauto-frontend"
}

resource "google_cdn" "frontend" {
  bucket = google_storage_bucket.frontend.id
}

# AWS (same Terraform, different provider):
resource "aws_s3_bucket" "frontend" {
  bucket = "beloauto-frontend"
}

resource "aws_cloudfront_distribution" "frontend" {
  origin {
    domain_name = aws_s3_bucket.frontend.regional_domain_name
  }
}
```

---

## 4️⃣ FRONTEND FRAMEWORK: React 18 vs React 19

### Analysis

| Aspect | React 18 | React 19 |
|--------|----------|----------|
| **Stability** | ✅⭐ Battle-tested | 🟡 Brand new (April 2024) |
| **Component Ecosystem** | ✅⭐ All libraries support | 🟡 Some libraries pre-release |
| **Concurrent Features** | ✅ Stable | ✅ Improved (marginal) |
| **Server Components** | 🟡 Next.js only | ✅ Better support (not needed in Vite) |
| **Performance** | ✅ Excellent | ✅ Slightly better (marginal) |
| **Documentation** | ✅⭐ Abundant | 🟡 Growing |
| **Team Experience** | ✅⭐ Most developers know it | 🟡 Less familiar |

### Recommendation: **React 18** ✅

**Why React 18:**
1. **Ecosystem Maturity**: Every UI library (Material-UI, Shadcn, etc.) fully supports React 18
2. **Team Familiarity**: Most developers know React 18 patterns
3. **No Real Benefit in Vite**: React 19 server components don't help with pure static frontend
4. **Long-term Stability**: React 18 guaranteed support through 2026+
5. **Library Compatibility**: All libraries work perfectly

**When Applied:**
- Frontend: `package.json` → `"react": "^18.x"`
- Vite config: React plugin v4 (React 18 compatible)

**When to Upgrade to React 19:**
- Post-MVP (6+ months)
- When ecosystem fully supports it
- No performance advantage worth the risk

---

## 5️⃣ EVENT BUS: RabbitMQ vs Cloud Pub/Sub

### Analysis (Cloud Agnosticism is Key)

| Aspect | RabbitMQ | Cloud Pub/Sub | Rationale |
|--------|----------|---------------|-|
| **GCP Local** | ✅ Docker container | N/A | Same for dev everywhere |
| **GCP Production** | 🟡 Self-hosted | ✅ Managed Google Pub/Sub | |
| **AWS Production** | ✅ Can use | ❌ GCP-only | Cloud couples us to GCP |
| **Azure Production** | ✅ Can use | ❌ GCP-only | Cloud couples us to GCP |
| **Cloud Agnosticism** | ✅⭐ Yes! | ❌ No - vendor lock-in | **CRITICAL** |
| **Local Dev Parity** | ✅⭐ Same as prod | 🟡 Different from prod | Need emulator |
| **Operational Overhead** | 🟡 Must manage | ✅ Managed service | |
| **Cost Efficiency** | 🟡 Slightly higher | ✅ Pay-per-message | |

### Recommendation: **RabbitMQ** ✅

**Why RabbitMQ (for cloud agnosticism):**
1. **Cloud Agnostic**: Works on any cloud, any infrastructure
2. **Local Dev Parity**: Docker RabbitMQ = Production RabbitMQ (same binary)
3. **Not Vendor-Locked**: Can migrate to any cloud without code changes
4. **Terraform Friendly**: Easy to define in any cloud provider
5. **Future-Proof**: If you want to move to AWS or Azure, RabbitMQ still works

**Architecture Pattern:**
```
# Local Development (docker-compose)
rabbitmq:
  image: rabbitmq:3.13-management
  ports:
    - "5672:5672"
    - "15672:15672"

# GCP Production (Terraform)
resource "google_compute_instance" "rabbitmq" {
  machine_type = "e2-standard-2"
  # RabbitMQ container runs same as local
}

# AWS Production (Same Terraform, different provider)
resource "aws_instance" "rabbitmq" {
  instance_type = "t3.small"
  # Same RabbitMQ container image
}
```

**Important: RabbitMQ Deployment Options**
1. **Local**: Docker container (simplest)
2. **GCP Production**: 
   - Option A: Compute Engine + container (cheapest, more ops)
   - Option B: Cloud Tasks (if messaging needs are simple)
3. **Future AWS**: EC2 + container (same approach)

**NestJS Integration:**
```typescript
// Same code everywhere (cloud-agnostic)
@Module({
  imports: [
    AmqpModule.forRoot({
      urls: [process.env.RABBITMQ_URL], // localhost:5672 (local)
                                         // rabbitmq.gcp:5672 (GCP)
    }),
  ],
})
export class EventsModule {}
```

---

## 6️⃣ DEPLOYMENT PLATFORM: AWS Fargate vs GCP Cloud Run vs Kubernetes

### Analysis (Cloud Agnosticism First!)

| Aspect | AWS Fargate | GCP Cloud Run | Kubernetes |
|--------|------------|--------------|------------|
| **GCP Primary** | ❌ Wrong cloud | ✅⭐ Native | ⚠️ Works but overkill |
| **Cloud Agnostic** | ❌ AWS-only | ❌ GCP-only | ✅⭐ Yes! |
| **Local Dev Parity** | 🟡 Docker, but managed | 🟡 Docker, but managed | ✅⭐ Same K8s everywhere |
| **Terraform Support** | ✅ Good | ✅ Good | ✅ Good (via Helm) |
| **Cost (Small Scale)** | 💰 Higher | 💰 Lower | 💰 Highest (requires cluster) |
| **Learning Curve** | ✅ Simple | ✅ Simple | ❌ Steep |
| **Auto-scaling** | ✅ Good | ✅⭐ Excellent | ✅ Excellent (complex) |
| **Future Migration** | ❌ Locked to AWS | ❌ Locked to GCP | ✅ Same everywhere |

### Recommendation: **GCP Cloud Run** ✅ (with Kubernetes fallback)

**Why GCP Cloud Run (for MVP):**
1. **Primary Deployment Target**: GCP native = optimal for GCP
2. **Cost Efficient**: Serverless pricing, pay-per-request
3. **Zero Ops**: Google manages infrastructure
4. **Fast Iteration**: Deploy changes in seconds
5. **Terraform Support**: Easy to define in Terraform
6. **Local Development**: Docker exactly matches Cloud Run environment

**But: Future Cloud Agnosticism**
- Phase 1 (MVP): GCP Cloud Run
- Phase 2 (Scale): Evaluate Kubernetes (GKE on GCP)
- Phase 3 (Multi-cloud): Kubernetes (GKE, EKS, AKS)

**Architecture Pattern:**
```
# Local Development (docker-compose)
backend:
  build: ./backend
  ports:
    - "3000:3000"
  environment:
    DATABASE_URL: postgres://db:5432/beloauto
    RABBITMQ_URL: amqp://rabbitmq:5672

# GCP Production (Terraform - Cloud Run)
resource "google_cloud_run_service" "backend" {
  name     = "beloauto-backend"
  image    = "gcr.io/project/beloauto-backend:latest"
  # Auto-scaling, managed by Google
}

# Future AWS (Terraform - same container)
resource "aws_ecs_service" "backend" {
  name           = "beloauto-backend"
  task_definition = aws_ecs_task_definition.backend.arn
  # Same container image, different platform
}

# Future Kubernetes (Terraform via Helm)
resource "helm_release" "backend" {
  chart = "./helm/beloauto-backend"
  # Same container image, orchestrated by K8s
}
```

**Local Dev Parity:**
```dockerfile
# Dockerfile (same for local and production)
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
```

---

## 7️⃣ DATABASE: PostgreSQL 14 vs 15 vs 16

### Analysis

| Aspect | PostgreSQL 14 | PostgreSQL 15 | PostgreSQL 16 |
|--------|---|---|---|
| **Stability** | ✅⭐ Very stable | ✅⭐ Stable & proven | 🟡 Newer |
| **Performance** | ✅ Excellent | ✅ Better | ✅ Best |
| **Multi-tenancy Features** | ✅ Good | ✅ Good | ✅ Good |
| **Production Deployments** | ✅⭐ Millions | ✅ Tens of millions | 🟡 Growing |
| **GCP Cloud SQL Support** | ✅⭐ Available | ✅⭐ Available | 🟡 Check support |
| **Local Dev** | ✅ Easy (Docker) | ✅ Easy (Docker) | ✅ Easy (Docker) |
| **Security Updates** | ✅ Until 2026 | ✅ Until 2027 | ✅ Until 2028 |

### Recommendation: **PostgreSQL 15** ✅

**Why PostgreSQL 15:**
1. **Sweet Spot**: Balance of stability + modern features
2. **GCP Support**: Cloud SQL fully supports it
3. **Performance**: Significant improvements over 14
4. **Long-term Support**: Supported until November 2027
5. **Multi-tenancy**: Native support for row-level security (helpful for our design)

**When Applied:**
- Local Dev: `docker-compose.yml` → `postgres:15-alpine`
- GCP Production: `google_sql_database_instance` → version 15
- Future AWS: RDS PostgreSQL 15
- Future Azure: Azure Database for PostgreSQL 15

**Parity:**
```
# Local (docker-compose.yml)
db:
  image: postgres:15-alpine
  environment:
    POSTGRES_DB: beloauto
    POSTGRES_PASSWORD: dev-password

# GCP Production (Terraform)
resource "google_sql_database_instance" "postgres" {
  database_version = "POSTGRES_15"
  tier             = "db-f1-micro" # adjustable
}

# AWS Future (Same Terraform, different provider)
resource "aws_rds_cluster_instance" "postgres" {
  engine_version = "15.3"
}
```

---

## 8️⃣ SECRETS MANAGEMENT: AWS Secrets Manager vs GCP Secret Manager vs HashiCorp Vault

### Analysis (Cloud Agnosticism Critical)

| Aspect | AWS Secrets Mgr | GCP Secret Manager | HashiCorp Vault |
|--------|---|---|---|
| **GCP Native** | ❌ No | ✅⭐ Yes | ❌ Third-party |
| **AWS Future** | ✅⭐ Yes | ❌ No | ✅ Yes |
| **Cloud Agnostic** | ❌ AWS-only | ❌ GCP-only | ✅⭐ Yes! |
| **Local Dev Parity** | 🟡 Emulator | 🟡 Emulator | ✅⭐ Same (self-hosted) |
| **Terraform Support** | ✅ Excellent | ✅ Excellent | ✅ Excellent |
| **Complexity** | ✅ Simple | ✅ Simple | 🟡 Complex setup |
| **Cost** | 💰 Per-secret | 💰 Per-secret | 🟡 Self-hosted |
| **Rotation** | ✅ Automatic | ✅ Automatic | ✅ Manual or auto |

### Recommendation: **HashiCorp Vault** ✅

**Why HashiCorp Vault (for cloud agnosticism):**
1. **Cloud Agnostic**: Works on any cloud, any infrastructure
2. **Local Dev Parity**: Same Vault binary locally and in production
3. **Not Vendor-Locked**: If moving clouds, Vault stays the same
4. **Terraform Native**: HashiCorp product, perfect Terraform integration
5. **Future-Proof**: Works with GCP, AWS, Azure, on-prem

**BUT: Pragmatic Hybrid Approach**
- **MVP (GCP only)**: Use GCP Secret Manager (faster start, managed service)
- **Phase 2 (Before AWS)**: Migrate to Vault (small overhead now prevents large overhead later)

**Architecture Pattern:**
```
# Local Development (docker-compose)
vault:
  image: vault:latest
  ports:
    - "8200:8200"
  environment:
    VAULT_DEV_ROOT_TOKEN_ID: dev-token

# GCP Production MVP (Terraform - easier start)
resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
}

# GCP Production Phase 2 (Terraform - Vault)
resource "google_compute_instance" "vault" {
  image = "vault:latest"
  # Self-hosted Vault
}

# AWS Production (Same Vault)
resource "aws_instance" "vault" {
  image = "vault:latest"
  # Identical Vault setup
}
```

**NestJS Integration (cloud-agnostic):**
```typescript
// Interface (cloud-agnostic)
export interface SecretsProvider {
  getSecret(path: string): Promise<string>;
}

// GCP Implementation (MVP)
export class GcpSecretsProvider implements SecretsProvider {
  async getSecret(path: string): Promise<string> {
    const client = new SecretManagerServiceClient();
    const response = await client.accessSecretVersion({ name: path });
    return response[0].payload.data.toString();
  }
}

// Vault Implementation (Phase 2+)
export class VaultSecretsProvider implements SecretsProvider {
  async getSecret(path: string): Promise<string> {
    const response = await this.vault.read(path);
    return response.data.data.value;
  }
}

// Usage (same everywhere)
constructor(private secrets: SecretsProvider) {}

async getDbPassword(): Promise<string> {
  return this.secrets.getSecret('database/password');
}
```

---

## 📊 SUMMARY TABLE: Recommendations

| Decision | Choice | Rationale | When |
|----------|--------|-----------|------|
| **ORM** | Prisma | Type-safe, cloud-agnostic, excellent DX | Day 1 |
| **Backend Framework** | NestJS v11 | Stable, mature, proven in production | Day 1 |
| **Frontend Build** | Vite + React | Cloud-agnostic static files, fast HMR | Day 1 |
| **React Version** | React 18 | Ecosystem mature, team familiar | Day 1 |
| **Event Bus** | RabbitMQ | Cloud-agnostic, local dev parity | Day 1 |
| **Deployment** | GCP Cloud Run (MVP) | GCP native, managed, serverless | MVP Phase |
| **Database** | PostgreSQL 15 | Sweet spot: stable + modern, long support | Day 1 |
| **Secrets** | GCP Secret Manager (MVP) → Vault (Phase 2) | Fast start, then cloud-agnostic | MVP then Phase 2 |

---

## 🏗️ CLOUD AGNOSTICISM ARCHITECTURE

### How We Achieve It

```
┌─────────────────────────────────────────────────────────┐
│                    Application Code                     │
│         (NestJS, Prisma, Vite, React)                   │
│              Cloud-Agnostic Core Logic                  │
└────────────────┬────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼──────┐  ┌──────▼────────┐
│  Infrastructure │  │   Environment  │
│  (Terraform)   │  │   Variables    │
└────────┬───────┘  └────────┬───────┘
         │                   │
    ┌────▼───────────────────▼─────┐
    │   Cloud-Specific Configs     │
    ├─────────────────────────────┤
    │ GCP (MVP):                  │
    │ - Cloud SQL                 │
    │ - Cloud Run                 │
    │ - Cloud Storage + CDN       │
    │ - Cloud Secret Manager      │
    │                             │
    │ AWS (Future):               │
    │ - RDS                       │
    │ - ECS/Fargate               │
    │ - S3 + CloudFront           │
    │ - Secrets Manager           │
    │                             │
    │ Local Dev:                  │
    │ - PostgreSQL (Docker)       │
    │ - NestJS (local)            │
    │ - RabbitMQ (Docker)         │
    │ - Vault (Docker)            │
    └────────────────────────────┘
```

### Key Principle: Infrastructure as Code

**Everything is in Terraform:**
```
beloauto/
├── terraform/
│   ├── main.tf              # Core resources
│   ├── variables.tf         # Input variables
│   ├── gcp.tf               # GCP-specific (uses `provider = google`)
│   ├── aws.tf               # AWS-specific (uses `provider = aws`)
│   ├── terraform.gcp.tfvars # GCP values
│   └── terraform.aws.tfvars # AWS values
├── docker-compose.yml       # Local dev (same architecture)
└── src/                     # Application code (cloud-agnostic)
```

**To switch clouds:**
```bash
# GCP (MVP)
terraform apply -var-file=terraform.gcp.tfvars

# AWS (Future)
terraform apply -var-file=terraform.aws.tfvars

# Application code: ZERO CHANGES
```

---

## 🚀 IMPLEMENTATION TIMELINE

### Phase 1: MVP (GCP, Week 1-12)
- Prisma + NestJS v11 + Vite + React 18
- RabbitMQ (containerized on Compute Engine)
- PostgreSQL 15 (Cloud SQL)
- GCP Secret Manager (simple, managed)
- GCP Cloud Run (backend)
- Cloud Storage + CDN (frontend)
- Local Dev: Docker Compose (exact parity)

### Phase 2: Cloud Readiness (Week 13-16)
- Migrate Secrets → HashiCorp Vault
- Document Terraform for AWS
- Test deployment to AWS (parallel run)

### Phase 3: Multi-Cloud (Week 17+)
- Active AWS deployment
- Option: Kubernetes (GKE + EKS)
- Full cloud migration capability

---

## ✅ CHECKLIST FOR DECISION

Before you confirm, verify:

- ✅ Prisma: OK for NestJS + multi-tenancy?
- ✅ NestJS v11: Production-ready for MVP?
- ✅ Vite + React: Good separation of concerns?
- ✅ React 18: Ecosystem support for UI libraries?
- ✅ RabbitMQ: Comfortable with self-hosted messaging?
- ✅ Cloud Run: GCP native container platform?
- ✅ PostgreSQL 15: Good for cloud-agnostic setup?
- ✅ GCP Secret Manager (MVP) → Vault (Phase 2): Two-phase approach OK?

---

**Ready to confirm these recommendations?**

If yes → I'll create the official Tech Stack ADR document.  
If no → Let me know your preferences and I'll adjust.

