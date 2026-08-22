# UX Handoff — Protótipos de Fluxo de Turmas

**Última atualização:** 12/08/2026
**Contexto:** Protótipos exploratórios do fluxo de turmas — lado público/cliente (sessões 09/08) e lado manager/configuração (sessão 10/08). Este documento explica o que foi criado e por quê — para alinhar com os CANDs correspondentes e implementar com as decisões de produto já tomadas.

> **Relocado 2026-08-21.** Este arquivo vivia em uma pasta `ux-handoff/` separada, ao lado de `plan/` e `docs/`. Consolidado em `docs/discovery/MULTI_VERTICAL_SCHEDULING/` para que toda a discovery viva num único lugar do repositório. Os HTMLs referenciados abaixo agora estão em `../prototype/` (não mais como irmãos deste arquivo) — os links relativos abaixo refletem a estrutura original e podem não resolver diretamente; use `../prototype/index.html` para navegar pelas telas reais. `trial_slots` (§5 abaixo) e a reposição de turma fixa (`RECORRENCIA_HANDOFF.md`) foram reconciliados contra `MULTI_VERTICAL_SCHEDULING.md`/`_DATA_MODEL.md`/`_USECASES.md` nessa mesma data — ver essas fontes para o estado final, não este documento histórico.

---

## Arquivos nesta pasta

```
ux-handoff/
├── README.md                        ← este arquivo
├── ONBOARDING_PRESETS.md            ← discovery de presets por vertical
├── RECORRENCIA_HANDOFF.md           ← decisões do fluxo customer-04a/b/c/d
│
│   — Fluxo público / cliente —
├── public-02b-class-agenda.html     ← agenda de turmas por dia (após escolher um serviço de turma)
├── public-06-class-access.html      ← reserva de vaga (3 estados de autenticação)
├── public-06b-business-profile.html ← perfil do negócio (cliente logado)
├── customer-04a-turma-fixa-serie-com-fim.html
├── customer-04b-turma-fixa-sem-prazo.html
├── customer-04c-dropin-sem-prazo.html
├── customer-04d-reagendada.html
│
│   — Configuração de turmas (manager) —
├── manager-turmas-list.html         ← lista de tipos de aula agrupados (accordion)
├── manager-nova-aula.html           ← form: criar tipo de aula
├── manager-adicionar-horario.html   ← form: adicionar horário recorrente a um tipo
├── manager-definir-staff.html       ← atribuição de staff por dia e/ou horário
│
│   — Operação diária (manager) — adicionados em 12/08/2026 —
├── manager-dashboard.html           ← tela inicial pós-login: pendências, agenda resumida, KPIs
├── manager-agenda-dia.html          ← agenda do dia (aulas + appointments) com semana navegável
└── manager-roster-dia.html          ← roster de uma sessão: check-in, fila de espera, drop-in
```

Todos os HTMLs referenciam `../plan/journey/shared/tokens.css` para os tokens visuais compartilhados.

---

## 1. `public-02b-class-agenda.html` — Agenda de turmas por dia

**O que é:** a primeira tela específica de turmas, depois que a pessoa escolhe uma modalidade/serviço no catálogo público. Substitui a `public-02` (que listava serviços avulsos). Agenda-first: o usuário navega por data antes de ver as turmas disponíveis.

**Posição na jornada:** para um hotsite multi-serviço, o fluxo canônico é `catálogo de serviços → agenda de turmas filtrada pelo serviceId → acesso à turma`. A agenda pode permitir “ver todas as modalidades” como uma ampliação explícita do filtro, mas não compete com o catálogo como entrada geral. Links de perfil do negócio, contrato ou recorrência podem abrir a agenda diretamente porque já carregam contexto.

**Por que foi criado:**
A `public-02` original exibia serviços como catálogo. Turmas não funcionam assim — a mesma turma acontece em dias diferentes, e o usuário quer saber "o que tem na quarta?", não "que turmas de pilates existem?". A tela precisa ser orientada a tempo, não a serviço.

