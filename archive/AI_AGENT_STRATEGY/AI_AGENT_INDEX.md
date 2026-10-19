# AI Agent Documentation Index - Quick Navigation

**Status:** ✅ Complete  
**Created:** 2026-05-11  
**Purpose:** Find the right AI documentation for your task

---

## 🎯 Start Here (Pick Your Path)

### Path 1: "I want to understand the strategy" (30 min)
```
1. Read this file (2 min)
2. Read: AI_AGENT_README.md (10 min)
3. Read: AGENT_CONTEXT_STRUCTURE.md (18 min)
4. Reference: .copilot/context.md as needed
```

### Path 2: "I want to use this with Claude" (5 min)
```
1. Read: claude.md (quick ref)
2. Read: AI_AGENT_README.md (summary)
3. Start asking specific questions!
```

### Path 3: "I want to use this with other AI" (5 min)
```
1. Read: gpt.md, gemini.md, etc. (quick ref)
2. Read: AI_AGENT_README.md (summary)
3. Start asking specific questions!
```

### Path 4: "I want the deep technical details" (90 min)
```
1. Read: AI_AGENT_README.md (10 min)
2. Read: docs/08-AI_AGENT_DOCUMENTATION.md (45 min)
3. Read: AGENT_CONTEXT_STRUCTURE.md (18 min)
4. Read: .copilot/context.md (5 min)
5. Read: COPILOT_CLI.md (12 min)
```

---

## 📚 Document Overview

### Core Documentation

| File | Size | Purpose | Read Time |
|------|------|---------|-----------|
| **claude.md** | Link | Claude context (→ .copilot/context.md) | 2 min |
| **gpt.md** | Link | GPT context (→ .copilot/context.md) | 2 min |
| **gemini.md** | Link | Gemini context (→ .copilot/context.md) | 2 min |
| **anthropic.md** | Link | Anthropic context (→ .copilot/context.md) | 2 min |
| **llama.md** | Link | LLaMA context (→ .copilot/context.md) | 2 min |
| **azure.md** | Link | Azure context (→ .copilot/context.md) | 2 min |
| **agent.md** | Link | Generic context (→ .copilot/context.md) | 2 min |

**All symlinks point to:** `.copilot/context.md` (295 lines, 1.8 KB)

---

### Strategy & Guide Documents (NEW)

| File | Size | Purpose | Read Time |
|------|------|---------|-----------|
| **AI_AGENT_README.md** | 9 KB | Summary of what was created | 10 min |
| **AGENT_CONTEXT_STRUCTURE.md** | 16 KB | Visual diagrams & examples | 20 min |
| **docs/08-AI_AGENT_DOCUMENTATION.md** | 16 KB | Deep technical strategy | 45 min |

---

### Reference Documents

| File | Size | Purpose | Read Time |
|------|------|---------|-----------|
| **.copilot/context.md** | 1.8 KB | Quick reference for all agents | 5 min |
| **COPILOT_CLI.md** | 9.8 KB | GitHub Copilot CLI guide | 15 min |

---

### Domain Documentation (Already Exists)

| File | Type | Size | When to Load |
|------|------|------|--------------|
| **01-BUSINESS_CONTEXT.md** | Main | 8 KB | Business questions |
| **02-DOMAIN_MODEL.md** | Main | 12 KB | Implementing any UC |
| **03-DOMAIN_EVENTS.md** | Main | 13 KB | Event-driven work |
| **04-USE_CASES.md** | Main | 18 KB | Specific UC implementation |
| **05-BOUNDED_CONTEXTS.md** | Main | 18 KB | Architecture questions |
| **06-USER_TENANT_MODEL.md** | Support | 4 KB | Auth questions |
| **07-MULTI_TENANCY_ARCHITECTURE.md** | Support | 15 KB | Tenancy questions |
| **docs/README.md** | Index | 8 KB | Navigation |

---

## 🎓 What to Read Based on Your Task

### Task: Quick Question About Architecture
```
Load: .copilot/context.md (1.8 KB)
Read: AGENT_CONTEXT_STRUCTURE.md (decision tree section)
→ 4 KB total, 10 minutes
```

