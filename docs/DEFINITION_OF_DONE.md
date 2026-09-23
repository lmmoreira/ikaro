# Definition of Done

Checked at the end of every story or TD, before `/pre-pr` runs (CLAUDE.md §9 Steps 3–9). Referenced by `/mark-done` and CLAUDE.md §13's self-check.

- [ ] Matches cited UC's main + alt flows; CI passes (`pnpm lint`, `pnpm test`, `pnpm type-check`)
- [ ] Coverage delta ≥ 80%; unit + integration + tenant-isolation tests pass
- [ ] All queries filter `tenant_id`; all events include `tenantId`/`eventId`/`correlationId`
- [ ] Migration is backward-compatible (expand/contract) — see "Migration history" below for the pre-production exception
- [ ] New/modified migration → `docs/13-DATABASE_SCHEMA.md`'s matching table updated in the same commit (columns, defaults, constraints, indexes) — same discipline as the `integration-global-setup.ts` registration requirement, same silent-drift risk if skipped
- [ ] Conventional Commit + PR description links the UC
- [ ] If this story replaces or removes an existing flow/mechanism, the stale-reference sweep below is done
- [ ] If this story ships something a `plan/journey/<actor>/<slug>.md` currently marks `❓ GAP` (a screen, a mermaid node, a Prototype-table row), that doc's status is flipped in the same commit — not just `dev-notes.md`. See "Journey GAP-status drift" below.
- [ ] If this story's UI splits one conceptual flow across sibling files (e.g. a Create form and an Edit form for the same aggregate), the sibling files are diffed for structural asymmetry — actions, hints, and navigation present on one but silently missing from the other. See "Sibling-file structural parity" below.
- [ ] If this story adds a new rule or pattern that touches `.copilot/context.md`: the full explanation was written into its one canonical doc first (`docs/ANTI_PATTERNS.md`/`docs/ENGINEERING_RULES_*.md`/`docs/CODE_STANDARDS.md`/`docs/CI_TRAPS.md`), and it only gets a `context.md` line if it passes the keep-in-file test (context.md §7's "How to edit this file" header).

---

## Migration history — pre-production exception

Squashing or editing an already-written migration (rewriting history instead of expand/contract) is allowed only if no real environment has ever run it. Verify this by checking `plan/M17-CLOUD-DEPLOY.md`'s go-live status before touching migration history — never assume "pre-production" without checking.

**TD24-S04 precedent:** deleted a migration and trimmed another after confirming M17 go-live was still pending.

**"No real environment has ever run it" is not the only way to satisfy this rule** — editing an already-applied migration is also safe if you additionally reset the one environment that ran the old version (drop the affected schemas/tables + clear its `migrations` tracking rows, then replay every migration fresh) so that no environment anywhere retains the pre-edit behavior. The rule exists to prevent one environment permanently diverging from what the migration file now describes, not to forbid touching history in the abstract — a full reset removes the divergence the rule is protecting against.

**M17-S27 precedent (2026-07-24):** edited two already-applied staging migrations directly rather than adding a corrective one, specifically because the remediation plan was a full staging schema reset + replay, not a live patch.

---

## Stale-reference sweep — when a story replaces or removes an existing flow

If this story replaces or removes an existing flow/mechanism (an auth pattern, a data model assumption, a transport layer, a dead endpoint, a Terraform module), grep `docs/*.md`, `plan/*_IMPLEMENTATION_DETAILS_*.md`, the milestone/TD plan file itself (story ACs, "Files to create", type/method names), `plan/journey/**` (journeys + `dev-notes.md`), `docs/discovery/**`, `.claude/commands/**`, `.claude/skills/**`, `scripts/**`, `infra/terraform/**`, `.github/workflows/**`, and CLAUDE.md itself for anything still describing the *old* version — update or flag it in the same PR. **Grep the changed symbol names and the old concept's phrases in one pass** (`git grep -nE "<OldSymbol>|<old phrase>" -- docs plan`) — do not stop at the first doc that turns up: M22-S04 needed three separate review rounds to find the same drift in three places (canonical docs, the plan file's own ACs and type names, then `docs/discovery/**`). **`docs/discovery/**` is not exempt**: keep the original exploratory text as history and append `**[Superseded by <story>, <date> — <what shipped instead>. See <canonical doc>.]**` at each mention. Note `CLAUDE.md`/`AGENTS.md` are symlinks — search `.copilot/context.md` (`git grep` does not follow the symlink).

A replaced flow with stale docs left behind means the next agent builds on a wrong assumption with no signal it's wrong. **M13 precedent:** the milestone alone left 18 such findings across 8 files, found only when the milestone closed out — don't defer this to milestone-end if the story itself is the one making the change.