**Decisões de UX:**
- **Day strip com dots:** dias com aula têm um ponto indicativo. O usuário sabe de longe quais dias valem a pena clicar.
- **Filtros por modalidade e instrutora:** apenas esses dois. Vagas não é filtro — aparece no card como informação, não como critério de busca.
- **Empty state contextual:** mensagem diferente para "não há aulas nesse dia" vs "não há aulas com esse filtro nesse dia". Isso evita confusão sobre se o problema é o dia ou o filtro.
- **Clique no card → `public-06-class-access.html`:** o acesso à turma é o próximo passo natural.

**CANDs relacionados:** CAND-21 (escolher turma), CAND-22 (acesso com contrato).

---

## 2. `public-06-class-access.html` — Acesso à turma

**O que é:** tela de reserva de vaga. Cobre três estados de autenticação e dois desfechos pós-solicitação.

**Por que foi reescrito:**
A versão anterior era uma tela única sem consciência de quem está acessando. Isso gerava fricção desnecessária: clientes com contrato precisavam passar por campos que já estão preenchidos no perfil deles.

**Os três estados de login (controle via banner âmbar de protótipo):**

| Estado | Quem é | O que vê |
|---|---|---|
| `view-contract` | Cliente logado com contrato ativo | Nome, dados da turma, botão único "Confirmar vaga" — sem formulário |
| `view-nocontract` | Cliente logado, sem contrato | Aviso amarelo + campos pré-preenchidos (readonly) + "Solicitar vaga" |
| `view-out` | Não logado | Duas abas: "Sou cliente" (login) e "Quero experimentar" (formulário de guest) |

**Decisão:** cliente com contrato não vê confirmação intermediária. A ação é direta — um toque confirma. Email chega depois como comprovante.

**Os dois desfechos pós-solicitação:**

| Desfecho | Quando ocorre | O que a tela mostra |
|---|---|---|
| Confirmado | Vaga disponível dentro do limite de `trial_slots` | Check verde, "Vaga confirmada!", dados da sessão, nota sobre email |
| Pendente | `reserved_guest_count + quantity` excede `trial_slots`, mas ainda há capacidade geral | Ícone de relógio amarelo, "Solicitação recebida", dados da sessão e aviso de aprovação da equipe |

**Blocos de exploração (ambos os desfechos):**
Em vez de listar turmas automaticamente após a confirmação (o que ficaria estranho sem contexto), a tela oferece três blocos convidativos:
- "Outras turmas" → `public-02b-class-agenda.html`
- "O estúdio" → `public-06b-business-profile.html`
- "A equipe" → `public-06b-business-profile.html#team`
- Instagram linkado abaixo dos blocos

**CANDs cobertos:** CAND-22, CAND-23, CAND-33, CAND-24.

---

## 3. `public-06b-business-profile.html` — Perfil do negócio

**O que é:** vitrine do negócio para clientes logados — acessível após agendamento ou via marketplace futuro.

**Por que foi redesenhado:**
A versão anterior era um catálogo com lista detalhada de serviços, turmas e equipe. O problema: quanto mais o negócio cresce, mais a lista vira um documento. Não é escalável e não é o que o cliente quer ver logo após confirmar uma vaga.

**Decisão de escopo:** essa tela é para usuários logados. O hotsite continua sendo o caminho para quem ainda não tem conta.

**Padrão adotado: perfil, não catálogo**
- **Hero cover + logo mark** sobrepostos: identidade visual do negócio sem precisar de banner editorial
- **Tags de modalidade** (ex: "Pilates · Yoga · Massagem"): síntese imediata do que o negócio oferece
- **Chips de modalidade clicáveis:** levam direto para a agenda filtrada. Escalável para qualquer número de modalidades.
- **Team strip horizontal scrollável:** avatares com iniciais + nome. Não colapsa, não vira lista. Funciona com 3 ou 15 pessoas.
- **Horários collapsible:** compacto por padrão, expande para a grade completa.
- **CTA fixo no rodapé:** "Ver agenda" + "Contato" sempre acessíveis, sem precisar rolar.

