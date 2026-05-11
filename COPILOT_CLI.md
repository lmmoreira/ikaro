# GitHub Copilot CLI Guide - BeloAuto

**For developers working with GitHub Copilot CLI on the BeloAuto project**

---

## What is BeloAuto?

Multi-tenant car wash service management SaaS platform. Multiple car wash companies (tenants) manage bookings, staff, customer loyalty, and notifications through a single cloud-native platform.

---

## Key Context (Read First)

### Architecture
- **5 Bounded Contexts:** Booking, Customer, Loyalty, Notification, Staff
- **Pattern:** Domain-Driven Design + Hexagonal Architecture (ports & adapters)
- **Data:** Single PostgreSQL database, partitioned by `tenant_id`
- **Multi-Tenancy:** Customers can use multiple tenants. Staff belongs to exactly ONE tenant.

### Tech Stack (Planned Phase 2)
- Backend: Node.js/TypeScript (or Python, TBD)
- Frontend: React/Vue (TBD)
- Database: PostgreSQL
- Deployment: Docker + Terraform
- Cloud: GCP (cloud-agnostic design)

### Current Status
- ✅ Phase 1: Complete (DDD, events, use cases, multi-tenancy, user model)
- ⏳ Phase 2: Starting (Technical architecture, API design, database schema)

---

## How to Work With Me (GitHub Copilot CLI)

### Best Practices

**1. Be Specific About Context**
```
Instead of: "Generate booking code"
Better: "Generate UC-009 implementation (Mark booking complete)
        Based on Booking aggregate from DOMAIN_MODEL.md
        Context: Booking completed event must trigger loyalty context"
```

**2. Reference Documentation**
```
"From docs/02-DOMAIN_MODEL.md, Booking aggregate...
 Create TypeScript class implementing this aggregate"
```

**3. Specify Output Format**
```
"Generate as TypeScript with:
 - Repository pattern
 - Dependency injection
 - Unit tests (Jest)"
```

**4. Tenant-Scoped Queries**
```
"Generate database query that:
 - Filters by tenant_id
 - Follows pattern: WHERE tenant_id = ? AND status = ?"
```

### Common Tasks & How to Ask

#### Task: Implement a Use Case
```bash
copilot "Implement UC-021: Customer Login with Tenant Selection

Reference:
- docs/04-USE_CASES.md UC-021
- USER_TENANT_MODEL.md (customer multi-tenant)
- docs/02-DOMAIN_MODEL.md (Customer aggregate)

Generate:
- TypeScript/Node implementation
- Include Google OAuth flow
- Tenant selection logic
- Session management"
```

#### Task: Create Database Migration
```bash
copilot "Create database migration for Booking aggregate

From docs/02-DOMAIN_MODEL.md:
- Booking table with tenant_id
- Services table with tenant_id
- Customers table

Requirements:
- All tables tenant_id (NOT NULL, indexed)
- Foreign keys include tenant_id
- Constraints: tenant_id isolation"
```

#### Task: Generate API Endpoint
```bash
copilot "Generate POST /api/bookings endpoint

Based on UC-001: Guest Requests Booking
From docs/04-USE_CASES.md

Requirements:
- Accept: name, email, phone, serviceId, preferredDate, photos
- Validate: email, phone, availability
- Create: Booking aggregate (status=PENDING)
- Emit: BookingRequested event
- Return: booking confirmation

Use TypeScript, Express, follow DDD patterns"
```

#### Task: Write Tests
```bash
copilot "Write Jest tests for booking service

Test cases from docs/04-USE_CASES.md:
- UC-001: Guest booking creation
- UC-009: Mark booking complete
- UC-007: Customer cancels booking

Include:
- Unit tests (mocks)
- Happy path + error cases
- Tenant isolation verification"
```

#### Task: Create Event Handler
```bash
copilot "Create event listener for BookingCompleted

From docs/03-DOMAIN_EVENTS.md:
- Event: BookingCompleted (includes tenantId)
- Consumer: Loyalty Context
- Action: Calculate and award points per service

Requirements:
- Subscribe to BookingCompleted
- Call Loyalty service
- Emit ServicePointsEarned event
- Handle errors with retry"
```

---

## Key Documentation

### Quick Start
- **1 page overview:** `docs/QUICK_REFERENCE.md`
- **User auth model:** `USER_TENANT_MODEL.md`
- **Multi-tenancy:** `MULTI_TENANCY_ARCHITECTURE.md`

### Core Architecture
- **Business context:** `docs/01-BUSINESS_CONTEXT.md`
- **Domain model:** `docs/02-DOMAIN_MODEL.md` (aggregates, entities)
- **Events catalog:** `docs/03-DOMAIN_EVENTS.md`
- **Use cases:** `docs/04-USE_CASES.md` (23 workflows)
- **Contexts:** `docs/05-BOUNDED_CONTEXTS.md` (architecture)

