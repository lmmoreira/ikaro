# Testing Strategy - BeloAuto

## Overview

To support **Trunk-Based Development (TBD)** and ensure a mature, professional delivery, BeloAuto follows a rigorous testing strategy based on the **Testing Pyramid**. Every change must be verified by automated tests before merging to the `main` branch.

---

## The Testing Pyramid

### 1. **Unit & Component Tests (Core)**
- **Scope:** Individual functions, classes, and UI components.
- **Focus:** 
  - Backend: Business rules in the Domain layer.
  - Frontend: Atomic components and state logic (Hooks).
- **Tools:** Jest/Vitest (Backend/Frontend), React Testing Library.
- **Mocking:** No external dependencies. Use in-memory data structures or MSW (Mock Service Worker) for frontend API calls.
- **Goal:** >80% code coverage.

### 2. **Integration Tests (Adapters & Journeys)**
- **Scope:** Interaction between layers and critical UI workflows.
- **Focus:** 
  - Backend: Repositories, API controllers, Event Bus.
  - Frontend: Integration of multiple modules (e.g., "Booking Form" submitting to the "BFF Adapter").
- **Tools:** Supertest (API), Testcontainers (DB/Events), Vitest (Frontend).
- **Goal:** Verify that the system "talks" correctly internally.

### 3. **Contract Tests (Alignment)**
- **Scope:** API contracts between Frontend → BFF and BFF → Backend.
- **Focus:** Preventing breaking changes in JSON schemas.
- **Tools:** Pact or Spectral (OpenAPI linting).
- **Goal:** Ensure the consumer and provider stay in sync.

### 4. **End-to-End (E2E) Tests (Critical Paths)**
- **Scope:** Full user journeys (e.g., Guest Booking Request).
- **Focus:** The "Happy Path" across the entire stack.
- **Tools:** Playwright (Recommended for both Web and API).
- **Goal:** Verify the system works as a whole from the user's perspective.

---

## Testing Practices for Trunk-Based Development

### **1. Test-Driven Development (TDD)**
Developers are encouraged to write tests *before* implementation, especially for complex business rules in the domain model. This ensures the implementation matches the requirements defined in `04-USE_CASES.md`.

### **2. Small, Frequent Commits**
Tests must be small enough to allow for frequent commits to `main`. If a test suite takes too long, it should be optimized or split.

### **3. Red-Green-Refactor**
- **Red:** Write a failing test for a specific Use Case step.
- **Green:** Write the minimal code to make the test pass.
- **Refactor:** Clean up the code while keeping the test green.

---

## Tenant Isolation Testing

A critical requirement for BeloAuto is **Multi-Tenant Isolation**. Every test suite must include a "Tenant Leak" check:
- **Scenario:** Create data for Tenant A. Try to access/modify it using a session for Tenant B.
- **Expectation:** System must return 404 (Not Found) or 403 (Forbidden).

---

## Domain Event Testing

Since BeloAuto is event-driven, we must test both sides of the event flow:
1. **Producer:** Assert that specific domain events (e.g., `BookingRequested`) are emitted when a use case completes.
2. **Consumer:** Assert that a listener (e.g., Loyalty service) correctly updates its state when it receives a specific event.

---

## Quality Gates

The CI/CD pipeline will enforce these gates:
- ✓ **Zero Lint Errors:** Using ESLint/Prettier.
- ✓ **Type Safety:** `tsc` must pass with no errors.
- ✓ **All Tests Pass:** Unit and Integration tests must be green.
- ✓ **Coverage Threshold:** Minimum 80% coverage on new code.
- ✓ **Security Scan:** No high-severity vulnerabilities in dependencies.

---

## Testing Environments

| Env | Purpose | Data |
|-----|---------|------|
| **Local** | Rapid development | In-memory / Docker-compose |
| **CI (Runner)**| Pre-merge validation | Testcontainers (ephemeral) |
| **Staging** | QA & User Acceptance | Sanitized production-like data |
| **Production** | Live system | Real user data |

---

## Summary of Tools

- **Backend:** NestJS, Jest, Supertest, Testcontainers.
- **Frontend:** React, React Testing Library, Playwright.
- **API:** OpenAPI (Swagger), Spectral.
- **Mocking:** ts-mockito or jest-mock-extended.

---

**Status:** Phase 2 - Technical Architecture  
**Next:** `09-CI_CD_PIPELINE.md`
