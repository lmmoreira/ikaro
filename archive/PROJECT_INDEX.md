# BeloAuto - Project Index

**Status:** Phase 1 - DDD Foundation Complete ✓

---

## 🎯 Quick Start

### What is BeloAuto?
A professional, cloud-native car wash booking system with:
- Customer booking management (guest + authenticated)
- Real-time calendar & schedule management
- Loyalty tracking
- Email notifications
- Admin dashboard
- Public hotsite

### Target: Small car wash business, but architected for:
- ✓ Multi-developer team (parallel work)
- ✓ Professional DevOps (CI/CD, IaC, observability)
- ✓ Cloud-agnostic (Terraform, not locked to GCP)
- ✓ Mature practices (DDD, hexagonal architecture, testing)
- ✓ Cost-conscious (no unnecessary infrastructure)

---

## 📚 Phase 1 Documentation (COMPLETE)

Read in this order:

### 1. **docs/01-BUSINESS_CONTEXT.md** (8.2 KB, 229 lines)
   - **What:** Business problem, user personas, workflows, MVP scope
   - **Time:** 10 minutes
   - **Key insight:** 4 user tiers (visitor → guest → customer → staff)

### 2. **docs/04-USE_CASES.md** (18 KB, 475 lines)
   - **What:** 17 detailed user operations
   - **Time:** 15 minutes (skim), 30 minutes (detailed)
   - **Key insight:** Every workflow mapped with happy/error paths

### 3. **docs/02-DOMAIN_MODEL.md** (12 KB, 435 lines)
   - **What:** DDD structure (5 contexts, aggregates, value objects)
   - **Time:** 20 minutes
   - **Key insight:** Booking, Loyalty, Notification, Customer, Staff contexts

### 4. **docs/03-DOMAIN_EVENTS.md** (13 KB, 422 lines)
   - **What:** Event catalog, flows, communication patterns
   - **Time:** 15 minutes
   - **Key insight:** Event-driven architecture between contexts

### 5. **docs/05-BOUNDED_CONTEXTS.md** (18 KB, 459 lines)
   - **What:** Context map, communication, data ownership
   - **Time:** 20 minutes
   - **Key insight:** How 5 contexts interact, path to microservices

### 6. **docs/README.md** (7.7 KB)
   - **What:** Navigation guide, approval checklist, next steps
   - **Time:** 5 minutes

**Total reading time:** ~90 minutes (comprehensive understanding)

---

## ✅ Approval Checklist

### Does everything align with your vision?

- [ ] Business context captures the car wash booking problem correctly
- [ ] User tiers (visitor, guest, customer, staff) make sense
- [ ] Core workflows (request → approve → complete → loyalty) are correct
- [ ] Email notification triggers are what you want
- [ ] 48-hour cancellation policy is acceptable
- [ ] 5 bounded contexts and their responsibilities make sense
- [ ] Event-driven communication feels right
- [ ] All 17 use cases represent required features

### Any changes needed?

Please clarify:
1. **Missing features?** (e.g., need staff scheduling, calendar blocking?)
2. **Wrong assumptions?** (e.g., approval workflow different?)
3. **Scope changes?** (e.g., add payments, SMS, multi-location?)
4. **Clarity issues?** (e.g., any use case confusing?)

---

## 🚀 Next: Phase 2 - Technical Architecture

After your approval, I'll create:

- **ARCHITECTURE.md** → System design, tech stack, data flow
- **TECHNICAL_DECISIONS.md** → ADRs explaining every choice
- **HEXAGONAL_ARCHITECTURE.md** → Ports, adapters, layer structure

Then Phase 2 docs will show:
- Frontend ↔ BFF ↔ Backend communication
- Database schema (generated from domain model)
- API contracts (endpoints, requests, responses)
- Security strategy (OAuth flow, data protection)

---

## 💻 Technology Stack (Preliminary)

Based on requirements, we'll use:

