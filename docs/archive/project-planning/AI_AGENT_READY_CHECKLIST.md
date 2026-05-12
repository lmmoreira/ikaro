# AI-Agent Development Readiness Checklist

**Status:** 8/10 Ready (Minor Issues Blocking Full Autonomy)  
**Date:** 2026-05-11  
**Last Updated:** Current session

---

## 🔴 BLOCKERS - MUST FIX BEFORE FIRST CODE COMMIT

### [ ] 1. UC-007 Cancellation Window Configuration
- **Issue:** UC text says "48 hours" (hardcoded), but should reference `tenants.settings.cancellation_window_hours`
- **Location:** `04-USE_CASES.md:211`
- **AI Risk:** Medium-High (will hardcode `48` in production code)
- **Action:** Update main flow step 1 to reference tenant config
- **Time to Fix:** 10 minutes

### [ ] 2. UC-008 Reschedule Flow Specification
- **Issue:** Alt-flow A1 is one line; unclear whether reschedule = cancel + new request or single operation
- **Location:** `04-USE_CASES.md:247-248`
- **AI Risk:** High (will implement reschedule inconsistently)
- **Action:** Either expand with full flow OR mark "defer to Phase 2"
- **Time to Fix:** 30 minutes + user decision

### [ ] 3. Missing Critical Use Cases (UC-024–027)
- **Issue:** 4 MVP-blocking UCs missing: tenant onboarding, staff invite, tenant settings, hotsite management
- **Location:** `04-USE_CASES.md` (new sections needed)
- **AI Risk:** Very High (cannot implement tenant management without these)
- **Action:** Add these UCs in standard format OR explicitly mark "out of scope for MVP"
- **Time to Fix:** 2 hours (if MVP-blocking) OR 30 min (if out-of-scope)
- **User Decision Required:** YES

---

## 🟠 MAJOR ISSUES - SHOULD FIX BEFORE FEATURE-COMPLETE

### [ ] 4. API Error Catalog
- **Issue:** Only 4 error codes documented; no comprehensive RFC 9457 catalog
- **Location:** Create `docs/25-ERROR_CATALOG.md`
- **AI Risk:** Low (frontend will handle, but inconsistent)
- **Action:** Create formal error catalog with type URIs
- **Time to Fix:** 1 hour

### [ ] 5. File Upload Constraints
- **Issue:** Max size, MIME types, storage paths not specified
- **Location:** `14-API_CONTRACTS.md:74–78`
- **AI Risk:** Low (optional feature in MVP)
- **Action:** Add constraints to API spec
- **Time to Fix:** 20 minutes

### [ ] 6. Schedule Closures Schema — `staff_id` Missing
- **Issue:** Can't distinguish system-wide closures from staff-specific
- **Location:** `13-DATABASE_SCHEMA.md:156–164`
- **AI Risk:** Low (current design works)
- **Action:** Add optional `staff_id UUID FK` column
- **Time to Fix:** 30 minutes

### [ ] 7. Tenants Settings Schema Formalization
- **Issue:** JSONB keys not validated; future settings unclear
- **Location:** Create `docs/21-TENANTS_SETTINGS_SCHEMA.md`
- **AI Risk:** Medium (will hardcode settings logic without schema)
- **Action:** Define formal settings schema with type constraints
- **Time to Fix:** 1 hour

---

## 🟡 MINOR ISSUES - NICE TO HAVE

### [ ] 8. Event Versioning Strategy
- **Issue:** No guidance on consumer migration during version bump
- **Location:** Expand `03-DOMAIN_EVENTS.md`
- **Time to Fix:** 1 hour

### [ ] 9. API Pagination Specification
- **Issue:** List endpoints have no pagination strategy defined
- **Location:** `14-API_CONTRACTS.md`
- **Time to Fix:** 30 minutes

### [ ] 10. Mark Superseded UCs
- **Issue:** UC-014 & UC-015 not marked as `[SUPERSEDED]` in doc
- **Location:** `04-USE_CASES.md`
- **Time to Fix:** 5 minutes

---

## ✅ PREREQUISITES FOR AI-AGENT DEVELOPMENT

### [ ] User Decisions Required:

1. **Reschedule Scope**
   - [ ] Expand UC-008 A1 with full specification, OR
   - [ ] Defer reschedule to Phase 2 (MVP: admin cancels + customer re-books)

2. **MVP-Blocking UCs**
   - [ ] UC-024: Onboard new tenant — MVP or Phase 2?
   - [ ] UC-025: Invite staff member — MVP or Phase 2?
   - [ ] UC-026: Edit tenant settings — MVP or Phase 2?
   - [ ] UC-027: Manage hotsite content — MVP or Phase 2?