### Task: Implement One Use Case
```
Load: .copilot/context.md (1.8 KB)
Load: Specific UC from 04-USE_CASES.md (1-2 KB)
Load: Relevant aggregate from 02-DOMAIN_MODEL.md (1-2 KB)
Load: Related events from 03-DOMAIN_EVENTS.md (0.5-1 KB)
→ 5-7 KB total, 20 minutes
```

### Task: Implement Full Feature
```
Load: .copilot/context.md (1.8 KB)
Load: Multiple UCs from 04-USE_CASES.md (3-5 KB)
Load: Domain model aggregates (3-4 KB)
Load: Events and bounded context (2-3 KB)
→ 11-15 KB total, 40 minutes
```

### Task: Design Architecture
```
Load: .copilot/context.md (1.8 KB)
Load: 05-BOUNDED_CONTEXTS.md (full, 18 KB)
Load: 01-BUSINESS_CONTEXT.md (full, 8 KB)
→ 28 KB total, 60 minutes
```

### Task: Authentication/Tenancy Question
```
Load: .copilot/context.md (1.8 KB)
Load: 06-USER_TENANT_MODEL.md (full, 4 KB)
Load: 07-MULTI_TENANCY_ARCHITECTURE.md (sections, 5 KB)
→ 11 KB total, 30 minutes
```

---

## 🔍 Finding Things

### I want to know about:

**General AI strategy**
- → Read: AI_AGENT_README.md
- → Then: docs/08-AI_AGENT_DOCUMENTATION.md

**Context structure & symlinks**
- → Read: AGENT_CONTEXT_STRUCTURE.md
- → Visual diagrams & examples

**Quick reference patterns**
- → Read: .copilot/context.md
- → Search: "Pattern" or "when to reference"

**Token optimization**
- → Read: AGENT_CONTEXT_STRUCTURE.md
- → Search: "Token" or "Before/After"

**Decision tree**
- → Read: AGENT_CONTEXT_STRUCTURE.md
- → Section: "Document Loading Decision Flow"

**How to work with GitHub Copilot CLI**
- → Read: COPILOT_CLI.md
- → Search: "Common Tasks"

**Business context**
- → Read: docs/01-BUSINESS_CONTEXT.md
- → Skip: If implementing code (load specific UC instead)

**Domain model**
- → Read: docs/02-DOMAIN_MODEL.md
- → Search: Entity name (e.g., "Booking", "LoyaltyRecord")

**Events**
- → Read: docs/03-DOMAIN_EVENTS.md
- → Search: Event name (e.g., "BookingCompleted")

**Use cases**
- → Read: docs/04-USE_CASES.md
- → Search: UC number or name

**Architecture/Contexts**
- → Read: docs/05-BOUNDED_CONTEXTS.md
- → Search: Context name

**Multi-tenancy**
- → Read: docs/07-MULTI_TENANCY_ARCHITECTURE.md
- → All code must include tenant_id!

---

## ⚡ Quick Start (5 Minutes)

1. **If using Claude:**
   ```bash
   cat claude.md  # Quick reference
   ```

2. **Understand the strategy:**
   ```
   Read: AI_AGENT_README.md (10 min)
   ```

3. **Start working:**
   ```
   Ask specific questions referencing docs
   E.g., "Implement UC-009 from docs/04-USE_CASES.md"
   ```

---

## 📊 Token Optimization at a Glance

| Task | Load | Tokens | Available |
|------|------|--------|-----------|
| Quick question | 1.8 KB | 1.8 KB | 198.2 KB |
| 1 Use Case | 5 KB | 5 KB | 195 KB |
| Full feature | 15 KB | 15 KB | 185 KB |
| Architecture | 28 KB | 28 KB | 172 KB |

**Key:** Load only what you need. Never load 100 KB docs.

---

## 🚀 For Different AI Platforms

### Claude (Anthropic)
```bash
# Start here
cat claude.md

# Then read
cat AI_AGENT_README.md

# You're ready!
```

### GPT (OpenAI)
```bash
# Start here
cat gpt.md

# Then read
cat AI_AGENT_README.md

# You're ready!
```

### Gemini (Google)
```bash
# Start here
cat gemini.md

# Then read
cat AI_AGENT_README.md

# You're ready!
```

