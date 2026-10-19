# AI Agent Documentation - Dynamic Token-Optimized Context Loading

**Status:** Phase 2 - AI Agent Strategy  
**For:** Claude, GitHub Copilot CLI, ChatGPT, and other AI agents working on Ikaro

---

## ⭐ READ FIRST: Engineering Principles

**Authority Document:** `docs/07-ENGINEERING_PRINCIPLES.md`

This is the **north star** for all AI agent work on Ikaro. It contains:
- ✅ 5 Mandatory Principles you must follow
- ✅ AI Agent Code of Conduct (checklist before any coding)
- ✅ Definition of "Done" (when is work actually complete)
- ✅ Forbidden Patterns (what NEVER to do)
- ✅ Test requirements and quality gates

**Before implementing anything, review the "AI Agent Code of Conduct" section.**

---

## 🚫 Critical Protocol: Permission-First Documentation

**AI Agents MUST NOT create or modify any documentation files without explicit user permission.**

### The Mandatory Workflow:
1. **Inquiry/Discussion:** Discuss the topic, requirements, and strategy with the user.
2. **Synthesis:** Provide a concise summary of what was discussed and the proposed content.
3. **Permission:** Ask the user: "May I now create/update the [Document Name] based on this summary?"
4. **Execution:** Only after receiving a "Yes" or "Approved," proceed to write the file.

**Why:** This ensures the user maintains absolute control over the architectural truth and prevents the agent from making unverified assumptions.

---

## The Problem

**Without smart context loading:**
- Agent loads ALL 100KB of docs (2,020 lines) → Wastes tokens
- Agent repeats context in every conversation → Wastes tokens
- Agent includes irrelevant sections → Wastes tokens
- Fewer tokens available for actual coding/design work

**With smart context loading:**
- Agent loads only relevant docs (5-15KB) → Saves tokens
- Agent references docs without repeating → Saves tokens
- Agent includes only needed sections → Saves tokens
- More tokens for actual work ✓

---

## Dynamic Context Loading Strategy

### Phase 1: Agent Initialization

When starting work on Ikaro, load **minimal startup context**:

```markdown
## Startup Context (3-5 KB)
Load ONCE per conversation:

1. PROJECT SUMMARY (from .copilot/context.md)
   - Project name, type, status
   - 5 bounded contexts (1-liner each)
   - Multi-tenancy model (1 paragraph)

2. REFERENCE MAP (from below)
   - Which doc for which question?
   - File locations
   - Search patterns

3. PATTERNS TO FOLLOW (5 key patterns)
   - Tenant-scoped queries
   - Event structure
   - Repository pattern
   - API structure
   - Authentication flow

Result: Agent has enough to answer basic questions without loading full docs
```

### Phase 2: On-Demand Deep Load

When user asks specific questions, **load only relevant documentation**:

#### Pattern A: "Implement Use Case X"
```
Load:
- That specific use case from docs/04-USE_CASES.md (1-2 KB)
- Relevant aggregate from docs/02-DOMAIN_MODEL.md (1-2 KB)
- Relevant events from docs/03-DOMAIN_EVENTS.md (0.5-1 KB)

Don't load:
- Other use cases
- Unrelated aggregates
- Unrelated events
```

**Token saved:** 90-95 KB

#### Pattern B: "Question about Architecture"
```
Load:
- docs/05-BOUNDED_CONTEXTS.md (relevant section, 2-3 KB)
- .copilot/context.md (patterns, 1 KB)

**Note on Archive:** Avoid using files in `docs/archive/` as they contain outdated architectural decisions. Always prefer root `docs/` files.

Don't load:
- Use cases
- Domain model details
- Business context
```

**Token saved:** 85-90 KB

#### Pattern C: "Database Design Question"
```
Load:
- docs/02-DOMAIN_MODEL.md (relevant aggregate, 1-2 KB)
- docs/13-DATABASE_SCHEMA.md (schema details, 2-3 KB)

Don't load:
- Business logic
- Use cases
- Events
```

