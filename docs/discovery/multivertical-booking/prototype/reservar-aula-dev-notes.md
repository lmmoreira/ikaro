# Dev Notes — Customer: Reservar Aula (Turmas)

Protótipos: `plan/journey/customer/prototypes/reservar-aula/`
Status: **discovery completo — GAP, não implementado**

> Complementa o fluxo existente de agendamento individual (`book-a-service/`).
> Cobre somente serviços com `bookingModel = SESSION` (turmas com capacidade).
> Pagamento fora de escopo — cobranças permanecem externas ao app nesta versão.

---

## Rotas (todas GAP — não existem hoje)

| Arquivo | Rota Next.js | Componente |
|---|---|---|
| `customer-reservaraula-01-lista-aulas.html` | `/{slug}/aulas` | `ClassCatalogPage` |
| `customer-reservaraula-00-tipo-reserva.html` | `/{slug}/aulas/[classTypeId]/reservar` | `ReservaTypePicker` |
| `customer-reservaraula-02-dropin.html` | `/{slug}/aulas/[classTypeId]/reservar/avulsa` | `DropInSessionPicker` |
| `customer-reservaraula-02b-dropin-lotada.html` | mesma rota — sessão lotada selecionada | `DropInSessionPicker` (estado waitlist) |
| `customer-reservaraula-03-dropin-confirmar.html` | `/{slug}/aulas/[classTypeId]/reservar/avulsa/confirmar` | `DropInConfirmPage` |
| `customer-reservaraula-03b-serie-dias.html` | `/{slug}/aulas/[classTypeId]/reservar/serie` | `SeriesBuilderPage` |
| `customer-reservaraula-04-serie-confirmar.html` | `/{slug}/aulas/[classTypeId]/reservar/serie/confirmar` | `SeriesConfirmPage` |
| `customer-reservaraula-05-success-ativo.html` | `/{slug}/aulas/[classTypeId]/reservar/sucesso` | `EnrollmentSuccessPage` |
| `customer-reservaraula-05b-success-waitlist.html` | mesma rota — status WAITLIST | `EnrollmentSuccessPage` (estado fila) |

## Auth guard

Todas as rotas exigem cookie `access_token` com `role: CUSTOMER`.
Visitante sem login → redirect para `/{slug}/login?next=/{slug}/aulas`.

---

## Navegação — lógica de entrada

O ponto de entrada é sempre o catálogo (`/aulas`), seja via:
- "Novo → Reservar aula" no `customer-dashboard`
- Link de aula específica no hotsite (futuro — ainda não implementado no hotsite público)

Uma vez no catálogo, o cliente clica numa aula e o roteamento bifurca com base nos flags do `ClassType`:

```ts
if (classType.allowsDropIn && classType.allowsSeries) {
  // → /{slug}/aulas/[id]/reservar  (tela de escolha de tipo)
} else if (classType.allowsDropIn) {
  // → /{slug}/aulas/[id]/reservar/avulsa  (vai direto)
} else if (classType.allowsSeries) {
  // → /{slug}/aulas/[id]/reservar/serie  (vai direto)
}
```

---

## BFF Calls (todas GAP)

### 1. Catálogo de aulas

```
GET /v1/class-types
Authorization: Bearer <JWT>
```

Retorna os `ClassType` ativos do tenant do JWT. O tenant é inferido pelo slug da rota (ou pelo JWT — decidir na implementação qual é a fonte de verdade).

**Response:**
```ts
interface ClassType {
  id: string;
  name: string;                  // "Pilates em Grupo"
  description: string;           // subtítulo no cartão
  durationMinutes: number;       // 50
  instructorName: string;        // nome do instrutor padrão ou "Vários instrutores"
  color: string;                 // hex — "#2563eb"
  allowsDropIn: boolean;
  allowsSeries: boolean;
  totalSpots: number;            // capacidade da turma
  availableSpots: number;        // vagas livres na próxima sessão
  schedule: string;              // "Seg, Qua e Sex · 07:00 e 09:00" — string formatada
}
```

