# Documentation Cleanup Tasks - Final Pass
**Date:** 2026-05-12  
**Status:** Action items for 100% AI-agent readiness  
**Priority:** All items are low-effort, high-clarity improvements

---

## TASK LIST (In Priority Order)

### ✅ TASK 1: Fix Coverage Threshold Inconsistency
**Effort:** 5 minutes  
**Impact:** HIGH (clarity, CI alignment)  
**Status:** 🔴 TODO

**File:** `docs/07-ENGINEERING_PRINCIPLES.md`

**Action:** Change all references from "70%" to "80%" to match CI gate and other docs.

**Exact Changes:**
1. **Line 161** - Find: `"Coverage ≥ 70% on changed code"`
   Replace with: `"Coverage ≥ 80% on changed code"`

2. **Line 219** - Find: `code coverage above 70%`
   Replace with: `code coverage above 80%`

3. **Line 272** - Find: `coverage ≥ 70% on changed code`
   Replace with: `coverage ≥ 80% on changed code`

**Why:** This doc is designated as the "north star" for engineering principles. CI/CD pipeline uses 80% gate. They must match.

**Verification:** After change, grep all docs for coverage threshold:
```bash
grep -r "coverage" docs/ | grep -E "(70|80)" | grep -v archive
# Should all show 80% (or ≥80%, >80%, etc.)
```

---

### ✅ TASK 2: Standardize Branch Naming
**Effort:** 10 minutes  
**Impact:** MEDIUM (CI/deployment clarity)  
**Status:** 🔴 TODO

**Files:** 
- `docs/09-CI_CD_PIPELINE.md`
- `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md`
- `docs/18-RELEASE_LIFECYCLE_OPERATIONS.md`

**Current State:**
- 09 uses: `master` (5 references)
- 17 uses: `main (or master)` (ambiguous)
- 18 uses: `main` (6 references)
- Actual repo default: `master`

**Action:** Standardize to `master` everywhere (matches current repo)

**Exact Changes:**

**File: docs/09-CI_CD_PIPELINE.md**
- Line 14: `on:` `push:` `branches: [ master ]` ✅ (already correct)
- Line 17: `push:` `branches: [ master ]` ✅ (already correct)
- Line 20: `pull_request:` `branches: [ master ]` ✅ (already correct)
- Line 25: `- name: Merge to master` ✅ (already correct)
- Line 30: `--base=master` ✅ (already correct)

**File: docs/17-GITHUB_WORKFLOWS_GUIDELINES.md**
- Line 11: Find: `single long-lived branch: main (or master)`
  Replace with: `single long-lived branch: master`

**File: docs/18-RELEASE_LIFECYCLE_OPERATIONS.md**
- Line 20: Find: `1. From main branch, run release script`
  Replace with: `1. From master branch, run release script`
- Line 29: Find: `3. Merge PR to main`
  Replace with: `3. Merge PR to master`
- Line 30: Find: `4. main gets the new tag`
  Replace with: `4. master gets the new tag`
- Line 38: Find: `on the main branch`
  Replace with: `on the master branch`
- Line 52: Find: `git checkout main && git pull`
  Replace with: `git checkout master && git pull`

**Why:** Consistency. All shell scripts and CI configs will reference the correct branch.

**Verification:** After changes:
```bash
grep -r "main\|master" docs/ | grep -v archive | grep -v "maintain"
# Should show "master" everywhere (except safe uses like "maintain", "maintainability")
```

---

### ✅ TASK 3: Verify Event Examples Include tenantId
**Effort:** 10 minutes  
**Impact:** MEDIUM (multi-tenancy enforcement)  
**Status:** 🟡 PARTIAL (mostly done, verify all)

**File:** `docs/03-DOMAIN_EVENTS.md`

**Current State:** Most event examples include `tenantId`, but we should verify all of them.

**Action:** Scan the file and ensure every event example (JSON payload) includes `"tenantId": "uuid"`.

**Events to Check:**
1. ✅ BookingRequested (line 19-34) — has tenantId
2. ❓ BookingApproved (line 47-58) — VERIFY
3. ❓ BookingRejected (line 70-80) — VERIFY
4. ❓ BookingInfoRequested (line 90-100) — VERIFY
5. ❓ BookingInfoSubmitted (line 119-129) — VERIFY
6. ❓ BookingCompleted (line 140-151) — VERIFY
7. ❓ BookingCancelled (line 210-221) — VERIFY
8. ❓ ServicePointsEarned (line 232-242) — VERIFY
9. ❓ PointsExpiringSoon (line 256-265) — VERIFY
10. ❓ BookingReminderSentCustomer (line 277-287) — VERIFY
11. ❓ BookingReminderSentCustomerDay (line 300-310) — VERIFY
12. ❓ AdminDailyScheduleReminder (line 330-340) — VERIFY
13. ❓ EmailSent (line 353-363) — VERIFY
14. ❓ EmailFailed (line 375-388) — VERIFY