3. **File Upload Constraints**
   - [ ] Max file size (MB)?
   - [ ] Accepted MIME types? (JPEG/PNG only?)
   - [ ] Upload URL expiration? (1 hour / 24 hours?)

4. **Tech Stack Decisions** (from AI_IMPLEMENTATION_READINESS.md)
   - [ ] ORM: TypeORM or Prisma?
   - [ ] NestJS version: v11 or v12?
   - [ ] Frontend build: Vite or Next.js?
   - [ ] React version: 18 or 19?
   - [ ] Database migration tool: TypeORM, Prisma, or Flyway?
   - [ ] Event bus (prod): RabbitMQ (containerized) or cloud (SQS/Pub/Sub)?
   - [ ] Deployment platform: AWS Fargate, GCP Cloud Run, or Kubernetes?
   - [ ] Secrets manager: AWS Secrets Manager, GCP, or HashiCorp Vault?

### [ ] Documentation Fixes:

- [ ] Fix #1: UC-007 cancellation window (10 min)
- [ ] Fix #2: UC-008 reschedule (30 min + decision)
- [ ] Fix #3: Add/mark UC-024–027 (2 hours or 30 min)
- [ ] Fix #4: API error catalog (1 hour)
- [ ] Fix #5: File upload constraints (20 min)
- [ ] Fix #6: Schedule closures schema (30 min)
- [ ] Fix #7: Tenants settings schema (1 hour)

---

## 📊 READINESS SCORECARD

| Category | Score | Status | Blocker? |
|----------|-------|--------|----------|
| **Domain Model** | 9/10 | Excellent | ❌ No |
| **Events** | 9/10 | Excellent | ❌ No |
| **Use Cases** | 7/10 | Good | ✅ YES (reschedule + missing UCs) |
| **Database Schema** | 8/10 | Good | ❌ No (minor additions OK) |
| **API Contracts** | 7/10 | Good | ❌ No |
| **Architecture** | 9/10 | Excellent | ❌ No |
| **Testing** | 9/10 | Excellent | ❌ No |
| **Eng. Principles** | 9/10 | Excellent | ❌ No |
| **Multi-Tenancy** | 9/10 | Excellent | ❌ No |

**Overall: 8.2/10 — READY (with blockers resolved)**

---

## 🚀 WHAT AI AGENTS CAN DO RIGHT NOW

✅ Implement UC-001 through UC-009 (all core booking features)  
✅ Generate multi-tenant-safe repositories  
✅ Create domain aggregates matching the model exactly  
✅ Write comprehensive tests (70% unit, 25% integration, 5% E2E)  
✅ Generate event handlers with idempotency  
✅ Scaffold NestJS modules with proper DI  
✅ Create login/auth flows (UC-021 to UC-023)  

---

## 🤔 WHAT AI AGENTS MUST ASK ABOUT

❓ Reschedule implementation details?  
❓ Which 4 UCs (024–027) are MVP-blocking?  
❓ File upload size/MIME/expiration constraints?  
❓ Slot interval strategy (30 min? 1 hour? variable)?  
❓ Timezone handling (UTC-only or per-tenant)?  

---

## 🎯 NEXT STEPS

### **For You (User):**
1. Review the 3 blocker fixes above
2. Provide user decisions (reschedule scope, missing UCs, file upload constraints)
3. Decide tech stack (8 decisions in Prerequisites section)
4. Create GitHub issues for documentation fixes

### **For AI Agents (Once Prerequisites Arrive):**
1. Apply documentation fixes
2. Generate project scaffolds (Dockerfile, docker-compose, GH Actions, Terraform)
3. Create database migrations
4. Scaffold NestJS structure
5. Implement first UC (UC-001 or UC-002)

---

## 📋 VERIFICATION BEFORE FIRST COMMIT

Every code change must verify:

- ✅ All queries include `tenant_id` filter
- ✅ All events include `tenantId` in envelope
- ✅ All FKs use composite `(tenant_id, id)` pattern
- ✅ Event handlers are idempotent (deduplicate on `eventId`)
- ✅ Tests include tenant-isolation scenario
- ✅ Coverage ≥ 80% on changed code
- ✅ No hardcoded config values (read from `tenants.settings`)
- ✅ No `any`, `@ts-ignore`, `// eslint-disable`
- ✅ Functions ≤ 20 lines, classes ≤ 200 lines
- ✅ Conventional Commits format

---

**Overall Status:** ✅ **AI agents can begin coding after blockers are resolved**

**Estimated Time to Unblock:** 3.5 hours (1 hour user decisions + 2.5 hours doc fixes)  
**Then:** AI can generate production code autonomously with 95%+ confidence