**Token saved:** 90-95 KB

#### Pattern D: "Authentication/Tenant Question"
```
Load:
- docs/06-TENANT_ISOLATION_STRATEGY.md (full, 3-4 KB)

Don't load:
- Use cases
- Events
- Domain model
```

**Token saved:** 90-95 KB

### Phase 3: Accumulating Context

When **referencing multiple topics**:

```
Conversation progression:
1. First ask: Load startup context (3 KB)
2. Second ask (different topic): Load that doc (2 KB) - Total 5 KB
3. Third ask (previous topic): Reference by section - Don't reload
4. Fourth ask (combining): Reference all loaded - No new loading

Result: After 3-4 asks, agent has 5-8 KB loaded
Never loads all 100 KB unless absolutely necessary
```

---

## Context Files for AI Agents

### 1. `.copilot/context.md` (GitHub Copilot CLI)

**Purpose:** Quick reference for GitHub Copilot CLI agent

**What it contains:**
- Project summary (1 paragraph)
- Bounded contexts table
- Key aggregates table
- Multi-tenancy model (simple)
- User authentication model
- 23 use cases quick list
- Events catalog (simple)
- Common patterns (5 patterns)
- Token optimization tips
- File reference guide
- When to reference which doc

**Size:** 1.8 KB (fast to load)

**When to load:** Always, at start of conversation

---

### 2. `claude.md` / `gemini.md` (AI Agent symlinks)

**Purpose:** Quick reference for Claude and other AI agents.

**Status:** Already created — both `claude.md` and `gemini.md` are symlinks to `.copilot/context.md`.

Canonical content lives in `.copilot/context.md`. Edit that file to update all agents simultaneously.

---

### 3. Future: `gpt.md`, `llama.md`, etc.

For each AI platform, symlink to same context file:
```bash
ln -s .copilot/context.md gpt.md           # OpenAI GPT
ln -s .copilot/context.md llama.md         # Meta Llama
ln -s .copilot/context.md gemini.md        # Google Gemini
ln -s .copilot/context.md azure.md         # Microsoft Azure
```

All point to same core context, customizable per platform.

---

## Document Loading Sequence

### Scenario 1: "Help me implement UC-009"

```
Turn 1:
  ✓ Load: .copilot/context.md (startup context)
  ✓ Load: UC-009 from docs/04-USE_CASES.md
  ✓ Load: Booking aggregate from docs/02-DOMAIN_MODEL.md
  ✓ Load: BookingCompleted event from docs/03-DOMAIN_EVENTS.md
  
  Total: 3-5 KB
  
  Agent can now implement UC-009 completely
  
Turn 2: "Now implement the Loyalty service"
  ✓ Load: Loyalty-related UCs from docs/04-USE_CASES.md (1 KB)
  ✓ Load: LoyaltyEntry aggregate from docs/02-DOMAIN_MODEL.md (0.5 KB)
  ✓ Reference: Previously loaded events (no reload needed)
  
  Total: +1.5 KB (Total now: 4.5-6.5 KB)
  
Turn 3: "Generate tests for both"
  ✓ Reference: All previously loaded (no new load needed)
  ✓ Ask: "Generate Jest tests based on loaded context"
  
  Total: +0 KB (reuse existing 4.5-6.5 KB)
```

**Total tokens spent on documentation:** 4.5-6.5 KB (vs. 100 KB if loaded everything)

**Tokens available for code:** 200K - 6.5K = 193.5K tokens! ✓

---

### Scenario 2: "Design the architecture"

```
Turn 1:
  ✓ Load: .copilot/context.md (startup)
  ✓ Load: docs/05-BOUNDED_CONTEXTS.md (full)
  ✓ Load: docs/BUSINESS_CONTEXT.md (overview section)
  
  Total: 5-8 KB
  
Turn 2: "How should we structure the API?"
  ✓ Load: API design patterns (new doc, future Phase 2)
  ✓ Reference: Previously loaded contexts
  
  Total: +2-3 KB
  
Turn 3: "Create database schema design doc"
  ✓ Load: docs/02-DOMAIN_MODEL.md (all aggregates)
  ✓ Load: docs/06-TENANT_ISOLATION_STRATEGY.md (schema section)
  
  Total: +5-6 KB (Total now: 12-17 KB)
```