**Âncora `#team`:** a seção de equipe tem `id="team"`, permitindo link direto dos blocos de exploração da `public-06`.

---

## 4. `ONBOARDING_PRESETS.md` — Discovery de presets por vertical

**O que é:** companion doc para o `MULTI_VERTICAL_SCHEDULING.md`. Não é roadmap — é discovery. Define como o onboarding pode abstrair os 13 modelos técnicos em 6 tipos de negócio que qualquer dono entende.

**Por que existe:**
O modelo técnico é rico e necessário. Mas expor `bookingModel`, `resourceRequirements` e `selectionMode` direto para o usuário no onboarding seria uma experiência de planilha. O documento propõe uma camada de tradução: perguntas em linguagem de negócio → configuração técnica gerada automaticamente.

**Os 6 presets:**
A, B, C, D, E, F — mapeados para os modelos técnicos com campos pré-preenchidos e perguntas de bifurcação definidas.

**Nova decisão de produto documentada aqui:** `trial_slots` por turma.

---

## 5. Nova decisão de produto: `trial_slots` por turma

Esta decisão foi incorporada ao `MULTI_VERTICAL_SCHEDULING.md` e ao modelo de dados; este handoff registra sua origem em UX.

**O conceito:**
Cada turma (sessão) pode ter um número de vagas reservadas para visitantes/clientes avulsos (`trial_slots`). Esse limite é configurado pelo negócio turma a turma — não é global.

**Comportamento:**
- `reserved_guest_count + quantity <= trial_slots` → confirmação instantânea
- acima desse limite, mas ainda dentro da capacidade geral → aprovação manual

**Por que por turma, não por política global:**
Turmas de horário de pico podem ter `trial_slots = 0` (sem avulsos) enquanto turmas de baixa ocupação aceitam 2 ou 3. O estúdio controla isso granularmente sem precisar criar regras complexas globais. Protege os alunos recorrentes sem travar a operação.

**Sugestão de campo:** adicionar `trial_slots: integer` e `reserved_guest_count: integer` à entidade `ClassSession` (ou similar). O `CAND-10b` já toca na política de visitantes — este campo é uma extensão granular desse candidato.

---

## Próximos passos sugeridos (do lado técnico — sessão 09/08)

1. Implementar o guarded update de `reserved_guest_count` junto de `reserved_count`.
2. Exibir confirmação, aprovação pendente e oferta de fila como estados mutuamente exclusivos.
3. Revisar os CANDs 22/23/33 na implementação contra os três estados de login documentados nos protótipos.

## Reconciliado na revisão de produto — regras obrigatórias para promoção

- Fila de espera e alerta de disponibilidade exigem cliente autenticado. Uma visita pública preserva o contexto e passa por login/criação de conta antes de criar qualquer uma dessas intenções.
- Uma promoção de fila é uma oferta com `PROMOTION_PENDING`, prazo, aceitar, recusar e expiração; não é confirmação automática.
- O fluxo autenticado sem contrato é avulso/pagamento presencial e pode ficar pendente de aprovação conforme `trialSlots`; recorrência continua exigindo contrato.
- A agenda de turmas, a reserva privada e o dashboard do cliente devem ser projeções do modelo canônico (`ClassSessionBooking` + `RecurringEnrollment`), não novos estados de domínio chamados `EnrollmentSession`.
- Estes HTMLs de discovery não substituem as jornadas formais. Antes de implementar, criar estados de retorno pós-login, link de verificação de guest expirado, oferta expirada, reposição e navegação cross-role resolvida.

---

## 6. `manager-turmas-list.html` — Lista de tipos de aula (10/08/2026)

**O que é:** tela principal de configuração de turmas para o manager. Substitui `manager-03-class-templates.html` (lista plana de templates).

**Por que foi redesenhado:**
A lista plana não escala. Um estúdio com pilates de hora em hora das 6h às 19h geraria 13 linhas idênticas na tela anterior — impossível de gerenciar. O agrupamento por tipo de aula com recorrência descrita em linguagem direta ("Todos os dias · 06:00 às 19:00 · a cada 1h") resolve isso em uma linha.

