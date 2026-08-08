# GUEST — Ask Chatbot

**Actor(s):** GUEST
**Goal:** Ask the tenant's AI-backed chatbot a free-form question about the business (hours, prices, services) directly from the public hotsite, without leaving the page or authenticating
**UCs covered:** UC-033, UC-034
**Status:** Draft

## Flow

```mermaid
flowchart TD
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    Start(["Hotsite /{slug}"]) --> Mount(("Widget CHATBOT monta na página"))
    Mount --> StatusCheck{"❓ GAP: GET /public/platform/chatbot/status<br/>available?"}
    StatusCheck -- "não" --> NotAvailable["❓ GAP: nada renderizado<br/>(01c-not-available) |UC-034|"]
    StatusCheck -- "sim" --> Widget["❓ GAP: bolha/inline renderizado<br/>(00-hotsite bubble) |UC-034|"]

    Widget --> ClickBubble(("Clica na bolha / widget inline"))
    ClickBubble --> ActiveChat["❓ GAP: conversa ativa<br/>(01-active-chat) |UC-033|"]

    ActiveChat --> SendMsg(("Envia mensagem"))
    SendMsg --> CapCheck{"❓ GAP: limite de volume<br/>excedido (429)?"}
    CapCheck -- "sim (A1/A2)" --> Interrupted["❓ GAP: conversa interrompida<br/>(01b-interrupted) |UC-033 A1/A2|"]
    CapCheck -- "não" --> ActiveChat

    ActiveChat --> ProviderFail{"❓ GAP: provedor LLM<br/>falha mid-conversa?"}
    ProviderFail -- "sim (A4)" --> Interrupted
    ProviderFail -- "não" --> ActiveChat

    Interrupted --> WhatsAppCta(("Fallback: telefone/WhatsApp do tenant"))

    class StatusCheck,NotAvailable,Widget,ActiveChat,CapCheck,Interrupted,ProviderFail gap
```

**Reading the flow:** every node is tagged `❓ GAP` because nothing in this journey is built yet
(`docs/discovery/CHATBOT/CHATBOT.md`, promoted 2026-08-08). The dashed-red styling is deliberate,
not a mistake — this whole journey is an IA-gap map, not a mix of existing/new like most journey
files in this folder.

Two platform-wide backstops (global daily spend circuit breaker, provider balance floor —
`docs/discovery/CHATBOT/CHATBOT.md` §8.9/§8.10) can also flip the pre-flight check to
`available: false` for every tenant simultaneously; not drawn as a separate node since, from this
one GUEST's perspective, it's indistinguishable from any other "not available" cause.

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| Hotsite chat bubble (bottom-right, all hotsite pages) | `ChatbotWidget` (collapsed) | TBD | ❌ Gap |
| Widget mount — availability pre-flight | `ChatbotWidget` → `GET /public/platform/chatbot/status` | TBD | ❌ Gap |
| Active chat panel/inline card | `ChatbotWidget` (active) | TBD | ❌ Gap |
| Send message | `ChatbotWidget` → `POST /public/platform/chatbot/messages` | TBD | ❌ Gap |
| Interrupted state (cap/failure) | `ChatbotWidget` (interrupted) | TBD | ❌ Gap |

## Open questions / gaps

- [ ] No milestone/story number is assigned to this journey yet — promoted via
      `/discovery-to-milestone` on 2026-08-08; sequencing happens separately. Do not start
      implementation without running `/story-discovery` first (CLAUDE.md §0).
- [ ] `ChatbotWidget.tsx`'s internal component split (bubble trigger / panel / inline card as one
      file vs. several) is not decided — see `guest/prototypes/ask-chatbot/dev-notes.md`.
- [ ] Whether the collapsed-bubble state (`01-bubble-collapsed.html` in the original discovery
      prototype) needs its own numbered screen in this folder was resolved: no — `00-hotsite.html`
      (via `shared/hotsite.html`) already shows it, since the bubble lives on every hotsite page, not
      as a distinct step in this journey.
- [ ] Full ten-layer cost/abuse-prevention design (caps, circuit breakers, prompt injection
      defenses) is documented in `docs/discovery/CHATBOT/CHATBOT.md` §8/§9, not repeated here — this
      journey file covers navigation/UX states only, per `README.md`'s "what goes in the flowchart"
      convention.

## Prototype

Folder: `guest/prototypes/ask-chatbot/`

| File | Screen | UC | Status |
|---|---|---|---|
| `index.html` | Navigation hub + dry-run checklist | — | ✅ Criado |
| `00-hotsite.html` | Hotsite entry point (redirect → `shared/hotsite.html`, now with chat bubble) | UC-034 | ✅ Criado |
| `01-active-chat.html` | Conversa ativa (variant `bubble`) | UC-033 | ✅ Criado |
| `01b-interrupted.html` | Limite atingido / provedor falhou | UC-033 A1/A2/A4 | ✅ Criado |
| `01c-not-available.html` | Indisponível (nada renderizado) | UC-034 | ✅ Criado |
| `01d-inline-variant.html` | Variante `inline` (configuração alternativa, não é unhappy path) | UC-033 | ✅ Criado |
| `dev-notes.md` | Implementation handoff (file map, props, BFF calls, validação, máquina de estados) | — | ✅ Criado |
