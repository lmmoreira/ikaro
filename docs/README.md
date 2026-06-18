# Ikaro Documentation

This folder contains the foundational documentation for Ikaro, built on **Domain-Driven Design (DDD)** principles and **Hexagonal Architecture**.

**Quick start:** Read `CLAUDE.md` (root) first — it is the canonical agent context and links everything else. Use `QUICK_REFERENCE.md` for a one-page cheat sheet.

---

## 📚 Documentation Overview

### **Phase 1 - DDD Foundation (✓ Complete)**

#### **01-BUSINESS_CONTEXT.md**
- **What:** Business problem, user personas, core workflows, success metrics.

#### **02-DOMAIN_MODEL.md**
- **What:** 6 bounded contexts, aggregates, entities, value objects, domain services.

#### **03-DOMAIN_EVENTS.md**
- **What:** All domain events with full payload definitions and flow diagrams.

#### **04-USE_CASES.md**
- **What:** 27 active use cases (UC-001 through UC-029; UC-014 and UC-015 superseded).

#### **05-BOUNDED_CONTEXTS.md**
- **What:** How the 6 contexts interact, communicate, and maintain isolation.

#### **06-TENANT_ISOLATION_STRATEGY.md**
- **What:** Business and Technical strategy for multi-tenancy.

#### **07-ENGINEERING_PRINCIPLES.md** ⭐
- **What:** The **authority document** for code standards, AI-agent code of conduct, Definition of Done, forbidden patterns. Start here before writing any code.

---

### **Phase 2 - Technical Architecture & Operations (✓ Complete)**

These documents define the implementation, testing, and deployment strategies:

#### **08-TESTING_STRATEGY.md**
- **What:** Testing Pyramid (Unit, Integration, E2E) and TDD approach.

#### **09-CI_CD_PIPELINE.md**
- **What:** Trunk-Based Development, automated gates, and security scans.

#### **10-OBSERVABILITY_STRATEGY.md**
- **What:** Logging, Tracing (OTel), and Metrics (Prometheus/Grafana).

#### **11-ARCHITECTURE.md**
- **What:** System diagram and Hexagonal Architecture deep-dive.

#### **12-DEPLOYMENT_STRATEGY.md**
- **What:** Docker-centric, cloud-agnostic deployment model.

#### **13-DATABASE_SCHEMA.md**
- **What:** Multi-tenant PostgreSQL schema design.

#### **14-API_CONTRACTS.md**
- **What:** RESTful API contracts mapped to Use Cases.

#### **15-HOTSITE_DYNAMIC_ARCHITECTURE.md**
- **What:** Server-driven manifest strategy for tenant hotsites.

#### **16-DASHBOARD_FRONTEND_ARCHITECTURE.md**
- **What:** Backoffice frontend structure, roles, and quality gates.

#### **17-GITHUB_WORKFLOWS_GUIDELINES.md**
- **What:** Branching, PR standards, and commit conventions.

#### **18-RELEASE_LIFECYCLE_OPERATIONS.md**
- **What:** Step-by-step operational guide from Local to Production.

#### **19-INFRASTRUCTURE_TOOLING_MAP.md**
- **What:** SaaS vs. Self-hosted tool landscape.

#### **20-COST_OPTIMIZATION_STRATEGY.md**
- **What:** Balancing professional standards with startup financing.

#### **21-TENANTS_SETTINGS_SCHEMA.md**
- **What:** Canonical schema for `tenants.settings` JSONB — all configurable keys, defaults, validation rules.

#### **22-TECH_STACK_DECISIONS.md**
- **What:** Final technology decisions with justifications — TypeORM, NestJS, Next.js, Pub/Sub, Cloud Run, Cloud SQL, Terraform.

#### **25-ERROR_CATALOG.md**
- **What:** All RFC 9457 Problem Details error responses, organised by category.

---

## 🎯 How to Use This Documentation

### **Core Engineering Principles:**
- **→ START HERE:** `07-ENGINEERING_PRINCIPLES.md` (Authority document for all work)
- **Simplicity First:** Choose the simplest, professional solution.
- **SaaS Excellence:** Build for multi-tenancy, security, and scale.
- **Verification:** Mandatory automated tests and quality gates.

### **For Quick Understanding:**
1. Read **07-ENGINEERING_PRINCIPLES.md** (principles & checklist)
2. Read **01-BUSINESS_CONTEXT.md** (executive summary)
3. Skim **QUICK_REFERENCE.md** (one-page cheat sheet)

### **For Implementation:**
1. Reference **04-USE_CASES.md** and **14-API_CONTRACTS.md** for feature specs.
2. Follow **11-ARCHITECTURE.md** for code structure.
3. Adhere to **08-TESTING_STRATEGY.md** and **09-CI_CD_PIPELINE.md** for quality.
4. Use **07-ENGINEERING_PRINCIPLES.md** "Definition of Done" checklist.

---

## 🤖 AI Agent Guidelines
- **Permission-First:** Discuss changes before writing.
- **Context-Optimized:** Load only relevant docs (see **AI_AGENT_DOCUMENTATION.md**).
- **Principles Authority:** Follow **07-ENGINEERING_PRINCIPLES.md** for code standards.
- **Checklist:** Use the AI Agent Code of Conduct before implementing.