**Decisões de UX:**
- **Accordion por tipo de aula:** Pilates, CrossFit, Yoga como seções independentes. Cada tipo expande para mostrar seus padrões de recorrência.
- **Recorrência em linguagem direta:** "Seg, Qua e Sex · 08:00" em vez de chips de dia — legível sem decodificação visual.
- **Recurso padrão visível:** sala/recurso aparece como info secundária no horário, sem poluir a leitura principal.
- **"+ horário" dentro de cada tipo:** a ação mais frequente (adicionar um horário a um tipo existente) fica acessível diretamente, sem precisar voltar ao topo.
- **"+ Tipo de aula" como ação principal (desktop: topbar; mobile: FAB):** criação de tipo é menos frequente que criação de horário — hierarquia correta.
- **Sem dados de alunos:** esta tela é configuração, não operação. Vagas ocupadas, nomes de alunos e reservas ficam em "Ver sessões".
- **Ações por horário:** "Ver sessões" (ocorrências futuras), "Staff" (atribuição), "Editar" (padrão recorrente).

**CANDs relacionados:** CAND-11 (criar template), CAND-12 (listar templates), CAND-13 (editar template).

---

## 7. `manager-nova-aula.html` — Criar tipo de aula (10/08/2026)

**O que é:** passo 1 do cadastro de turmas. Form mínimo para criar um tipo de aula.

**Decisões de UX:**
- **Três campos apenas:** nome, duração padrão e vagas por sessão. Sem cor, ícone ou categoria — o nome já identifica.
- **Vagas como número fixo:** não varia por horário nem por sessão — decisão tomada com o product owner.
- **Duração padrão em select:** opções comuns (30, 45, 50, 60, 75, 90 min) + "Personalizado". Pode ser sobrescrita por horário ao adicionar recorrência.
- **Fluxos separados:** criação de tipo não mistura criação de horário. Após salvar, o usuário volta à lista e adiciona horários no próprio contexto do tipo — menos carga cognitiva.
- **Nota no aside (desktop):** "Após criar, você poderá adicionar os horários em que esta aula acontece" — orienta sem ser intrusivo.

---

## 8. `manager-adicionar-horario.html` — Adicionar horário (10/08/2026)

**O que é:** passo 2 do cadastro. Adiciona um padrão de recorrência a um tipo de aula existente.

**Decisões de UX:**
- **Contexto visível:** barra no topo da área de formulário mostra "Adicionando horário em Pilates · 4 vagas · 50 min" — o usuário nunca perde a referência do tipo pai.
- **Chips de dia:** seleção visual, múltipla. S T Q Q S S D — cada chip é clicável.
- **Multiselect de horários:** dropdown com horas cheias e meias (06:00, 06:30, 07:00…). Selecionados viram pills acima. "Horário personalizado" no final da lista abre campo inline — sem abrir outra tela.
- **Dropdown ilustrado aberto:** o protótipo mostra o dropdown no estado aberto para o revisor entender o mecanismo sem precisar interagir.
- **Duração herda do tipo:** select inicia com "50 min (padrão do tipo)" — sobrescrita opcional por horário.
- **Data de fim opcional:** campo com placeholder "sem prazo". Usado para turmas de séries fixas (ex: "turma de 6 semanas").
- **Pool de instrutores (opcional):** seção ao final do form com um multiselect de "Instrutores elegíveis". Padrão vazio — o usuário ignora se não quiser definir agora. Um instrutor selecionado = atribuição fixa. Dois ou mais = pool intercambiável, alinhado ao conceito de `eligibleResourceIds` no `MULTI_VERTICAL_SCHEDULING.md`.
- **Regra de negócio do pool:** qualquer membro do pool pode cobrir qualquer sessão deste horário (ex: substituição por doença sem precisar reabrir o cadastro). O gestor designa quem vai por sessão em "Ver sessões", escolhendo dentro do pool já definido.
- **Escape para granularidade:** link "Definir por dia ou horário →" logo abaixo do multiselect leva para `manager-definir-staff.html`. Cobre os 20% de casos com staff variado sem sobrecarregar os 80% simples.
- **Um único botão de saída:** "Salvar horário" — sem ambiguidade entre "salvar com staff" e "salvar sem staff".