`availableSpots` é calculado em relação à próxima sessão disponível. Se `0`, o card mostra badge "Lotada — lista de espera".

---

### 2. Sessões disponíveis (drop-in)

```
GET /v1/class-types/:classTypeId/sessions?from=<ISO>&limit=20
Authorization: Bearer <JWT>
```

Lista as sessões futuras do tipo de aula, ordenadas por `startsAt`. Usada na tela `customer-reservaraula-02-dropin.html`.

**Response:**
```ts
interface ClassSession {
  id: string;
  classTypeId: string;
  startsAt: string;       // ISO-8601
  endsAt: string;
  instructorName: string;
  location: string;       // "Sala 1 · Vitta Studio"
  totalSpots: number;
  availableSpots: number; // 0 → sessão lotada → caminho waitlist
}
```

**Agrupamento no cliente:** sessões agrupadas por semana (cabeçalho "Esta semana" / "Próxima semana").
**Vagas:** badge verde se `availableSpots >= 3`, âmbar se `1–2`, vermelho "Lotada" se `0`.

---

### 3. Slots recorrentes (série)

```
GET /v1/class-types/:classTypeId/recurring-slots
Authorization: Bearer <JWT>
```

Lista os padrões recorrentes do tipo de aula (um por `ClassScheduleTemplate` ativo). Usada na tela `customer-reservaraula-03b-serie-dias.html` para o cliente montar sua sequência.

**Response:**
```ts
interface RecurringSlot {
  id: string;
  classTypeId: string;
  dayOfWeek: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
  startTime: string;      // "09:00"
  endTime: string;        // "09:50"
  instructorName: string;
  location: string;
  totalSpots: number;
  availableSpots: number; // vagas disponíveis no próximo ciclo
}
```

O cliente seleciona um ou mais slots e escolhe uma `startsAt`. O front calcula o preview das próximas sessões multiplicando os slots selecionados pelas semanas até `validUntil` (ou pelo número de sessões do pacote).

**Cálculo do preview (client-side):**
```ts
// Para cada slot selecionado, gerar as datas de ocorrência a partir de startsAt
// até o número de sessões do pacote (ex.: 8 sessões ÷ 2 dias/semana = 4 semanas)
const sessionCount = selectedSlots.length * packageWeeks;
```

---

### 4. Criar matrícula

```
POST /v1/enrollments
Authorization: Bearer <JWT>
Content-Type: application/json
```

**Body — drop-in:**
```json
{
  "classTypeId": "ct_pilates_grupo",
  "type": "DROP_IN",
  "sessionId": "cs_seg_25ago_0900"
}
```

**Body — série:**
```json
{
  "classTypeId": "ct_pilates_grupo",
  "type": "SERIES",
  "slotIds": ["rs_seg_0900", "rs_qua_0900"],
  "startsAt": "2026-08-25",
  "sessionCount": 8
}
```

**Response 201:**
```ts
interface EnrollmentCreated {
  id: string;
  classTypeId: string;
  type: 'DROP_IN' | 'SERIES';
  status: 'ACTIVE' | 'WAITLIST';  // WAITLIST se sessão/vaga lotada
  enrolledAt: string;
  // DROP_IN
  session?: { startsAt: string; endsAt: string; location: string; instructorName: string; };
  // SERIES
  slots?: RecurringSlot[];
  nextSessionAt?: string;
  // WAITLIST
  waitlistPosition?: number;  // derivado, não armazenado
}
```

**Roteamento pós-POST:**
```ts
if (enrollment.status === 'ACTIVE') {
  redirect('/aulas/[classTypeId]/reservar/sucesso?enrollmentId=...');
} else if (enrollment.status === 'WAITLIST') {
  redirect('/aulas/[classTypeId]/reservar/sucesso?enrollmentId=...&waitlist=true');
}
```

**Erro 409 — sessão lotada entre seleção e confirmação:**
Raro mas possível (race condition). Mostrar mensagem "Esta sessão acabou de lotar. Deseja entrar na lista de espera?" com opção de re-submeter com `forceWaitlist: true`.