**Agent-executable check files are not exempt just because they aren't prose docs.** The TD-21 domain-slice migration left a stale `apps/web/lib/api/`/`apps/web/components/` path hardcoded in `bad-smell-audit.md`'s `WEB-2`/`WEB-4`/`WEB-7` checks and in `scripts/pre-pr.sh`'s `WEB-4`/`23`/`27` checks (found and fixed 2026-07-23) — these shipped because the stale-reference sweep only looked at docs/plan files, not command/script files that encode the same knowledge. `TD09` had already flagged and fixed `pre-pr.sh`'s `WEB-7` path once, but its own note went stale in turn — a fixed instance of this bug is not proof the whole file is safe; re-grep the actual script, don't trust an old TD's summary of it.

**A sweep that greps only the removed thing's literal current name/path is not complete — it must also grep every alias the codebase uses to refer to it.** When `infra/terraform/modules/iam/` was deleted (M19-S02, 2026-08-11, after its code was found to be dead — see "TD34 foundation / IAM transfer" in CLAUDE.md §10), the author's own sweep grepped for the literal string `modules/iam` and believed it was clean. Two live references survived because they cited the module only by its original story number, `M17-S17`, never the path: a code comment in `packages/infra-scripts/src/env-contract.ts` and two bucket-output descriptions in `infra/terraform/modules/storage/outputs.tf`. Both were caught only by two separate cross-tool PR reviews (Codex, then Copilot independently) — not by the sweep. A rename/deletion sweep must enumerate every alias a target is known by (a story/PR number, an old short name, a prior class name) and re-run the grep once per alias; "I already swept for the obvious string" is not proof the sweep is complete.

**A milestone-wide "planned, not yet built" banner's own exception list is a stale-reference risk in itself, not just the prose it's warning about.** `docs/14-API_CONTRACTS.md`'s M21 banner ("none of it exists in code yet... Exception: Resource Management §4, shipped in M21-S01/S04") already needed a second exception added by the time M21-S03 shipped its own live `resourceId` param on the schedule closures/openings endpoints — those endpoints sat correctly documented elsewhere in the same file, but still fell under the banner's blanket "not yet built" claim because the exception list wasn't updated when that story closed (M22-S02 precedent, PR #481, 2026-09-15, caught by Codex, not by this story's own sweep — the story only ever *read* that banner, it never touched an M21 flow itself, so the trigger condition above never fired for it). Any story that ships an endpoint under a milestone that already has one of these banners must check whether its own work needs adding to the banner's exception list, even when the story belongs to a *different*, later milestone.

---

## Journey GAP-status drift — when a story ships something a journey doc marks incomplete

This is the inverse trigger of the stale-reference sweep above: not a flow being *replaced*, but a screen/flow being *added* or *completed* that a `plan/journey/<actor>/<slug>.md` still marks `❓ GAP` (in its mermaid flow, its Prototype table, or its "Pages referenced" table).

If this story builds a screen or flow that journey doc already describes as a gap, flip its status (`❓ GAP` → `✅`) in the same commit, and update the Prototype table row if the actual filename differs from what was drafted.

**Why this is a separate item from the stale-reference sweep above, not a duplicate:** a `/docs-audit` full sweep (2026-08-04) found this exact pattern in *every single actor's* journeys (guest, customer, staff, manager — 28 findings total) — a consistent, mechanical pattern, not scattered neglect. In every case, `dev-notes.md` had already been correctly updated to say the feature shipped; the journey `.md`'s own mermaid/Prototype-table status just never followed. The habit of updating `dev-notes.md` is evidently already enforced somewhere in practice — this item exists to make the journey `.md` itself get the same treatment, not to introduce a new habit from scratch.

---

## Sibling-file structural parity — when one flow is split across Create/Edit (or similar) sibling components

When a create/edit form (or any other flow implemented as near-identical sibling files, e.g. a `ResourceCreateForm.tsx`/`ResourceEditFormFields.tsx` pair) is built, each file is often drafted independently or copy-pasted from the other early on — meaning a UI element added to *one* file after that split (a Cancel/back link, a hint paragraph, a topbar back-link override) can silently never make it to its sibling. Unit tests don't catch this on their own: each file's own spec only exercises what *that* file actually renders, and nothing asserts the two stay in sync.

Before considering the story done, diff the sibling files' JSX structure side by side and confirm every user-facing affordance (cancel/back navigation, hint/help text, error-state handling, loading states) that exists on one exists on the other too, unless the difference is deliberate and documented as such.

**M21-S04 precedent, 2026-09-02:** `ResourceEditFormFields.tsx` had a Cancelar link (desktop action pane + mobile bottom bar) and a topbar back-link override; `ResourceCreateForm.tsx` had neither. The same asymmetry existed for the turnover/max-capacity hint paragraphs (present on create, missing on edit — note the direction was reversed from the Cancelar gap, underscoring that this can drift either way once the two files diverge). Both gaps went undetected through 9 rounds of automated bot review and passed every existing unit test; found only via live manual testing.