---

## 9. `manager-definir-staff.html` — Definir staff (10/08/2026)

**O que é:** passo 3 do cadastro (opcional, pode ser feito a qualquer momento). Atribuição de staff ao padrão de recorrência.

**Por que foi projetado assim:**
Três casos de uso reais precisavam funcionar sem que o usuário escolhesse um "modo":
1. Mesmo professor para todos os dias e horários (ex: Pilates fixo com Camila)
2. Um professor por dia, cobre todos os horários (ex: box onde cada dia vem um professor diferente)
3. Professores diferentes por horário dentro de um mesmo dia (ex: sexta com Camila às 8h e Ana às 9h)

**Decisões de UX:**
- **"Aplicar a todos" no topo:** cobre o caso mais simples com um seletor. Se preenchido, propaga para todos os dias e horários — sobrescreve qualquer seleção individual.
- **Seletor por dia:** cada dia tem seu próprio dropdown de staff. Cobre o caso do box (caso 2) sem nenhum modo especial.
- **"Por horário" como expansão do dia:** clicando, o dia abre sub-linhas com um seletor por slot de horário. Sexta no protótipo: Camila às 08:00, Ana às 09:00, vago às 10:00. Os outros dias não são afetados.
- **Sem escolha de modo:** o usuário opera no nível que precisar. A UI não força uma estrutura.
- **Staff aqui = padrão recorrente:** ajustes pontuais de uma sessão específica (ex: "Camila não pode na quarta dia 20") ficam em "Ver sessões" — escopo diferente, tela diferente.

---

## Próximos passos sugeridos (do lado técnico — sessão 10/08)

1. Definir entidade `ClassSchedulePattern` (ou equivalente) com: `classTypeId`, `days[]`, `times[]`, `duration`, `defaultResourceId`, `validFrom`, `validUntil`
2. Definir entidade `StaffAssignment` com granularidade: padrão (todos), por dia, por slot (dia + horário)
3. Alinhar com CAND-11/12/13 se o modelo de `ClassScheduleTemplate` já cobre `days[]` + `times[]` como array ou se precisa de linhas separadas por horário
4. Tela "Ver sessões" ainda não prototipada — mostraria ocorrências futuras com staff por sessão e opção de ajuste pontual

---

## 10. `manager-roster-dia.html` — Roster de uma sessão (12/08/2026)

**O que é:** tela operacional de uma sessão específica. Acessada a partir da agenda do dia. Gerencia presença, fila de espera e drop-ins no dia da aula.

**Decisões de UX:**
- **Header de contexto fixo:** nome da aula, data/hora, sala e staff visíveis sem rolar — o gerente sabe exatamente em qual sessão está.
- **Check-in como ação primária:** botão circular à direita de cada aluno. Toque único alterna pendente ↔ presente. Estado visual reforça: borda verde esquerda + dot verde nos confirmados.
- **Ausente separado do toggle simples:** toggle de dois estados (pendente/presente) cobre 90% do uso. Ausência requer intenção — não deve ser ativada por toque acidental.
- **Badge de tipo por aluno:** `Fixa` / `Drop-in` / `Reag.` — o gerente vê de onde veio cada aluno sem acessar o perfil.
- **Fila de espera com "Promover":** move o aluno para confirmados se houver vaga. Ação disponível apenas quando `ocupação < vagas`.
- **"+ Drop-in" desabilitado quando cheio:** botão existe mas bloqueado com mensagem contextual. Não some — deixa o gerente entender por que não pode adicionar.
- **"Marcar todos presentes":** disponível como bar sticky (mobile) e link inline (desktop). Para turmas pequenas como Pilates (4 vagas), é a operação mais comum no final da aula.

**Esta tela é operação, não configuração.** Não tem campo de edição de dados do aluno nem de horários.

**CANDs relacionados:** CAND-21 (marcar presença), CAND-22 (promover fila de espera).

---