### LLaMA (Meta)
```bash
# Start here
cat llama.md

# Then read
cat AI_AGENT_README.md

# You're ready!
```

### Azure (Microsoft)
```bash
# Start here
cat azure.md

# Then read
cat AI_AGENT_README.md

# You're ready!
```

### GitHub Copilot CLI
```bash
# Start here
cat .copilot/context.md

# Then read
cat COPILOT_CLI.md

# You're ready!
```

---

## 📋 Checklist: Before You Ask AI

- [ ] I read .copilot/context.md (quick reference)
- [ ] I know which docs are relevant to my task
- [ ] I can specify exactly which UC/section I need
- [ ] I'm asking about a specific aggregate or event
- [ ] I'm not asking for all docs to be loaded
- [ ] I'll reference previously loaded context in follow-ups
- [ ] I understand tenant_id must be in all code
- [ ] I've reviewed anti-patterns (what NOT to do)

---

## ✨ Key Takeaways

1. **Smart Loading** = ~90% token savings
2. **Symlinks** = Same context for all AI platforms
3. **Decision Tree** = Know what to load for each task
4. **References** = Search specific sections, not whole files
5. **Reuse** = Once loaded, reference (don't reload)
6. **Multi-Tenancy** = Every code example needs tenant_id

---

## 🔗 File Locations

```
Root:
  ├── claude.md (symlink)
  ├── gpt.md (symlink)
  ├── gemini.md (symlink)
  ├── anthropic.md (symlink)
  ├── llama.md (symlink)
  ├── azure.md (symlink)
  ├── agent.md (symlink)
  ├── AI_AGENT_README.md ← Start here (summary)
  ├── AGENT_CONTEXT_STRUCTURE.md ← Then here (visual)
  ├── AI_AGENT_INDEX.md ← You are here (navigation)
  └── COPILOT_CLI.md
  
.copilot/:
  └── context.md (core context, all symlinks point here)

docs/:
  ├── 08-AI_AGENT_DOCUMENTATION.md ← Deep dive
  ├── 01-BUSINESS_CONTEXT.md
  ├── 02-DOMAIN_MODEL.md
  ├── 03-DOMAIN_EVENTS.md
  ├── 04-USE_CASES.md
  ├── 05-BOUNDED_CONTEXTS.md
  ├── 06-USER_TENANT_MODEL.md
  ├── 07-MULTI_TENANCY_ARCHITECTURE.md
  └── README.md
```

---

## 📞 Questions?

| Question | Read |
|----------|------|
| What was created? | AI_AGENT_README.md |
| How does it work? | AGENT_CONTEXT_STRUCTURE.md |
| What's the strategy? | docs/08-AI_AGENT_DOCUMENTATION.md |
| How do I use it? | COPILOT_CLI.md |
| What patterns to follow? | .copilot/context.md |
| Quick reference? | claude.md (or gpt.md, etc.) |

---

## 🎯 Next Phase

**Phase 2 - Technical Architecture:**
- Create ARCHITECTURE.md (using smart loading)
- Create TECHNICAL_DECISIONS.md (ADRs)
- Create DATABASE_SCHEMA.md (tenant-scoped)
- Create API_CONTRACTS.md (endpoints)

All will follow same token-optimization strategy!

---

**Status:** ✅ AI Agent Documentation Strategy Complete  
**Created:** 2026-05-11  
**Last Updated:** 2026-05-11  
**For:** All AI agents (Claude, GPT, Gemini, LLaMA, Azure, GitHub Copilot CLI)

---

## 📖 Recommended Reading Path

**Level 1 (Quick Understanding - 30 min):**
1. This file (5 min)
2. AI_AGENT_README.md (15 min)
3. AGENT_CONTEXT_STRUCTURE.md (10 min)

**Level 2 (Practical Implementation - 60 min):**
1. Above + .copilot/context.md (5 min)
2. COPILOT_CLI.md (15 min)
3. Start using with AI agent

**Level 3 (Deep Mastery - 90 min):**
1. All Level 2 (60 min)
2. docs/08-AI_AGENT_DOCUMENTATION.md (45 min)
3. Review pattern library + decision tree

---

**Ready to start? Pick your platform (claude.md, gpt.md, etc.) and ask specific questions! 🚀**
