# Dev Notes — CUSTOMER: Reservar Aula (Turmas)

**Journey:** CUSTOMER — Reservar Aula (Turmas)
**UCs:** UC-085 (browse), UC-086/087 (book), UC-090 (waitlist), UC-093 (enroll)
**Prototype:** `customer/prototypes/reservar-aula/`
**Status:** ❓ Gap — M21 Cluster 4, no story assigned yet. Relocated from `docs/discovery/multivertical-booking/prototype/customer-reservaraula-*.html`.

## File map (❓ none exist yet)

| Prototype file | Production route | Page component |
|---|---|---|
| `01-lista-aulas.html` | `/{slug}/aulas` | `ClassCatalogPage` |
| `00-tipo-reserva.html` | `/{slug}/aulas/[classTypeId]/reservar` | `ReservaTypePicker` |
| `02-dropin.html` | `/{slug}/aulas/[classTypeId]/reservar/avulsa` | `DropInSessionPicker` |
| `03-dropin-confirmar.html` | `/{slug}/aulas/[classTypeId]/reservar/avulsa/confirmar` | `DropInConfirmPage` |
| `03b-serie-dias.html` | `/{slug}/aulas/[classTypeId]/reservar/serie` | `SeriesBuilderPage` |
| `04-serie-confirmar.html` | `/{slug}/aulas/[classTypeId]/reservar/serie/confirmar` | `SeriesConfirmPage` |
| `05-success-ativo.html` / `05b-success-waitlist.html` | `/{slug}/aulas/[classTypeId]/reservar/sucesso` | `EnrollmentSuccessPage` |

## BFF calls (endpoints not yet implemented — contract per `docs/14-API_CONTRACTS.md` § Classes & Sessions)

```
GET /v1/class-types
  Response: { items: [{ classTypeId, name, color, description, allowsDropIn, allowsSeries, nextSessionAt }] }
  -- Composed by the BFF from Service + ClassScheduleTemplate + next-session projection. Never a persistence endpoint.

GET /v1/class-types/:classTypeId/sessions?from=&limit=
  Response: { items: [{ sessionId, startTime, endTime, capacity, reservedCount, remainingSpots }] }

GET /v1/class-types/:classTypeId/recurring-slots
  Response: { items: [{ templateId, recurrence, startDate, remainingSpots }] }

POST /v1/class-session-bookings
  Body: { sessionId, quantity: 1 }   -- contract (UC-086) or pay-per-class (UC-087), resolved server-side by contract lookup
  Response 201: { classSessionBookingId, status: 'CONFIRMED'|'PENDING_APPROVAL'|'WAITLISTED' }

POST /v1/recurring-enrollments
  Body: { templateId, startDate }
  Response 201: { enrollmentId, status: 'ACTIVE', firstOccurrenceStatus: 'CONFIRMED'|'WAITLISTED' }
```

## Screen notes

- **`00-tipo-reserva.html`** — only shown when `classType.allowsDropIn && classType.allowsSeries` are both true; otherwise the catalog links directly to `02-dropin.html` or `03b-serie-dias.html`.
- **`02-dropin.html` / `02b-dropin-lotada.html`** — capacity badge (`remainingSpots`) drives whether "Reservar" or "Entrar na fila" renders; the lotada variant routes into UC-090's waitlist creation, not a dead end.
- **`03-dropin-confirmar.html` / `04-serie-confirmar.html`** — must branch the confirmation copy on the resulting `status` (`CONFIRMED` vs `PENDING_APPROVAL`, the latter per UC-087's `trialSlots` threshold) — never assume instant confirmation.
- **`05-success-ativo.html` / `05b-success-waitlist.html`** — the waitlist variant must show queue position (computed client-side from a value the BFF returns at read time, never a stored field — see `docs/02-DOMAIN_MODEL.md` § `ClassSessionBooking`) and link into `minha-conta.md`'s Turmas section for ongoing management.

## Known limitations

- No `index.html`/`dev-notes.md` existed in the discovery folder for this flow — both added fresh as part of this promotion (the discovery folder's own dev-notes only covered the discovery-illustrative screens, not this already-implementation-grade set).
- `01-lista-aulas.html`'s "Ver agenda" style cross-links to other Turmas screens were already correct relative paths at discovery time and required no fixing during relocation.

## Open questions / gaps

- [ ] No story exists yet — needs `/story-discovery` once the M21 milestone file is drafted.
- [ ] Whether `ReservaTypePicker` is a real intermediate page or a client-side branch within `ClassCatalogPage` is a routing decision for the implementing story.