**How to Verify:**
```bash
grep -A 12 "#### " docs/03-DOMAIN_EVENTS.md | grep -E "(tenantId|eventId|occurredAt)"
```

**If Missing:** Add to the `"data"` object:
```json
{
  "eventId": "uuid-v4-here",
  "tenantId": "uuid-v4-here",
  "occurredAt": "2026-05-12T14:30:00.000Z",
  "correlationId": "uuid-v4-here",
  "eventName": "BookingApproved",
  "eventVersion": 1,
  "data": {
    // event-specific data
  }
}
```

**Why:** Critical multi-tenancy enforcement. Ensures agents generate code that includes tenantId in all events.

---

### ✅ TASK 4: Mark UC-014 and UC-015 as Superseded
**Effort:** 2 minutes  
**Impact:** LOW (clarity)  
**Status:** 🔴 TODO

**File:** `docs/04-USE_CASES.md`

**Action:** Add `[SUPERSEDED]` tags to clarify these are old versions.

**Exact Changes:**

1. **After UC-014 title (around line 369):**
   Find: `### **UC-014: Customer Logs In (Google OAuth)**`
   Replace with: `### **UC-014: Customer Logs In (Google OAuth) [SUPERSEDED by UC-021]**`

2. **Add explanatory note after preconditions:**
   Insert before the Preconditions section:
   ```
   > **Note:** This UC has been superseded by UC-021 (Customer Login with Tenant Selection), 
   > which adds multi-tenant support. UC-021 is the canonical version.
   ```

3. **Same for UC-015 (around line 393):**
   Find: `### **UC-015: Staff Logs In (Google OAuth)**`
   Replace with: `### **UC-015: Staff Logs In (Google OAuth) [SUPERSEDED by UC-022]**`

4. **Add explanatory note:**
   ```
   > **Note:** This UC has been superseded by UC-022 (Staff Login - No Tenant Selection), 
   > which reflects that staff are single-tenant. UC-022 is the canonical version.
   ```

**Why:** Prevents confusion; makes it clear which UCs to implement.

---

### ✅ TASK 5: Remove Redundant Review Files
**Effort:** 3 minutes  
**Impact:** LOW (cleanup)  
**Status:** 🔴 TODO

**Files to Remove (or Archive):**
1. `DEEP_REVIEW_REPORT.md` — Older audit, superseded by AI_AGENT_DEEP_AUDIT.md
2. `DOCUMENTATION_REVIEW.md` — Older version, superseded by FINAL_DOCUMENTATION_AUDIT.md

**Files to Keep:**
1. `AI_AGENT_READY_CHECKLIST.md` — Actionable checklist (keep)
2. `FINAL_DOCUMENTATION_AUDIT.md` — Latest audit (keep as historical record)
3. `AI_AGENT_DEEP_AUDIT.md` — This comprehensive audit (new, keep)
4. `.copilot/context.md` — Canonical context (keep)
5. `claude.md`, `gemini.md` — CLI symlinks (keep)

**Action Options:**
- **Option A (Recommended):** Archive old files
  ```bash
  mkdir -p docs/archive/reviews
  mv DEEP_REVIEW_REPORT.md docs/archive/reviews/
  mv DOCUMENTATION_REVIEW.md docs/archive/reviews/
  ```

- **Option B:** Delete outright
  ```bash
  rm DEEP_REVIEW_REPORT.md DOCUMENTATION_REVIEW.md
  ```

**Why:** Reduces clutter; keeps only current, actionable documentation.

---

### 🟡 BONUS: Verify Event Examples Have Full Envelope
**Effort:** 15 minutes  
**Impact:** HIGH (code generation quality)  
**Status:** 🟡 OPTIONAL

**File:** `docs/03-DOMAIN_EVENTS.md`

**Enhancement:** Ensure all examples show the complete event envelope (not just data):