### Reference
- **Quick reference:** `docs/QUICK_REFERENCE.md` (table format)
- **Archived:** `docs/archive/` (historical, don't use)

---

## Common Patterns

### Tenant-Scoped Query Pattern
```typescript
// CORRECT - always filter by tenant_id
const bookings = await bookingRepository.findByTenantAndStatus(
  tenantId,
  "APPROVED"
);

// WRONG - missing tenant_id filter
const bookings = await db.query("SELECT * FROM bookings WHERE status = ?");
```

### Domain Event Pattern
```typescript
// Event includes tenantId
const event = {
  tenantId: "tenant_a",
  bookingId: "booking_123",
  status: "COMPLETED",
  timestamp: new Date()
};

// Emitted to event bus
eventBus.emit("BookingCompleted", event);

// Subscriber filters by tenantId
eventBus.on("BookingCompleted", (event) => {
  if (event.tenantId !== currentTenant) return; // Ignore other tenants
  // Process event
});
```

### Bounded Context Communication
```typescript
// Booking Context publishes event
const bookingCompleted = new BookingCompletedEvent(booking);
await eventBus.publish(bookingCompleted);

// Loyalty Context subscribes and reacts
@EventHandler(BookingCompletedEvent)
async handleBookingCompleted(event: BookingCompletedEvent) {
  const loyalty = await loyaltyRepo.findByCustomerAndTenant(
    event.customerId,
    event.tenantId
  );
  loyalty.addPoints(event.points);
  await loyaltyRepo.save(loyalty);
}
```

### Multi-Tenant Repository Pattern
```typescript
// Repository includes tenant context
class BookingRepository {
  async findById(bookingId: string, tenantId: string): Promise<Booking> {
    return db.query(
      "SELECT * FROM bookings WHERE id = ? AND tenant_id = ?",
      [bookingId, tenantId]
    );
  }

  async save(booking: Booking, tenantId: string): Promise<void> {
    await db.execute(
      "INSERT INTO bookings (..., tenant_id) VALUES (..., ?)",
      [...booking.toValues(), tenantId]
    );
  }
}
```

---

## Token Budget

Plan ahead to use tokens efficiently:

| Task | Budget | Approach |
|------|--------|----------|
| Quick question | 5K | Ask directly, reference section |
| Small implementation | 20K | Provide use case + one context |
| Feature endpoint | 40K | Full use case + domain model |
| Full feature | 60K | Use case + domain + events + tests |
| Architecture decision | 80K | Multiple bounded contexts + patterns |

**Optimization tips:**
- Ask for summaries: "Summarize in 100 words"
- Reference specific docs: "Section X from file Y"
- Don't repeat: "Based on previous conversation"
- Be precise: Exact UC number, not "something similar"

---

## Anti-Patterns (Don't Do This)

❌ **Missing tenant_id in queries**
```typescript
// WRONG
const booking = await db.query("SELECT * FROM bookings WHERE id = ?");
```

❌ **Creating events without tenantId**
```typescript
// WRONG
const event = { bookingId: "123", status: "COMPLETED" };
```

❌ **Cross-tenant data access**
```typescript
// WRONG - Staff from tenant_a accessing tenant_b data
const bookings = await bookingRepo.findByStatus("APPROVED");
```

❌ **Not isolating staff to single tenant**
```typescript
// WRONG - Staff in multiple tenants
const staff = await staffRepo.findByEmail("john@example.com");
// Could return staff from multiple tenants
```

❌ **Asking without reference**
```
// VAGUE
"Generate booking code"

// GOOD
"Generate UC-009 implementation based on DOMAIN_MODEL.md Booking aggregate"
```

---

## File Structure

```
/beloauto
├── COPILOT_CLI.md ← You are here (how to work with me)
├── .copilot/
│   └── context.md (my internal instructions)
├── README.md (project overview)
├── USER_TENANT_MODEL.md (auth model)
├── MULTI_TENANCY_ARCHITECTURE.md (multi-tenant design)
├── docs/
│   ├── README.md (index)
│   ├── 01-BUSINESS_CONTEXT.md
│   ├── 02-DOMAIN_MODEL.md
│   ├── 03-DOMAIN_EVENTS.md
│   ├── 04-USE_CASES.md
│   ├── 05-BOUNDED_CONTEXTS.md
│   ├── QUICK_REFERENCE.md ← Start here!
│   └── archive/ (historical docs)
├── src/ (Phase 2 - code)
└── tests/ (Phase 2 - tests)
```

---

## Next Steps

**Phase 2 starts with:**
1. ARCHITECTURE.md - System design
2. TECHNICAL_DECISIONS.md - ADRs
3. DATABASE_SCHEMA.md - Tables with tenant_id
4. API_CONTRACTS.md - Endpoints
5. Code generation from use cases

**Use me for:**
- Generating code from use cases
- Creating database migrations
- Writing tests
- Implementing bounded contexts
- Creating API endpoints
- Code reviews against architecture

---

## Example Conversation

```
You: "Implement UC-014: Customer Login"
Me: "Summarizing... Customer login with tenant selection if multiple tenants.
    Need more details: Language preference? Framework? Include tests?"

You: "TypeScript/Node.js, Express.js, include tests"
Me: "Generating implementation based on USER_TENANT_MODEL.md and UC-014.
    Using: Express, Google OAuth, Session management.
    Creating: LoginService, route handler, tests."

You: "Add database query for finding customer in multiple tenants"
Me: "Adding tenant lookup query. Follows pattern from DOMAIN_MODEL.md.
    Including tenant selection UI logic."

You: "Generate the tests"
Me: "Creating Jest tests for: OAuth flow, single tenant, multi-tenant,
    session creation, tenant selection."
```

---

## Questions?

For questions about:
- **Architecture:** Reference `docs/05-BOUNDED_CONTEXTS.md`
- **Use cases:** Reference `docs/04-USE_CASES.md`
- **Domain:** Reference `docs/02-DOMAIN_MODEL.md`
- **Auth:** Reference `USER_TENANT_MODEL.md`
- **Events:** Reference `docs/03-DOMAIN_EVENTS.md`

Or ask me directly: "What's the pattern for [X]?"

---

**Ready to build? Let's go! 🚀**