**Total tokens on documentation:** 12-17 KB (vs. 100 KB)

**Tokens available for design work:** 200K - 17K = 183K tokens! ✓

---

## Token Budget by Task Type

| Task | Recommended Budget | Startup | Deep Load | Available |
|------|-------------------|---------|-----------|-----------|
| **Quick question** | 5K | 3K | 2K | 195K |
| **Implement one UC** | 10K | 3K | 7K | 190K |
| **Implement feature (3 UCs)** | 20K | 3K | 17K | 180K |
| **Architecture design** | 15K | 3K | 12K | 185K |
| **Full feature + tests** | 30K | 3K | 27K | 170K |
| **Entire context** | 100K | 100K | 0K | 100K |

**Key insight:** Rarely need entire context loaded.

---

## Smart Referencing Patterns

### Pattern 1: Reference by Section

**GOOD:**
```
"From docs/04-USE_CASES.md, UC-009 (Mark Booking Complete):
 Create TypeScript implementation that:
 - Takes booking ID, tenant ID
 - Marks status = COMPLETED
 - Emits BookingCompleted event"
```

**WHY:** Agent loads just UC-009 section, not whole file

---

### Pattern 2: Reference by Search Term

**GOOD:**
```
"Find 'ServicePointsEarned' in docs/03-DOMAIN_EVENTS.md
 Create event handler that..."
```

**WHY:** Agent searches specific section, loads minimal context

---

### Pattern 3: Build on Previous Context

**GOOD:**
```
"Based on previously loaded UC-009 and UC-010,
 generate integration test that covers both transitions"
```

**WHY:** Agent reuses loaded context, doesn't reload

---

### Pattern 4: Combine Contexts Explicitly

**GOOD:**
```
"Using:
 - UC-021 from docs/04-USE_CASES.md
 - Customer multi-tenant model from 06-TENANT_ISOLATION_STRATEGY.md
 - OAuth pattern from .copilot/context.md
 
 Generate login service that..."
```

**WHY:** Agent loads exactly what's needed

---

### Pattern 5: Know Your Boundaries

**GOOD:**
```
"Everything about tenant isolation is in:
 - User model: 06-TENANT_ISOLATION_STRATEGY.md
 - Architecture: docs/06-TENANT_ISOLATION_STRATEGY.md
 - Queries: .copilot/context.md (patterns section)
 
 Create repository that..."
```

**WHY:** Agent knows where to look, loads targeted sections

---

## Documentation Loading Decision Tree

```
Is this a quick question?
├─ YES
│  ├─ Load: .copilot/context.md only
│  └─ Ask: "From X section, answer Y question"
│
└─ NO, I need to implement/design something
   ├─ Is it about USE CASES?
   │  ├─ YES
   │  │  ├─ Load: Specific UC(s) from 04-USE_CASES.md
   │  │  ├─ Load: Relevant aggregate(s) from 02-DOMAIN_MODEL.md
   │  │  └─ Load: Related events from 03-DOMAIN_EVENTS.md
   │  │
   │  └─ NO, it's about ARCHITECTURE?
   │     ├─ YES
   │     │  ├─ Load: docs/05-BOUNDED_CONTEXTS.md
   │     │  └─ Load: Relevant context section from .copilot/context.md
   │     │
   │     └─ NO, it's about AUTHENTICATION?
   │        ├─ YES
   │        │  ├─ Load: 06-TENANT_ISOLATION_STRATEGY.md
   │        │  └─ Load: Multi-tenancy from 06-TENANT_ISOLATION_STRATEGY.md
   │        │
   │        └─ NO, it's about DATABASE/SCHEMA?
   │           ├─ YES
   │           │  ├─ Load: Relevant aggregate from 02-DOMAIN_MODEL.md
   │           │  └─ Load: Schema patterns from docs/06-TENANT_ISOLATION_STRATEGY.md
   │           │
   │           └─ NO, LOAD EVERYTHING (rare)
```

