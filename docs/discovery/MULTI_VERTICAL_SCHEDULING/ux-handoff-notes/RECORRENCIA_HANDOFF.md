# UX Handoff — Gerenciar Recorrência (revisão)

**Data:** 09/08/2026
**Contexto:** Revisão da tela `customer-04-gerenciar-recorrencia.html` original. O problema identificado: a tela listava ocorrências como itens fixos, o que quebra em dois cenários reais — série com muitas aulas e série sem prazo final. Além disso, o fluxo não previa a possibilidade de reagendar ou escolher outro horário após cancelar uma ocorrência.

> **Relocado 2026-08-21** de uma pasta `ux-handoff/` separada para `docs/discovery/MULTI_VERTICAL_SCHEDULING/ux-handoff-notes/`; os HTMLs citados abaixo agora vivem em `../prototype/`. A decisão de reposição descrita aqui foi formalizada em `MULTI_VERTICAL_SCHEDULING.md`/`_DATA_MODEL.md`/`_USECASES.md` na mesma data — consulte essas fontes para o modelo final, este documento é o registro histórico da sessão que motivou a decisão.

---

## Arquivos desta entrega

```
ux-handoff/
├── customer-04a-turma-fixa-serie-com-fim.html   ← turma fixa, plano com fim
├── customer-04b-turma-fixa-sem-prazo.html        ← turma fixa, sem prazo final
├── customer-04c-dropin-sem-prazo.html            ← drop-in recorrente, sem prazo final
└── customer-04d-reagendada.html                  ← fluxo de escolha de horário de reposição
```

Os HTMLs referenciam `../plan/journey/shared/tokens.css`.

---

## Decisões de produto alinhadas

### 1. Dois eixos determinam o comportamento da tela

A tela de gerenciar recorrência varia em dois eixos independentes:

**Eixo A — Tipo de fim da série:**
- **Série com fim** (ex: plano de 10 semanas) → exibe progresso + lista de todas as ocorrências, com expansão colapsada para séries longas
- **Sem prazo final** (ex: mensalidade contínua) → exibe padrão ativo + janela fixa das próximas semanas; não tenta listar o futuro inteiro

**Eixo B — Modelo de agendamento:**
- **Turma fixa** → cancelar uma ocorrência implica aula a menos; cliente pode reagendar (reposição formal, com janela e limite configuráveis)
- **Drop-in / turma grande** → cancelar não implica perda; cliente pode escolher outro horário como conveniência, sem vínculo de reposição

---

### 2. Duas ações por ocorrência, wording diferente por modelo

| Modelo | Ação principal | Ação secundária |
|---|---|---|
| Turma fixa | Reagendar | Cancelar |
| Drop-in | Escolher outra aula | Cancelar |

O wording diferente já comunica ao cliente o que está acontecendo sem precisar de explicação. "Reagendar" implica substituição formal; "Escolher outra aula" é só conveniência.

No drop-in, as duas ações são independentes: cancelar e depois ir em outro horário são eventos separados no sistema — não há vínculo entre eles.

---

### 3. Reposição (turma fixa): configuração por negócio

O conceito de reposição só existe no modelo de turma fixa. Os campos são configuráveis pelo negócio:

- **Permite reagendamento?** (sim/não)
- **Janela em dias** — ex: "pode reagendar em até 15 dias após a aula cancelada"
- **Limite de reagendamentos por ciclo** — opcional; sem limite no V1

Esses campos não existem no modelo drop-in.

---

### 4. Filtro por modalidade no fluxo de reagendamento

Quando o cliente clica em "Reagendar" (turma fixa) ou "Escolher outra aula" (drop-in), a agenda que se abre deve estar **pré-filtrada pela mesma modalidade** da recorrência. O cliente não escolhe de um cardápio geral.

- Turma fixa → `customer-04d-reagendada.html` (lista de slots por dia, filtrada)
- Drop-in → `public-02b-class-agenda.html` (calendário com filtro de modalidade ativo)

---

### 5. Estados de uma ocorrência

| Estado | Visual | Ações disponíveis |
|---|---|---|
| Confirmada | Normal | Reagendar / Escolher outra aula · Cancelar |
| Reagendada | Riscada + tag verde "Reagendada · [data]" | — |
| Cancelada | Riscada + opacidade reduzida | — |
| Na fila de espera | Normal | — (sem ações de cancelar/reagendar no protótipo; decisão de produto pendente) |

---

## Descrição das telas

### `customer-04a` — Turma fixa, série com fim