---

## Estado do Enrollment

```
ACTIVE    — vaga confirmada, sessões geradas
WAITLIST  — na fila, aguardando promoção
CANCELLED — cancelado pelo cliente ou pelo admin
```

A transição `WAITLIST → ACTIVE` é feita pelo backend automaticamente quando uma vaga abre (alguém cancela ou pula uma sessão). O backend:
1. Encontra o primeiro `WAITLIST` da fila para aquele `classTypeId` / sessão
2. Muda `status` para `ACTIVE`
3. Seta `enrollment.promotedAt = now()`
4. Dispara e-mail com link direto para `/{slug}/my-account/turmas/[enrollmentId]`

O banner de promoção na tela `07d-waitlist-promovida.html` é mostrado enquanto `promotedAt < 24h atrás` — checado no client após GET do enrollment.

---

## Dados que alimentam este fluxo (configurados no manager)

Os campos abaixo são configurados em `manager-02-service-resource-config.html` (painel "Turma com capacidade") e retornados por `GET /v1/class-types`:

| Campo | Onde configurar | Impacto no fluxo do cliente |
|---|---|---|
| `color` | Seção "Catálogo de aulas" em manager-02 | Barra colorida no cartão do catálogo |
| `description` | Seção "Catálogo de aulas" em manager-02 | Subtítulo no cartão |
| `allowsDropIn` | Checkbox em manager-02 | Determina se o caminho drop-in está disponível |
| `allowsSeries` | Checkbox em manager-02 | Determina se o caminho série está disponível |
| `totalSpots` | Capacidade em manager-06 (ClassScheduleTemplate) | Capacidade exibida e usada no cálculo de vagas |

---

## Shell

Usa o mesmo `dashboard-topbar` + `step-container` já presente no fluxo `book-a-service/`.
- Mobile: sem bottom-nav nas telas de fluxo (foco na tarefa)
- Topbar: back arrow + nome da aula no slot de título — **implementado 2026-08-21 (UX review)**: as telas originais tinham esse comportamento apenas descrito aqui, não construído (nenhuma tinha back arrow). Corrigido em todas: `customer-reservaraula-01-lista-aulas.html` volta para o dashboard; `customer-reservaraula-00-tipo-reserva.html` → `customer-reservaraula-04-serie-confirmar.html` cada uma volta para a etapa anterior real do fluxo, com o nome da aula ("Pilates em Grupo") no slot de título. As telas de sucesso (`04`/`04b`) são terminais — sem back arrow, por design.
- Breadcrumb de progresso: não necessário neste fluxo (menos etapas que book-a-service)

---

## File map

| Arquivo | Status | Descrição |
|---|---|---|
| `index.html` | ✅ completo | Hub de navegação com todos os screens e tags GAP |
| `customer-reservaraula-01-lista-aulas.html` | ✅ completo | Catálogo de aulas do tenant |
| `customer-reservaraula-01b-lista-aulas-vazia.html` | ✅ completo | Estado vazio — filtro "Com vagas" sem resultado (adicionada 2026-08-21) |
| `customer-reservaraula-00-tipo-reserva.html` | ✅ completo | Bifurcação avulsa/série |
| `customer-reservaraula-02-dropin.html` | ✅ completo | Seleção de sessão drop-in com badges de vagas |
| `customer-reservaraula-02b-dropin-lotada.html` | ✅ completo | Sessão lotada → entrada na fila |
| `customer-reservaraula-03-dropin-confirmar.html` | ✅ completo | Confirmação drop-in |
| `customer-reservaraula-03b-serie-dias.html` | ✅ completo | Montagem de série (slots + data de início + preview) |
| `customer-reservaraula-04-serie-confirmar.html` | ✅ completo | Confirmação série |
| `customer-reservaraula-05-success-ativo.html` | ✅ completo | Sucesso — vaga garantida (ACTIVE) |
| `customer-reservaraula-05b-success-waitlist.html` | ✅ completo | Sucesso — na fila (WAITLIST) |