**Frontend:** React (or Vue if preferred)
**BFF:** Express.js or lightweight proxy
**Backend API:** NestJS (TypeScript, structured, testable)
**Database:** PostgreSQL (cloud-agnostic)
**Email:** SendGrid or AWS SES
**Storage:** GCS (photos) - but via Terraform (portable)
**Authentication:** Google OAuth 2.0
**IaC:** Terraform (GCP primary, multi-cloud ready)
**CI/CD:** GitHub Actions (free, integrates with repo)
**Monorepo:** Yes, with separate pipelines per package

---

## 🏗️ Project Structure (To Be Created)

```
beloauto/
├── .github/
│   └── workflows/
│       ├── backend.yml          # Backend tests, lint, build
│       ├── frontend.yml         # Frontend tests, lint, build
│       ├── bff.yml              # BFF tests, lint, build
│       ├── iac.yml              # Terraform validation, plan, apply
│       └── security.yml         # SAST, DAST, dependency checks
│
├── packages/
│   ├── backend/                 # NestJS API (Booking, Loyalty, etc.)
│   ├── bff/                     # Express.js gateway (optional early)
│   ├── frontend/                # React SPA
│   ├── shared/                  # Types, constants, shared logic
│   └── hotsite/                 # Public marketing website
│
├── infra/
│   ├── terraform/
│   │   ├── main.tf              # GCP resources
│   │   ├── database.tf          # PostgreSQL
│   │   ├── storage.tf           # GCS buckets
│   │   ├── network.tf           # VPC, networking
│   │   └── variables.tf         # Input variables
│   └── docker/
│       ├── Dockerfile           # Backend, frontend, BFF
│       └── docker-compose.yml   # Local development
│
├── docs/
│   ├── 01-BUSINESS_CONTEXT.md
│   ├── 02-DOMAIN_MODEL.md
│   ├── 03-DOMAIN_EVENTS.md
│   ├── 04-USE_CASES.md
│   ├── 05-BOUNDED_CONTEXTS.md
│   ├── 06-ARCHITECTURE.md        (Phase 2)
│   ├── 07-TECHNICAL_DECISIONS.md (Phase 2)
│   ├── 08-HEXAGONAL_ARCHITECTURE.md (Phase 2)
│   ├── 09-DATABASE_SCHEMA.md     (Phase 3)
│   ├── 10-API_CONTRACTS.md       (Phase 3)
│   ├── 11-SECURITY_STRATEGY.md   (Phase 3)
│   └── README.md
│
├── .gitignore
├── README.md                    # Project overview
└── package.json                 # Monorepo root
```

---

## 🤖 AI Agent Coordination

With clear documentation, agents can work in parallel:

**Agent 1:** Booking Context backend (UC-001, UC-003, UC-009)
**Agent 2:** Frontend (UI for booking, profile, admin)
**Agent 3:** BFF (API gateway, auth flow)
**Agent 4:** Loyalty system (event listeners, calculations)
**Agent 5:** Infrastructure (Terraform, Docker, CI/CD)
**Agent 6:** Email notifications (SendGrid integration)

Each agent has clear acceptance criteria (use cases), defined contracts (events), and isolated code modules (bounded contexts).

---

## 📞 Questions for You

Before we proceed to Phase 2, confirm:

1. **Architecture direction:** Should we proceed with monorepo + hexagonal architecture?
2. **Tech stack:** Any preferences or constraints? (NestJS, React, PostgreSQL okay?)
3. **Timeline:** Any time pressures? (affects scope of Phase 2 docs)
4. **Team size:** How many developers will work on this?
5. **Deployment target:** Still GCP? Any specific compute (Cloud Run, Compute Engine)?
6. **Observability preferences:** Datadog, CloudWatch, or DIY stack (Prometheus + Grafana)?

---

## 🎓 Learning Goals Achieved (Phase 1)

✓ Structured DDD domain design
✓ Event-driven architecture
✓ Bounded contexts & communication patterns
✓ Complete user workflow mapping
✓ Justifiable technology choices
✓ Professional documentation for AI agents

**Next:** Technical implementation strategy (Phase 2)

---

**Created:** 2025-05-11 | **Status:** Phase 1 Complete, Awaiting Approval | **Next:** Phase 2 Architecture
