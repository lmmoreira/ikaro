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

---

## Migration history — pre-production exception

Squashing or editing an already-written migration (rewriting history instead of expand/contract) is allowed only if no real environment has ever run it. Verify this by checking `plan/M17-CLOUD-DEPLOY.md`'s go-live status before touching migration history — never assume "pre-production" without checking.

**TD24-S04 precedent:** deleted a migration and trimmed another after confirming M17 go-live was still pending.

**"No real environment has ever run it" is not the only way to satisfy this rule** — editing an already-applied migration is also safe if you additionally reset the one environment that ran the old version (drop the affected schemas/tables + clear its `migrations` tracking rows, then replay every migration fresh) so that no environment anywhere retains the pre-edit behavior. The rule exists to prevent one environment permanently diverging from what the migration file now describes, not to forbid touching history in the abstract — a full reset removes the divergence the rule is protecting against.

**M17-S27 precedent (2026-07-24):** edited two already-applied staging migrations directly rather than adding a corrective one, specifically because the remediation plan was a full staging schema reset + replay, not a live patch.

---

## Stale-reference sweep — when a story replaces or removes an existing flow

If this story replaces or removes an existing flow/mechanism (an auth pattern, a data model assumption, a transport layer, a dead endpoint, a Terraform module), grep `docs/*.md`, `plan/*_IMPLEMENTATION_DETAILS_*.md`, `.claude/commands/**`, `.claude/skills/**`, `scripts/**`, `infra/terraform/**`, `.github/workflows/**`, and CLAUDE.md itself for anything still describing the *old* version — update or flag it in the same PR.

A replaced flow with stale docs left behind means the next agent builds on a wrong assumption with no signal it's wrong. **M13 precedent:** the milestone alone left 18 such findings across 8 files, found only when the milestone closed out — don't defer this to milestone-end if the story itself is the one making the change.

**Agent-executable check files are not exempt just because they aren't prose docs.** The TD-21 domain-slice migration left a stale `apps/web/lib/api/`/`apps/web/components/` path hardcoded in `bad-smell-audit.md`'s `WEB-2`/`WEB-4`/`WEB-7` checks and in `scripts/pre-pr.sh`'s `WEB-4`/`23`/`27` checks (found and fixed 2026-07-23) — these shipped because the stale-reference sweep only looked at docs/plan files, not command/script files that encode the same knowledge. `TD09` had already flagged and fixed `pre-pr.sh`'s `WEB-7` path once, but its own note went stale in turn — a fixed instance of this bug is not proof the whole file is safe; re-grep the actual script, don't trust an old TD's summary of it.

**A sweep that greps only the removed thing's literal current name/path is not complete — it must also grep every alias the codebase uses to refer to it.** When `infra/terraform/modules/iam/` was deleted (M19-S02, 2026-08-11, after its code was found to be dead — see "TD34 foundation / IAM transfer" in CLAUDE.md §10), the author's own sweep grepped for the literal string `modules/iam` and believed it was clean. Two live references survived because they cited the module only by its original story number, `M17-S17`, never the path: a code comment in `packages/infra-scripts/src/env-contract.ts` and two bucket-output descriptions in `infra/terraform/modules/storage/outputs.tf`. Both were caught only by two separate cross-tool PR reviews (Codex, then Copilot independently) — not by the sweep. A rename/deletion sweep must enumerate every alias a target is known by (a story/PR number, an old short name, a prior class name) and re-run the grep once per alias; "I already swept for the obvious string" is not proof the sweep is complete.

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
