# BeloAuto Documentation - Phase 1: Domain-Driven Design Foundation

This folder contains the foundational documentation for BeloAuto, built on **Domain-Driven Design (DDD)** principles.

---

## 📚 Documentation Overview

### **Phase 1 - DDD Foundation (✓ Complete)**

These documents establish the business domain, technical strategy, and architectural foundation:

#### **01-BUSINESS_CONTEXT.md**
- **What:** The business problem, user personas, core workflows
- **For:** Developers, product managers, stakeholders
- **Key content:**
  - Problem statement
  - 4 user tiers (visitor, guest, customer, staff)
  - Core user journeys (booking request, approval, completion, cancellation)
  - MVP features & out-of-scope items
  - Success metrics

**Read this first to understand what we're building.**

---

#### **02-DOMAIN_MODEL.md**
- **What:** DDD concepts: bounded contexts, aggregates, entities, value objects
- **For:** Developers (especially backend/architecture)
- **Key content:**
  - 5 Bounded Contexts (Booking, Customer, Loyalty, Notification, Staff)
  - Aggregates (Booking, Service, ScheduleClosure, Customer, LoyaltyRecord, Staff)
  - Entities and Value Objects with properties
  - Domain event definitions

**This shapes the codebase architecture. Read before development.**

---

#### **03-DOMAIN_EVENTS.md**
- **What:** All domain events that occur in the system
- **For:** Backend developers (especially event handling)
- **Key content:**
  - Event catalog with triggers, data, and consumers
  - Event flow diagrams (happy paths, exceptions)
  - Event publishing/consumption pattern
  - Event versioning strategy

**Use this to understand event-driven communication between contexts.**

---

#### **04-USE_CASES.md**
- **What:** 17 user workflows (UC-001 through UC-017)
- **For:** All developers, QA testers, business analysts
- **Key content:**
  - Structured format: Actor, Preconditions, Trigger, Main Flow, Alternatives, Postconditions
  - All booking, schedule, service, auth, and loyalty operations
  - Happy paths and exception paths
  - Summary table linking use cases to domain impact

**Reference this during development and testing.**

---

#### **05-BOUNDED_CONTEXTS.md**
- **What:** How the 5 contexts interact, communicate, and maintain data
- **For:** Architects, backend developers
- **Key content:**
  - Context map (visual and textual)
  - Each context's responsibilities, aggregates, events
  - Communication patterns (event-driven, API calls, shared references)
  - Data ownership and consistency model
  - Future microservices scaling path

**Essential for understanding system architecture and team coordination.**

---

## 🎯 How to Use This Documentation

### **For Quick Understanding:**
1. Read **01-BUSINESS_CONTEXT.md** (executive summary)
2. Skim **04-USE_CASES.md** (user workflows)

### **For Backend Development:**
1. Read **02-DOMAIN_MODEL.md** (domain structure)
2. Read **03-DOMAIN_EVENTS.md** (event flow)
3. Read **05-BOUNDED_CONTEXTS.md** (system architecture)
4. Reference **04-USE_CASES.md** (implementation details)

### **For Frontend Development:**
1. Read **01-BUSINESS_CONTEXT.md** (user journeys)
2. Reference **04-USE_CASES.md** (feature specs)
3. Review **03-DOMAIN_EVENTS.md** (notification triggers)

### **For DevOps / Infrastructure:**
1. Read **01-BUSINESS_CONTEXT.md** (scope & scale)
2. Read **05-BOUNDED_CONTEXTS.md** (deployment model)

### **For QA / Testing:**
1. Read **01-BUSINESS_CONTEXT.md** (user tiers & workflows)
2. Read **04-USE_CASES.md** (test cases)
3. Reference **03-DOMAIN_EVENTS.md** (event validation)

---

## 🔄 Key Decisions Embedded in This Documentation