## 11. `manager-agenda-dia.html` — Agenda do dia (12/08/2026)

**O que é:** visão operacional do dia para o manager. Cobre aulas e appointments (por tabs ou intercalados) com navegação por semana.

**Decisões de UX:**
- **Week strip como navegação principal:** faixa com os 7 dias da semana visíveis. Dot embaixo de cada dia indica se há sessões — o manager sabe de relance quais dias têm movimento. Avança e volta semana inteira pelas setas. Botão "Hoje" aparece só quando a semana exibida não inclui hoje.
- **Cards de sessão compactos:** linha por sessão com hora, acento colorido por tipo de aula, nome, staff, sala e badge de capacidade. Sem accordion inline.
- **Slide-over ao clicar:** bottom sheet no mobile, drawer lateral no desktop. Backdrop escurece o fundo. Fecha por X, clique fora ou Esc.
- **Roster sempre completo no drawer:** nenhuma sessão mostra atalho de "N alunos inscritos" — a lista completa é sempre renderizada, independente do tamanho da turma.
- **Check-in direto no drawer:** para casos simples, o gerente não precisa ir para o roster completo. O botão de check-in está disponível inline.
- **"Gerenciar roster" no footer do drawer:** leva para `manager-roster-dia.html` quando a operação é mais complexa (promover fila, adicionar drop-in).
- **Acento colorido por tipo:** azul = Pilates, roxo = CrossFit, ciano = Yoga. Identificação visual sem precisar ler o nome da aula.
- **Dias sem sessões:** empty state contextual ("Sem sessões nesta quinta") — sem exibir lista vazia.

**CANDs relacionados:** CAND-14 (listar sessões por dia).

---

## 12. `manager-dashboard.html` — Dashboard inicial (12/08/2026)

**O que é:** tela inicial após login. Visão executiva — não operacional. Direciona para as telas certas, não substitui nenhuma delas.

**Estrutura em três zonas (coluna principal):**

**Zona 1 — Pendências:** alertas acionáveis ordenados por gravidade (vermelho → amarelo → azul). Cada alerta tem contexto suficiente para entender o problema e um link direto para a ação. Some quando não há pendências. Exemplos prototipados: pagamentos em atraso, aprovações aguardando, staff não definido.

**Zona 2 — Agenda do dia (resumo):** dividida em duas seções separadas:
- *Próximos agendamentos* — appointments do dia em ordem cronológica, com badge de status (Confirmado / Pendente). "Ver agenda →" leva para `manager-agenda-dia.html`.
- *Próximas aulas* — classes do dia com quantidade de alunos e badge de capacidade. "Ver roster →" leva para `manager-agenda-dia.html`. Ambas mostram as 3 primeiras entradas + contador de restantes.

**Zona 3 — Nos próximos dias:** previsão prospectiva de ações necessárias. Não repete o que está em Pendências. Exemplos: turma com baixa ocupação amanhã, planos vencendo esta semana, appointment sem staff na sexta. Ordenado por urgência temporal.

**Aside (desktop) — KPIs:**
- Receita do mês com barra de meta
- Alunos ativos e total em atraso
- Ocupação média com barra
- Resumo de sessões por tipo de aula na semana

**Decisão de escopo:** sem gráficos históricos nem relatórios. O dashboard é "o que precisa da minha atenção hoje" — não "como foi o mês".

**Navegação estabelecida:** o sidebar passa a ter `Início`, `Agenda` e `Aulas` como os três primeiros itens — refletindo a separação entre dashboard, agenda detalhada e gestão de turmas.

---

## Próximos passos sugeridos (sessão 12/08)

1. Prototipar tela de **appointments** (agenda de consultas/serviços avulsos) — referenciada no dashboard mas ainda não construída
2. Definir o modelo de dados para `attendance` por sessão: `sessionId`, `enrollmentId`, `status` (present/absent/pending), `checkedInAt`
3. Alinhar CAND-21 com o campo `checkedInAt` — presença tem timestamp ou é apenas booleano no V1?
4. Definir se "Promover da fila" gera notificação automática para o aluno ou requer confirmação manual do manager primeiro

