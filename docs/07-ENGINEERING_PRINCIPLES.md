# Engineering Principles - BeloAuto Development Standards

**Status:** Phase 1 Complete - AI Agent Guidance  
**Audience:** All developers and AI agents working on BeloAuto  
**Last Updated:** 2026-05-11

---

## 🎯 Core Philosophy

We build **professional SaaS** products with:
- **Simplicity first:** The simplest solution that solves the problem is the best solution.
- **Quality always:** Every change must be tested, linted, and verified through CI.
- **Pragmatism:** Avoid overengineering; don't add features you don't need today.

---

## 5 Mandatory Principles

### 1️⃣ **Simplicity Over Cleverness**

- Choose the simplest approach that fulfills the requirement.
- Avoid premature optimization, caching, or complex abstractions.
- Code should be readable by a junior developer.
- When in doubt, ask: "Is there a simpler way?"

**Example:**
```typescript
// ❌ Overcomplicated
const cache = new WeakMap();
const memoized = (fn) => (arg) => 
  cache.has(arg) ? cache.get(arg) : (cache.set(arg, fn(arg)), cache.get(arg));

// ✅ Simple
async function getCustomer(id: string, tenantId: string) {
  return await this.repo.findByTenantAndId(tenantId, id);
}
```

**AI Agents:** If you're tempted to add caching, design patterns, or abstractions—pause and ask the user first.

---

### 2️⃣ **SaaS Professionalism**

Build for **reliability, security, and scale from day one**, not later.

**Required for every feature:**
- ✅ **Tenant isolation** - All queries scoped by `tenant_id`
- ✅ **Error handling** - Proper HTTP status codes and error messages
- ✅ **Logging** - Structured JSON logs with context
- ✅ **Security** - No credentials in code; validate all inputs
- ✅ **Performance** - Reasonable query times; no N+1 queries
- ✅ **Database integrity** - Foreign keys, constraints, indexes
- ✅ **Localization** - All customer-facing text in **pt-BR**; money as **BRL** (`R$ 1.234,56`); dates in tenant timezone

**No shortcuts for "MVP":**
- No hardcoded values
- No test data in production queries
- No disabled security checks
- No "TODO fix later" comments without a task

**AI Agents:** Don't argue "it's just MVP"; maintain standards from the start.

---

### 3️⃣ **Best Practices & SOLID Principles**

Follow clean code fundamentals:

| Principle | Application | Example |
|-----------|-------------|---------|
| **DRY** (Don't Repeat Yourself) | Extract common logic into functions | Tenant-scoped query helper |
| **SOLID-S** (Single Responsibility) | One class = one reason to change | Repository handles data, Service handles logic |
| **SOLID-O** (Open/Closed) | Open for extension, closed for modification | Use inheritance/composition for variants |
| **SOLID-L** (Liskov) | Subtypes must be substitutable | All repositories follow same interface |
| **SOLID-I** (Interface Segregation) | Many client-specific interfaces | Don't force clients to depend on unused methods |
| **SOLID-D** (Dependency Inversion) | Depend on abstractions, not concretions | Inject repositories; don't hardcode `new` |

**Code Quality Standards:**
- Naming: Clear, descriptive, no abbreviations (except `id`, `msg`)
- Functions: < 20 lines; single responsibility
- Classes: < 200 lines (consider split if larger)
- Comments: Only for "why", not "what" (code shows what)
- Type safety: Use strict TypeScript; no `any` without reason

**AI Agents:** If code violates SOLID, refactor it. Don't add new code that compounds the problem.

---

### 4️⃣ **Test-Driven Quality**

**Every change must include tests.** No exceptions.

### Test Pyramid (BeloAuto Model):

```
         /\
        /  \ E2E Tests (Happy path only)
       /____\
      /      \
     / Integ. \ Integration Tests (Use cases, DB, events)
    /  Tests   \
   /__________\
  /            \
 / Unit Tests   \ Unit Tests (Repositories, Services, Domain Logic)
/________________\
```

**Unit Tests (80% of coverage):**
- Domain logic, aggregates, repositories
- Fast (< 100ms per test)
- No database, no network
- Example: `BookingValidator.canApprove(booking)` → true/false

**Integration Tests (25% of coverage):**
- Use cases end-to-end (request → response)
- Real database (test DB); events published
- Verify tenant isolation
- Example: "Customer requests booking" → Booking saved with PENDING status

**E2E Tests (5% of coverage):**
- Happy path only (most common scenario)
- Full stack: API → Database → Response
- Run in staging
- Example: Guest booking → Admin approves → Customer sees booking

**Mandatory Test Rules:**
- ✅ Tenant isolation verified (multiple tenant queries)
- ✅ Error cases covered (invalid input, not found)
- ✅ Boundary conditions checked (empty, null, edge dates)
- ✅ Tests named descriptively: `shouldReturnBookingWhenCustomerIdAndTenantMatch`
- ✅ No hardcoded wait times (use proper async/await)
- ❌ No `.skip()` or `.only()` on tests
- ❌ No flaky tests (intermittent failures)
- ❌ No test data persisted to production

**AI Agents:**
1. Generate tests **first** (test-driven approach)
2. Verify tests fail before implementation
3. Implement to make tests pass
4. Verify no other tests break
5. Run full test suite before suggesting code

---

### 5️⃣ **Quality Gates & CI Verification**

**Before committing, verify locally:**

```bash
# 1. Run all tests
pnpm test

# 2. Run linting (fix warnings, don't suppress)
pnpm lint

# 3. Check types
pnpm type-check

# 4. Check test coverage (minimum: 80% on changed code — CI gate)
pnpm coverage
```

**CI Pipeline enforces:**
- ✅ All tests pass
- ✅ Linting passes (no warnings suppressed)
- ✅ Type checks pass
- ✅ Coverage meets threshold (80% on changed code)
- ✅ Security scans pass (no vulnerabilities)
- ✅ Build succeeds

**No suppression of warnings:**
```typescript
// ❌ NEVER DO THIS
// @ts-ignore
const x: string = 123;

// ✅ FIX THE ISSUE
const x: number = 123;
```

**AI Agents:** If CI fails, the code is not done. Fix it, don't ignore it.

---

## 🤖 AI Agent Code of Conduct

**Before writing code, ALWAYS follow this checklist:**

### Pre-Implementation
- [ ] Discussed requirement with user (not assumed)
- [ ] Read relevant use case from `docs/04-USE_CASES.md`
- [ ] Identified affected domain model from `docs/02-DOMAIN_MODEL.md`
- [ ] Listed events to emit from `docs/03-DOMAIN_EVENTS.md`
- [ ] Checked database schema for tenant_id, foreign keys
- [ ] Verified multi-tenancy model (customer multi-tenant? staff single-tenant?)

### Code Generation
- [ ] Added `tenant_id` to all database queries
- [ ] All events include `tenantId` field
- [ ] Repository methods scoped by tenant
- [ ] Error messages are user-friendly, not technical
- [ ] No hardcoded values (use config/env variables)
- [ ] No test data in production code
- [ ] Followed naming conventions (camelCase, descriptive)

### Testing
- [ ] Unit tests verify core logic
- [ ] Integration tests verify use cases
- [ ] Tenant isolation tests (same query, different tenants)
- [ ] Error case tests (invalid input, not found, unauthorized)
- [ ] No `.skip()` or `.only()` on tests
- [ ] No flaky tests (deterministic results)

### Verification
- [ ] Ran `pnpm test` locally → ✅ All pass
- [ ] Ran `pnpm lint` locally → ✅ No warnings
- [ ] Ran `pnpm type-check` locally → ✅ No errors
- [ ] Ran `pnpm coverage` locally → ✅ Coverage meets threshold
- [ ] Code follows SOLID principles
- [ ] Code is readable and maintainable

### If CI Fails
- ❌ Don't suggest "ignore this test"
- ❌ Don't suppress warnings
- ❌ Don't skip linting
- ✅ Fix the issue in code or tests
- ✅ Re-run locally until all pass
- ✅ Then suggest again

---

## 🚫 Forbidden Patterns

**NEVER do any of these:**

| Pattern | Problem | Solution |
|---------|---------|----------|
| Query without `tenant_id` filter | Data leak across tenants | Always add `WHERE tenant_id = ?` |
| Event without `tenantId` | Can't identify affected tenant | Add `tenantId` to all events |
| Hardcoded values | Can't change without code change | Use environment variables or config |
| Test data in production | Pollutes real data | Use test DB in tests, separate from prod |
| Disabled security checks | Vulnerable to attacks | Keep security checks always enabled |
| `.skip()` or `.only()` | Hides test failures in CI | Remove before committing |
| Suppress linting warnings | Accumulates technical debt | Fix the code, not the linter |
| `@ts-ignore` or `any` types | Defeats type safety | Fix the type error |
| Premature optimization | Adds complexity without proof | Optimize after profiling/measurement |
| Cache without invalidation strategy | Stale data | Keep simple; cache only if proven necessary |
| English copy in customer-facing text | Wrong locale for Brazilian market | All UI and email text in pt-BR |
| Money as plain `number` | Loses currency code | Use `Money { amount: Decimal, currency: 'BRL' }` |
| Hardcoded `48` for cancellation window | Breaks per-tenant config | Read `tenants.settings.cancellation_window_hours` |
| Hardcoded `180` for loyalty expiry | Breaks per-tenant config | Read `tenants.settings.loyalty.expiry_days` |

---

## ✅ Definition of "Done"

A feature or fix is **only done** when:

1. **Requirement Met**
   - [ ] Feature matches description from use case
   - [ ] No unrelated changes included

2. **Code Quality**
   - [ ] Follows naming conventions
   - [ ] No code smells (duplication, long functions, etc.)
   - [ ] SOLID principles applied
   - [ ] No hardcoded values
   - [ ] No test data in production code

3. **Tests**
   - [ ] Unit tests written and passing
   - [ ] Integration tests written and passing
   - [ ] Tenant isolation verified
   - [ ] Error cases covered
   - [ ] Test coverage meets threshold (80% on changed code)

4. **Verification**
   - [ ] All local tests pass: `pnpm test`
   - [ ] Linting passes: `pnpm lint`
   - [ ] Type checks pass: `pnpm type-check`
   - [ ] Coverage verified: `pnpm coverage`
   - [ ] No warnings suppressed

5. **Localization**
   - [ ] All customer-facing strings in pt-BR
   - [ ] Money displayed as BRL (`R$ 1.234,56`)
   - [ ] Dates and times shown in the tenant's configured timezone

6. **Documentation**
   - [ ] Code is self-documenting (clear names, minimal comments)
   - [ ] Complex logic has brief "why" comments
   - [ ] Database migration documented and follows Expand/Contract
   - [ ] API changes updated in `docs/14-API_CONTRACTS.md` (if applicable)

7. **CI/CD**
   - [ ] CI pipeline passes all checks
   - [ ] No security vulnerabilities
   - [ ] Ready to merge to main

---

## 🎓 Learning Resources

For developers new to BeloAuto:

1. **Quick Start:**
   - Read `QUICK_REFERENCE.md` (one page)
   - Read `docs/01-BUSINESS_CONTEXT.md` (business rules)

2. **Deep Dive:**
   - Read `docs/02-DOMAIN_MODEL.md` (aggregates)
   - Read `docs/05-BOUNDED_CONTEXTS.md` (architecture)
   - Read `docs/08-TESTING_STRATEGY.md` (how to test)

3. **Implementation:**
   - Reference specific UC from `docs/04-USE_CASES.md`
   - Check events in `docs/03-DOMAIN_EVENTS.md`
   - Check schema in `docs/13-DATABASE_SCHEMA.md`

---

## 🔗 References

- **Principles Origin:** Domain-Driven Design (Evans), Clean Code (Martin), SOLID (Martin)
- **SaaS Best Practices:** The SaaS Playbook (Wilson), AWS Well-Architected Framework
- **Testing:** Test Pyramid (Cohn), TDD (Beck), Integration Testing (Fowler)

---

**Questions? Clarifications?** Ask the team—we value clarity over assumptions.

**Last Updated:** 2026-05-11  
**Status:** Active (enforced for Phase 2+)
