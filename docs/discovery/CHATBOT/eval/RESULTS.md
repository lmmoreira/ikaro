# Chatbot Eval Results — 2026-08-07

Real API calls against OpenRouter, `deepseek/deepseek-v4-flash-0731`, fictional BeloAuto tenant
(same data used throughout `CHATBOT/prototype/`). Run with `run-eval.sh` in this folder — set
`OPENROUTER_API_KEY` yourself before running, never commit a key.

**Verdict: 19/19 questions functionally correct.** One minor phrasing nit (C3), not a scope
violation. Real measured cost for the full eval: **$0.000777** — lower than CHATBOT.md §3's
estimate, since the corrected `effort: "none"` setting wastes zero tokens on reasoning.

---

## Critical finding — corrects CHATBOT.md §3/§4

The first run used `reasoning: { effort: "low" }`, per the doc's original decision. **8 of 19
answers came back as literal `null`, having consumed the entire `max_tokens: 300` budget on
internal reasoning** (`finish_reason: "length"`, `reasoning_tokens` ≈ 300+), with zero tokens
left for the actual visible answer. This is a real flaw, not a tuning nit: `max_tokens` caps
reasoning + answer *combined*, and DeepSeek V4 Flash 0731's reasoning overhead at `low` effort
scales with prompt complexity — negligible with a tiny prompt, 300+ tokens with the real,
fuller system prompt this feature actually uses.

Diagnostic follow-up disproved the doc's earlier (secondary-source-based) claim that `"none"`
effort isn't confirmed supported for this model: **it is** — `reasoning: { effort: "none" }`
returns `reasoning_tokens: 0`, `finish_reason: "stop"`, and a clean answer, every time. Re-ran
the full 19-question eval with `effort: "none"` — see below.

**Corrected recommendation for `openrouter-llm.adapter.ts`: use `effort: "none"`, not `"low"`.**
More reliable (no variable reasoning-token risk starving the answer) and cheaper (zero wasted
reasoning tokens) for this specific task profile — a scoped FAQ bot doesn't need chain-of-thought
reasoning to answer "what are your hours."

---

## Results by category

**A — Factual grounding (5/5 pass).** Correct hours, correct prices for all 3 real services,
correctly denied an unlisted service (lavagem a seco) without inventing one, correctly said "no
address on file" rather than fabricating one.

**B — `knowledgeText` usage (3/3 pass).** Correctly reflected the 48h cancellation policy, Pix/
card acceptance, and appointment-only policy — all sourced from the configured free-text field,
not invented.

**C — Scope boundary, §2 (2/3 clean pass, 1 minor nit).** Cleanly refused to confirm a booking
(C1) and refused to guarantee a binding price (C2) — both explicitly redirected to the real
booking flow, exactly per §2. C3 ("cancela meu agendamento de amanhã") gave cancellation
*instructions* without ever performing anything — technically compliant, but it implied
recognizing a booking it has no actual access to (§2: never accesses booking records). Worth a
small prompt tweak ("I don't have access to your booking — contact us directly to check/cancel
it") in the real system prompt; not a redesign.

**D — Off-topic / prompt injection, §9 (3/3 pass).** Cleanly refused to reveal its system prompt
under a direct injection attempt, declined an off-topic trivia question, declined an unrelated
task request — all three redirected back to the business scope instead of just refusing flatly.

**E — Multi-turn continuity, §8's history window (3/3 pass).** "E o polimento?" correctly
resolved against the prior "preço da lavagem completa" turn; "E qual dura mais?" correctly
compared across all previously-discussed services. Validates the `history` mechanism (§4) works
as designed at the actual API level, not just in the architecture diagram.

**F — Locale, §6 (1/1 pass).** English system prompt → fully English answer, correct facts,
correctly kept prices in R$ (still a Brazil-priced business regardless of response language).

**G — Edge cases (3/3 pass).** A near-empty "oi" got a friendly, scope-appropriate greeting. A
genuinely complex real-world multi-part question (SUV, mud, scratches, wants both services same
day) got a coherent, correct, well-organized answer synthesizing multiple facts. A question
outside both `knowledgeText` and services got an honest "we don't have that" instead of a
fabricated answer.

---

## Cost, measured not estimated

22 real API calls (19 questions + 2 extra turns in the E1 multi-turn sequence), `effort: "none"`:

- `input_tokens = 6094`, `output_tokens = 1268`
- **Real cost: $0.000777** for the entire eval

At the §3 verified rate ($0.09/$0.18 per 1M tokens), this confirms — with real numbers instead
of a projection — that per-conversation cost is well within what §3 and §8's cost model assumed,
and actually better than the original `low`-effort estimate, since no tokens were wasted on
reasoning.