---

## 13. `06-minhas-turmas.html` — Minhas Turmas: lista de matrículas (13/08/2026)

**O que é:** área do cliente para gerenciar participação em turmas. Nova tab em `/{slug}/my-account/turmas` — complementa "Agendamentos" (serviços avulsos) sem misturar os dois modelos.

**Por que foi criado:**
A tela de "Minha Conta" existente cobre agendamentos pontuais. Turmas têm comportamento recorrente: a cliente não agenda sessão a sessão, ela tem uma matrícula que gera sessões automaticamente. Misturar os dois no mesmo lugar criaria confusão sobre o que cada item é e que ações estão disponíveis.

**Decisões de UX:**
- **Tab separada, não seção:** "Turmas" aparece como item próprio no bottom nav mobile e na tab nav desktop, ao lado de "Agendamentos" e "Fidelidade". A separação deixa claro que são produtos diferentes.
- **Cards com acento colorido por tipo:** azul = fixa, roxo = série, verde = drop-in, âmbar = fila de espera. Identificação visual sem precisar ler o badge.
- **Footer do card mostra próxima sessão:** a informação mais relevante para quem está com a matrícula ativa. Séries mostram "N sessões restantes · termina em X" em vez de próxima sessão.
- **Fila de espera como seção separada:** não mistura com matrículas ativas. A cliente entende que ainda não tem vaga confirmada.
- **CTA "Ver agenda de turmas" no rodapé:** convite para explorar outras turmas sem interromper o fluxo de quem veio gerenciar o que já tem.

---

## 14. `07-turma-detail.html` — Detalhe da matrícula (turma fixa) (13/08/2026)

**O que é:** visão completa de uma matrícula ativa do tipo fixa sem prazo. Mostra informações da turma, próximas sessões, histórico e ações de gestão.

**Decisões de UX:**
- **Header com acento colorido e badge de tipo:** a cliente sabe de relance em que tipo de turma está e desde quando tem a matrícula.
- **Próximas sessões separadas do histórico:** as próximas aparecem sempre no topo com status "Confirmada" e ação "Pular" inline — a ação mais comum fica a um toque. O histórico fica abaixo com status por sessão (Presente, Faltou, Pulou).
- **"Pular" inline nas próximas sessões:** atalho direto para `08-pular-sessao.html` sem precisar abrir o detalhe de cada sessão. Só aparece nas sessões futuras (exceto a imediata, que já está em aberto).
- **Aside desktop com estatísticas:** sessões realizadas e faltas no mês — contexto rápido sem poluir a coluna principal.
- **"Cancelar matrícula" no rodapé, não no topo:** ação destrutiva fica acessível mas não proeminente. Texto auxiliar explica o escopo antes de o usuário clicar.

---

## 15. `07b-turma-waitlist.html` — Fila de espera (13/08/2026)

**O que é:** mesmo route que o detalhe de matrícula, estado diferente quando `enrollment.status = WAITLIST`.

**Decisões de UX:**
- **Posição em destaque visual (círculo âmbar com número):** a informação principal é "você é a 3ª". Tudo mais é contexto.
- **Sem lista de outras pessoas na fila:** privacidade. A cliente não precisa saber quem está na frente, só onde ela está.
- **Explicação de como funciona inline:** "quando uma vaga abrir, você será avisada por e-mail e terá 24h para confirmar" — reduz ansiedade sem precisar de FAQ.
- **"Sair da fila" com aviso de consequência:** a ação existe e é acessível, mas o texto abaixo ("você perde sua posição") funciona como freio natural.

**Decisão de produto reconciliada:** a promoção da fila gera uma oferta temporária, não confirmação automática. A cliente recebe email e status in-app, aceita explicitamente antes do prazo configurável (24h por padrão, nunca após o início da sessão); recusa/expiração oferece a vaga à próxima pessoa compatível. A tela precisa mostrar essa ação de aceite.

---

## 16. `07c-turma-serie-detail.html` — Detalhe da matrícula (série com fim) (13/08/2026)