---

## Context File Strategy

### Current Structure
```
.copilot/
└── context.md          ← GitHub Copilot CLI context (1.8 KB)

(docs/)
├── 01-BUSINESS_CONTEXT.md
├── 02-DOMAIN_MODEL.md
├── 03-DOMAIN_EVENTS.md
├── 04-USE_CASES.md
├── 05-BOUNDED_CONTEXTS.md
├── 06-TENANT_ISOLATION_STRATEGY.md
└── README.md
```

### Proposed Structure (Phase 2)

```
.copilot/
└── context.md          ← Core context (GitHub Copilot CLI)

/  (root)
├── claude.md           ← Symlink to .copilot/context.md
├── gpt.md              ← Symlink to .copilot/context.md (future)
├── anthropic.md        ← Symlink to .copilot/context.md (future)
├── ...

docs/
├── 01-BUSINESS_CONTEXT.md
├── 02-DOMAIN_MODEL.md
├── 03-DOMAIN_EVENTS.md
├── 04-USE_CASES.md
├── 05-BOUNDED_CONTEXTS.md
├── 06-06-TENANT_ISOLATION_STRATEGY.md
├── 06-TENANT_ISOLATION_STRATEGY.md
├── 08-AI_AGENT_DOCUMENTATION.md ← This file (strategy guide)
└── README.md
```

**Why symlinks?**
- Single source of truth
- Easy to update for all agents
- Minimal storage overhead
- Agent can check filename to detect platform

---

## Implementation: Creating Symlinks for AI Agents

### Create symlinks for popular AI platforms:

```bash
# Claude (Anthropic)
ln -s .copilot/context.md claude.md

# GPT (OpenAI)
ln -s .copilot/context.md gpt.md

# Gemini (Google)
ln -s .copilot/context.md gemini.md

# LLaMA (Meta)
ln -s .copilot/context.md llama.md

# Azure (Microsoft)
ln -s .copilot/context.md azure.md

# Generic
ln -s .copilot/context.md agent.md
```

### How agents use symlinks:

```typescript
// Agent detects which platform it's running on
const platform = detectPlatform(); // "claude", "gpt", etc.

// Load context for that platform
const contextPath = `${platform}.md`; // e.g., "claude.md"
const context = loadFile(contextPath);

// Context file points to .copilot/context.md automatically
// Agent gets same optimized context for all platforms
```

---

## Conversation Optimization Checklist

### Before each task:

- [ ] Do I need startup context? (Load .copilot/context.md if new conversation)
- [ ] What type of task is this? (Use decision tree above)
- [ ] Which specific documents do I need? (Not all)
- [ ] Should I search for a specific term? (vs. loading whole file)
- [ ] Can I reference something already loaded? (Don't reload)
- [ ] Am I being specific about which section? (UC-009, not "booking stuff")
- [ ] Do I have enough token budget? (Is this worth the doc loading?)

---

## AI Agent Best Practices

### Core Principles ✅

- **Simplicity Over Complexity:** Always prefer the simplest implementation. If a pattern feels too complex for the current stage, simplify it.
- **SaaS Quality:** Code must be production-ready, secure, and multi-tenant aware by default.
- **Verification-Led:** Never assume code works. Write tests or run existing ones to prove correctness.

### DO ✅

- **Be specific:** "UC-009 from docs/04-USE_CASES.md" not "booking stuff"
- **Reference sections:** "From X section of Y file..." instead of loading entire doc
- **Reuse context:** "Based on previously loaded context..." instead of reloading
- **Use decision tree:** Know which doc to load for which task
- **Track tokens:** Keep rough count of loaded docs (3KB + 5KB + 2KB = 10KB)
- **Accumulate efficiently:** Load relevant docs as needed, reuse loaded docs
- **Be explicit:** "Load doc X, reference section Y, generate Z"

### DON'T ❌

- **Overengineer:** Don't add features, abstractions, or "just-in-case" logic not requested by the user or defined in UCs.
- **Load everything:** Entire docs when you only need one section
- **Repeat context:** If already loaded, reference by name instead
- **Be vague:** Ask specific UC numbers, not "something similar"
- **Include unnecessary docs:** Every doc loaded is tokens not available for work
- **Forget multi-tenancy:** Every code example should include tenant_id filtering
- **Ignore patterns:** Follow patterns from .copilot/context.md
- **Skip searches:** Use grep/search for specific terms in large docs

---

## Example: Perfect AI Agent Interaction

```
USER: "Help me implement the booking approval workflow"

AGENT (Step 1 - Load context):
  ✓ Load: .copilot/context.md (quick reference)
  ✓ Determine: This is about UC-003 (Approve Booking)
  
  Asks user: "Should I also implement UC-004 (Reject) and UC-005 (Request Info)?
  And what language/framework?"
  
  [User responds: "Yes, TypeScript/NestJS"]
  
AGENT (Step 2 - Load specific docs):
  ✓ Load: UC-003, UC-004, UC-005 from docs/04-USE_CASES.md (~2 KB)
  ✓ Load: Booking aggregate from docs/02-DOMAIN_MODEL.md (~1 KB)
  ✓ Load: Related events from docs/03-DOMAIN_EVENTS.md (~1 KB)
  
  Confirms: "Loaded 3 use cases + domain model + events. Ready to generate."
  
AGENT (Step 3 - Generate):
  ✓ Creates: NestJS service implementing all 3 use cases
  ✓ Includes: Tenant-scoped queries (from .copilot/context.md)
  ✓ Emits: Events (from loaded 03-DOMAIN_EVENTS.md)
  ✓ Adds: Tests for all 3 workflows
  
USER (Step 4 - Follow-up):
  "Now generate the event handlers for Loyalty context"
  
AGENT (Step 4 - Reuse + add):
  ✓ Reference: Previously loaded Booking events (no reload)
  ✓ Load: Loyalty aggregate from 02-DOMAIN_MODEL.md (~0.5 KB)
  ✓ Load: ServicePointsEarned from 03-DOMAIN_EVENTS.md (~already loaded)
  
  Creates: Loyalty event handlers subscribing to BookingCompleted
  
  [Total docs loaded: ~5.5 KB]
  [Total tokens for docs: ~5.5 KB]
  [Tokens available for code: ~194.5 KB]
```

---

## Scaling AI Agent Documentation

### As the project grows:

1. **Add context file per platform:**
   - Each agent gets their own optimized context
   - Core patterns stay in `.copilot/context.md`
   - Platform-specific tips in separate sections

2. **Create specialized contexts:**
   - `frontend-context.md` - React-specific patterns
   - `backend-context.md` - NestJS-specific patterns
   - `database-context.md` - Database design patterns
   - `testing-context.md` - Test patterns

3. **Build context index:**
   - Document which context files exist
   - When to load which file
   - How files relate to each other

4. **Monitor token usage:**
   - Track which docs agents load most
   - Consolidate frequently-used sections
   - Split rarely-used sections

---

## Summary

### Key Principles

1. **Load only what you need** - Saves ~90% of tokens
2. **Reference instead of repeating** - Accumulate context, don't reload
3. **Use decision tree** - Know which doc to load for which task
4. **Create symlinks** - Same context for all AI platforms
5. **Be specific** - UC-009, not "booking stuff"
6. **Track tokens** - Roughly count loaded docs
7. **Build on previous context** - Reference already-loaded docs

### Result

- **Fewer tokens wasted** on documentation
- **More tokens available** for actual work
- **Consistent patterns** across all AI platforms
- **Scalable approach** as project grows
- **Clear guidelines** for all future agents

---

**Status:** Phase 2 - AI Agent Strategy  
**Last Updated:** 2026-05-11  
**Next:** Create platform-specific context files (claude.md, gpt.md, etc.)
t.md, etc.)