| Decision | Location | Rationale |
|----------|----------|-----------|
| 5 Bounded Contexts | 02, 05 | Separates concerns, allows independent evolution |
| Event-Driven Communication | 03, 05 | Loose coupling, scalability, resilience |
| Monorepo + separate CI pipelines | Future phase | Parallel development, independent deployments |
| Google OAuth for auth | 01 | Low friction for users, no password management |
| Guest + Authenticated flows | 01, 04 | Maximizes customer conversion |
| 48-hour cancellation policy | 04, 07 | Business requirement, enforced in use cases |
| Loyalty tracking | 02, 04 | Foundation for future promotions & retention |
| Email-only notifications (MVP) | 01 | Cost-effective, sufficient for MVP |

---

## 📊 Document Statistics

- **Total Pages:** ~2,000 lines of documentation
- **5 Core Documents**
- **17 Use Cases** fully documented
- **6 Domain Events** categorized
- **5 Bounded Contexts** mapped
- **Context Map** with visual + textual representation

---

## 🚀 Next Phase: Technical Architecture (Phase 2)

After approval of Phase 1, we'll create:

**ARCHITECTURE.md**
- System diagram (Frontend → BFF → Backend → DB)
- Technology stack with justification
- Hexagonal architecture pattern (ports & adapters)
- Data flow (OAuth, guest booking, admin operations)

**TECHNICAL_DECISIONS.md** (ADRs)
- ADR-001: Why Hexagonal Architecture?
- ADR-002: Why NestJS?
- ADR-003: Why monorepo + separate pipelines?
- ADR-004: Why Terraform for IaC?
- ADR-005: Why cloud-agnostic design?
- ADR-006: Why event-driven communication?

**HEXAGONAL_ARCHITECTURE.md**
- Deep dive into ports & adapters
- Application layer structure
- Domain layer isolation
- Adapter implementations (Database, Email, OAuth, Storage)
- Testing implications

---

## ✅ Approval Checklist

Before moving to Phase 2, confirm:

- [ ] **Business Context** aligns with your vision
- [ ] **Domain Model** captures all entities and aggregates correctly
- [ ] **Domain Events** represent all business occurrences
- [ ] **Use Cases** cover all user workflows
- [ ] **Bounded Contexts** and communication make sense
- [ ] All decisions feel justified and cloud-agnostic
- [ ] Ready to proceed with technical architecture

---

## 📝 How to Provide Feedback

For each document, clarify:

1. **What's missing?** Any workflows, entities, or events we overlooked?
2. **What's wrong?** Any incorrect assumptions or business logic?
3. **What needs clarification?** Ambiguous sections or confusing explanations?
4. **What's confusing for agents?** If working with AI, note unclear parts.

---

## 📂 File Structure (Current)

```
beloauto/
├── docs/
│   ├── 01-BUSINESS_CONTEXT.md      ← Business model & workflows
│   ├── 02-DOMAIN_MODEL.md          ← DDD concepts & aggregates
│   ├── 03-DOMAIN_EVENTS.md         ← Event catalog & flows
│   ├── 04-USE_CASES.md             ← 17 user operations
│   ├── 05-BOUNDED_CONTEXTS.md      ← System architecture & communication
│   └── README.md                   ← You are here
└── (code directories to follow in Phase 2)
```

---

## 🤝 Collaboration Notes

This project uses **AI-assisted development** with clear documentation for agent context:

- **Explicit use cases** (UC-001 through UC-017) → easy to assign to developers/agents
- **Bounded contexts** → clear code module boundaries
- **Domain events** → testable event flows
- **Value objects & entities** → specific type definitions
- **Technical decisions** → justifications for architecture choices

This documentation enables:
- ✓ Multiple agents working in parallel (separate contexts)
- ✓ Clear acceptance criteria (use cases, events)
- ✓ Consistent architecture (hexagonal pattern, DDD principles)
- ✓ Professional code quality (tests, linting, type safety)

---

## 📞 Questions?

If clarification is needed:
1. Check the relevant document first
2. Look for cross-references in footnotes
3. Review examples and diagrams
4. Ask for specific use case or context clarification

---

**Status:** Phase 1 ✓ Complete | Phase 2 (Architecture) → Awaiting approval | Phase 3 (Implementation) → Pending Phase 2