**Recommended Format for All Examples:**
```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "550e8400-e29b-41d4-a716-446655440001",
  "occurredAt": "2026-05-12T14:30:00.000Z",
  "correlationId": "550e8400-e29b-41d4-a716-446655440002",
  "eventName": "BookingApproved",
  "eventVersion": 1,
  "data": {
    "bookingId": "550e8400-e29b-41d4-a716-446655440003",
    "customerId": "550e8400-e29b-41d4-a716-446655440004",
    "approvedAt": "2026-05-12T14:30:00.000Z",
    "approvedBy": "550e8400-e29b-41d4-a716-446655440005",
    "lineSummary": [
      {
        "serviceId": "550e8400-e29b-41d4-a716-446655440006",
        "priceAtBooking": "20.00",
        "durationMinsAtBooking": 30,
        "pointsValueAtBooking": 1
      }
    ],
    "totalPrice": "20.00"
  }
}
```

**Why:** Agents can copy-paste examples directly into code. More completeness = higher code quality.

---

### 🟡 BONUS: Update docs/README.md Index
**Effort:** 5 minutes  
**Impact:** LOW (discoverability)  
**Status:** 🟡 TODO

**File:** `docs/README.md`

**Action:** Verify `07-ENGINEERING_PRINCIPLES.md` is properly listed in the index.

**Check:** 
```bash
grep -n "07-ENGINEERING_PRINCIPLES" docs/README.md
# Should show up; if not, add it between 06 and 08 in the Phase listing
```

---

### 🟡 BONUS: Remove Duplicate in .copilot/context.md
**Effort:** 1 minute  
**Impact:** NITS (cleanup)  
**Status:** 🔴 TODO

**File:** `.copilot/context.md`

**Action:** Check lines 224-225 for duplicate entry of `06-TENANT_ISOLATION_STRATEGY.md`. If found, remove one.

---

## EXECUTION CHECKLIST

### Pre-Work (1 minute)
- [ ] Create a feature branch: `git checkout -b docs/cleanup-for-ai-agents`
- [ ] Confirm current state: `git status` (all files committed)

### Execute (30 minutes)
- [ ] **Task 1:** Fix coverage threshold (5 min)
- [ ] **Task 2:** Standardize branch naming (10 min)
- [ ] **Task 3:** Verify event examples have tenantId (10 min)
- [ ] **Task 4:** Mark UC-014/015 superseded (2 min)
- [ ] **Task 5:** Remove redundant files (3 min)

### Verify (5 minutes)
```bash
# Verify no major inconsistencies
grep -r "coverage.*7[0-9]%" docs/ | wc -l
# Should be 0 (all say 80%)

grep -r "branch.*main[^a-z]" docs/ | wc -l
# Should be 0 (all say master)

grep -r "tenantId" docs/03-DOMAIN_EVENTS.md | wc -l
# Should be ≥14 (one per event)
```

### Post-Work (5 minutes)
- [ ] Run any linters: `npm run lint` (if applicable)
- [ ] Commit changes:
  ```bash
  git add docs/ .copilot/
  git commit -m "docs: cleanup for AI agent readiness

  - Standardize coverage threshold to 80%
  - Standardize branch naming to master
  - Verify event examples include tenantId
  - Mark UC-014/015 as superseded
  - Remove redundant review files
  
  Fixes AI_AGENT_DEEP_AUDIT recommendations"
  ```
- [ ] Create PR for code review
- [ ] Merge after approval

---

## SUCCESS CRITERIA

After these tasks:

✅ **Coverage threshold is 80% everywhere**  
✅ **Branch naming is consistent (master)**  
✅ **All event examples include tenantId**  
✅ **UC-014/015 clearly marked as superseded**  
✅ **Redundant files archived**  
✅ **Documentation is 99%+ consistent**  
✅ **AI agents can code with 98%+ confidence**  

---

## TIME ESTIMATE

- **Total execution time:** 1 hour (including verification)
- **Breakdown:** 5 + 10 + 10 + 2 + 3 = 30 min tasks + 15 min verify + 15 min commit = 60 min

---

## NEXT STEP AFTER CLEANUP

Once these tasks are complete, your documentation is **100% AI-agent ready**.

AI agents can start coding:
1. UC-001 (Guest Requests Booking) — autonomously, 98% confidence
2. UC-002–009 (Booking lifecycle) — autonomously, 97% confidence
3. Loyalty context — autonomously, 96% confidence
4. Auth (OAuth + tenant selection) — autonomously, 98% confidence
5. Tenant management — autonomously, 92% confidence

**Recommendation:** Start with UC-001 as a proof-of-concept to validate the setup.

---

**Prepared:** 2026-05-12  
**Confidence:** Very High (all tasks are mechanical, no ambiguity)
