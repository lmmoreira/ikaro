# BeloAuto Documentation - Phase 2: Technical Architecture Complete

This folder contains the foundational documentation for BeloAuto, built on **Domain-Driven Design (DDD)** principles and **Hexagonal Architecture**.

---

## 📚 Documentation Overview

### **Phase 1 - DDD Foundation (✓ Complete)**

These documents establish the business domain, technical strategy, and architectural foundation:

#### **01-BUSINESS_CONTEXT.md**
- **What:** The business problem, user personas, core workflows.

#### **02-DOMAIN_MODEL.md**
- **What:** DDD concepts: bounded contexts, aggregates, entities, value objects.

#### **03-DOMAIN_EVENTS.md**
- **What:** All domain events that occur in the system.

#### **04-USE_CASES.md**
- **What:** 23 user workflows (UC-001 through UC-023).

#### **05-BOUNDED_CONTEXTS.md**
- **What:** How the 5 contexts interact and communicate.

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