**Quando usar:** cliente tem um plano com número fixo de aulas (ex: 10 semanas de Pilates).

**O que a tela mostra:**
- Header com nome da turma e instrutor
- Card de progresso: "2 de 10 aulas · 8 aulas restantes" + barra de progresso
- Lista das próximas ocorrências com ações por linha
- Ocorrências além das primeiras colapsadas atrás de "Ver X restantes" — evita lista pesada para planos longos
- Exemplo de ocorrência já reagendada (estado verde "Reagendada · [data]")
- Cancelamento individual inline (reveal-and-confirm) com nota sobre janela de reposição disponível
- Botão "Cancelar série inteira" com reveal-and-confirm separado, contando quantas aulas serão perdidas

**Decisão de UX:** o collapse é automático para qualquer ocorrência além da 3ª visível. A lista não pagina — expande tudo de uma vez, porque séries fixas raramente passam de 12 semanas.

---

### `customer-04b` — Turma fixa, sem prazo final

**Quando usar:** cliente tem mensalidade contínua com spot fixo numa turma (ex: Pilates toda segunda).

**O que a tela mostra:**
- Banner de padrão ativo: "Ativa — toda segunda, 08h–09h · Sem prazo de encerramento"
- Label "Próximas 4 semanas" + intervalo de datas
- Janela fixa com as próximas 4 ocorrências — sem botão "ver mais"; a tela não tenta listar além dessa janela
- Mesmo esquema de ações e estados do 04a
- Texto do cancelamento de série fala em "encerrar" (não "cancelar"), pois não há número fixo de aulas a enumerar

**Decisão de UX:** 4 semanas foi o tamanho de janela escolhido para o protótipo. É configurável; 2 semanas pode ser o suficiente para drop-in, 4-8 faz mais sentido para turma fixa onde o cliente precisa planejar reposições.

---

### `customer-04c` — Drop-in recorrente, sem prazo final

**Quando usar:** cliente agenda habitualmente (ex: Crossfit toda terça e quinta), mas sem spot fixo e sem compromisso de reposição.

**O que a tela mostra:**
- Mesmo padrão de banner ativo do 04b
- Janela de 2 semanas (drop-in tem horizonte menor de planejamento)
- Ação "Escolher outra aula" em vez de "Reagendar" — leva para o calendário (`public-02b-class-agenda.html`), não para lista de slots de reposição
- Nota explicativa abaixo da lista: "Cancelar uma aula não afeta as próximas. Se quiser ir num horário diferente, use 'Escolher outra aula' antes de cancelar."
- Exemplo de ocorrência simplesmente "Cancelada" (sem tag de reagendamento)

**Diferença técnica relevante:** no drop-in, não há vínculo entre o cancelamento e a nova reserva. O sistema registra dois eventos independentes. O `customer-04d` não é usado neste fluxo.

---

### `customer-04d` — Fluxo de escolha de horário de reposição (turma fixa)

**Quando usar:** cliente clicou em "Reagendar" em 04a ou 04b.

**O que a tela mostra:**
- Header com aula de origem ("Aula original: segunda, 11 de agosto · 08h–09h")
- Banner azul informando a janela de reposição e o prazo limite
- Lista de slots disponíveis agrupados por dia, filtrada pela mesma modalidade
- Vagas disponíveis por slot (verde normal / âmbar para última vaga)
- Bottom sheet de confirmação ao clicar num slot: resume aula cancelada + nova aula escolhida antes do commit

**Nota:** a tela destaca quando um slot é "sua turma habitual" (mesmo instrutor/horário em dia diferente), pois isso tende a ser a escolha preferida.

---

## Telas não cobertas nesta entrega

- **Estado pós-confirmação de reagendamento** (`04d` confirma mas não tem tela de sucesso navegável — o bottom sheet menciona e-mail de confirmação)
- **Ocorrência na fila de espera com ações** — o protótipo mostra o estado mas não define ações. Decisão pendente: cliente em fila pode cancelar? Pode reagendar a partir da fila?
- **Drop-in com série de fim fixo** — combinação rara, não prototipada

---

## CANDs relacionados

- CAND-26: ocorrência cai em turma cheia → fila de espera (enrollment continua ACTIVE)
- CAND-27: pular ocorrência (predecessor direto desta revisão)
- CAND-38: reposição de ocorrência fixa com janela/limite configuráveis
- CAND-22, 23, 33: acesso à turma e estados de confirmação (ver handoff anterior)