**O que é:** variante do detalhe para turmas do tipo série — número fixo de sessões com data de encerramento.

**Diferenças em relação à turma fixa (`07-turma-detail.html`):**
- **Barra de progresso roxa:** `sessões realizadas / total`. Percentual e contagem numérica visíveis. Dá senso de avanço na série.
- **Badge "Última" na sessão final da lista:** a cliente vê com antecedência que a série está chegando ao fim — sem surpresa.
- **Bloco de encerramento com CTA:** aparece sempre que `seriesEndDate` está definida. Informa a data de encerramento, confirma que não haverá cobranças adicionais e convida a explorar outras turmas. Não é um alerta — é informação proativa.
- **"Cancelar matrícula antecipadamente"** em vez de "Cancelar matrícula": o texto deixa claro que a série já tem fim previsto e o cancelamento é antes do tempo natural.

---

## 17. `08-pular-sessao.html` + `08-pular-sessao-confirmado.html` — Pular sessão (13/08/2026)

**O que é:** fluxo de dois passos para marcar que a cliente não vai comparecer a uma sessão específica, sem cancelar a matrícula.

**Por que "pular" e não "cancelar sessão":**
Cancelar remete a desfazer algo. Pular é mais próximo do que a cliente realmente quer fazer: avisar que não vai dessa vez. O vocabulário reduz a fricção e diminui o risco de ela cancelar a matrícula por engano.

**Decisões de UX:**
- **Aviso de fila de espera no form:** se há pessoas esperando vaga, a cliente sabe que seu "pulo" vai beneficiar alguém — o que torna a ação mais palatável e incentiva o aviso com antecedência.
- **Motivo opcional com select:** o estúdio ganha dados operacionais (padrão de faltas por motivo) sem tornar o campo obrigatório. A cliente não se sente questionada.
- **"O que acontece depois" como lista:** três itens curtos que removem dúvidas antes que apareçam ("minha matrícula continua?", "vou ser cobrada?").
- **Tela de sucesso com próxima sessão visível:** a cliente sai da tela sabendo quando é a próxima vez — não fica com a sensação de que "sumiu" da agenda dela.

**Decisão de produto a alinhar:** prazo mínimo para pular sessão. Sugestão: usar o mesmo `cancellation_window_hours` do tenant, mas pode ser um campo separado para turmas.

---

## 18. `08b-cancelar-matricula.html` — Cancelar matrícula (13/08/2026)

**O que é:** página de confirmação para cancelamento da matrícula inteira. Distinta do cancelamento de agendamento avulso (`03-cancel-confirm.html`) em escopo e consequências.

**Por que página separada, não sheet:**
O cancelamento de matrícula encerra uma relação recorrente. O peso da decisão justifica uma página inteira com contexto completo — não um sheet que some com um swipe.

**Decisões de UX:**
- **Duas listas explícitas ("O que será cancelado" / "O que não muda"):** remove a ambiguidade mais comum. A cliente precisa saber que o histórico e os pontos de fidelidade sobrevivem ao cancelamento.
- **Aviso de reembolso neutro:** o sistema não promete nem nega reembolso — direciona para o estúdio. Evita conflito entre a UX da plataforma e a política financeira de cada negócio.
- **Checkbox de confirmação explícita:** a cliente precisa afirmar ativamente que entendeu o escopo antes de o botão de confirmar ficar ativo. Freio proporcional à irreversibilidade da ação.
- **Botão de confirmar em vermelho, bem separado do "Voltar":** hierarquia visual clara. O vermelho não é alarmismo — é sinalização honesta de que a ação tem consequência.

---

## Próximos passos sugeridos (sessão 13/08)

1. Implementar `PROMOTION_PENDING` como estado de oferta de fila, com aceite/recusa/expiração.
2. Usar `ClassSessionBooking` + attendee-level attendance como o registro de histórico/check-in; não criar um `EnrollmentSession` paralelo.
3. Usar `classSkipWindowHours`, separado da janela de cancelamento de aula avulsa.
4. Garantir que toda tela de fila comunique o aceite ativo e seu prazo.
