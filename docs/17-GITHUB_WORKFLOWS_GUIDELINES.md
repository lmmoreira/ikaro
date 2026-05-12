# GitHub Workflows & Collaboration Guidelines - BeloAuto

## Overview

BeloAuto follows **Trunk-Based Development (TBD)** to ensure high velocity and professional code quality. This document defines the rules for branching, commits, and Pull Requests.

---

## 1. Branching Strategy

We use a single long-lived branch: `main`. (The repo's default branch is `main`; "main" is not used.)

### **Feature Branches**
- **Life Span:** Maximum 24-48 hours.
- **Naming Convention:** `feat/UC-xxx-short-description` or `fix/issue-xxx`.
- **Scope:** One branch = One small, verifiable change (e.g., a single Use Case step).

### **Trunk-Based Development Rules**
1. **Pull Frequently:** Always rebase your branch against `main` before pushing.
2. **Small Batches:** If a feature is large, use **Feature Flags** to merge partial code into `main` without breaking production.
3. **Delete Branches:** After merging, delete the feature branch immediately.

---

## 2. Commit Conventions

We follow **Conventional Commits** to ensure a readable and automated changelog.

**Format:** `<type>(<scope>): <description>`

### **Types:**
- `feat`: A new feature (e.g., `feat(booking): implement guest request UC-001`).
- `fix`: A bug fix.
- `docs`: Documentation only changes.
- `style`: Changes that do not affect the meaning of the code (white-space, formatting).
- `refactor`: A code change that neither fixes a bug nor adds a feature.
- `test`: Adding missing tests or correcting existing tests.
- `chore`: Changes to the build process or auxiliary tools.

---

## 3. Pull Request (PR) Standards

A PR is a request to merge code into `main`. It must meet the following criteria:

### **The PR Template**
Every PR must include:
- **Description:** What was changed and WHY.
- **Related Use Cases:** Link to the specific UC-xxx from `docs/04-USE_CASES.md`.
- **Verification:** Proof that the code works (e.g., screenshots of tests passing, logs).
- **Checklist:**
  - [ ] Lint & Type-check passed.
  - [ ] Unit tests added/updated.
  - [ ] Integration tests added/updated (for adapters).
  - [ ] Tenant isolation verified.

### **The "Zero Failure" Rule**
A PR cannot be merged if any check in the CI pipeline fails. This includes:
- **SonarCloud:** No new "Code Smells" or "Security Hotspots".
- **Snyk:** No new vulnerabilities in dependencies.
- **Test Coverage:** Must stay above 80% for the changed modules.

---

## 4. Code Review Guidelines

- **Focus on the Domain:** Does the code correctly implement the business logic defined in `02-DOMAIN_MODEL.md`?
- **Security First:** Is there any potential for tenant data leaks?
- **Architecture:** Does the code respect the Hexagonal layers (Domain → Application → Adapter)?
- **Aesthetics:** Is the code idiomatic, clean, and well-named?

---

## 5. Automated Gates (CI Pipeline)

Every push to a branch triggers:
1. **Linting:** Prettier & ESLint check.
2. **Static Analysis:** `tsc` (TypeScript) verification.
3. **Tests:** Execution of the full Test Pyramid (Unit → Integration).
4. **Security:** Snyk scan for vulnerabilities and Gitleaks scan for secrets.
5. **Quality Gate:** SonarCloud analysis must be "GREEN".

---

## 6. Release Management

- **Continuous Deployment:** Merges to `main` are automatically deployed to **Staging**.
- **Production Promotion:** Staging is promoted to **Production** after a final automated smoke test and (optional) manual sign-off.

---

**Status:** Phase 2 - Technical Architecture  
**Validated:** Aligned with CI/CD and Testing Strategies.
