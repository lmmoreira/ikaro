# Discovery: Onboarding Presets — Configuração Guiada por Vertical

**Status:** Discovery — exploratório. Nenhum preset aqui está comprometido com milestone; nenhum `UC-XXX` é consumido por este documento.
**Companion doc:** `MULTI_VERTICAL_SCHEDULING.md` — os modelos de agendamento que este documento mapeia para linguagem de negócio.
**Escopo:** Este documento cobre exclusivamente a camada de apresentação do onboarding — o que o dono do negócio vê e responde, e como essas respostas se traduzem em configuração técnica sem que ele precise entender o modelo subjacente.

---

## 1. Problema

O modelo de agendamento descrito em `MULTI_VERTICAL_SCHEDULING.md` suporta 13 configurações distintas. Expor qualquer parte dessa taxonomia diretamente ao usuário no onboarding produziria uma experiência de planilha, não de produto.

O problema não é simplificar o modelo — o modelo precisa ser rico para suportar os verticais. O problema é que **o dono de um estúdio de pilates não pensa em `bookingModel`, `resourceRequirements` ou `selectionMode`**. Ele pensa: "tenho turmas de 4 pessoas, segunda, quarta e sexta às 8h, com a Camila."

A distância entre o que o sistema precisa saber e o que o usuário naturalmente fornece é o que os presets resolvem.

---

## 2. Princípios de Design

**2.1 A pergunta certa substitui dez campos**
Em vez de expor `resourceRequirements[].selectionMode`, perguntar: "Seus clientes escolhem com quem querem ser atendidos, ou qualquer profissional disponível serve?" — uma pergunta de negócio que preenche o campo técnico.

**2.2 Assunção explícita é melhor que campo em branco**
Se um vertical tem um padrão óbvio (cabeleireiro geralmente tem buffer de 15min após o atendimento), o sistema assume e informa. O usuário corrige se necessário, mas não precisa saber que o campo existe se o padrão serve.

**2.3 Configuração avançada existe mas não é o caminho principal**
Todo preset tem uma saída "Configuração avançada" que expõe os campos técnicos para quem precisa. Esse caminho não deve ser necessário para 80% dos casos de onboarding.

**2.4 O preset não limita — apenas sugere o ponto de partida**
Um preset de salão não impede o usuário de ativar turmas depois. Ele define o que estará ligado no dia 1, com a menor fricção possível.

---

## 3. Taxonomia de Presets

Sete tipos de negócio cobrem a maioria dos verticais que a plataforma quer atender na primeira fase. Cada preset é uma combinação pré-definida de modelos técnicos, com campos pré-preenchidos e um conjunto mínimo de perguntas.

| Preset | Exemplo de negócio | Modelos ativados |
|---|---|---|
| **Auto / Estética** | Lava-rápido, higienização | Modelo 1 |
| **Salão / Barbearia** | Cabeleireiro, barbeiro, manicure | Modelos 2 ou 3 + 9 |
| **Clínica / Consultório** | Fisioterapia, psicologia, nutrição | Modelo 2 + 9 |
| **Estúdio de turmas** | Pilates, yoga, dança | Modelos 5 + 10 + 11 |
| **Box / Academia** | CrossFit, funcional, musculação guiada | Modelos 5 + 6 + 10 |
| **Estúdio misto** | Pilates + personal, yoga + terapia manual | Modelos 2 + 5 + 13 |

> Os números de modelo referem-se à tabela §2 de `MULTI_VERTICAL_SCHEDULING.md`. Modelos 7 (bundle) e 8 (etapas sequenciais) são configuração avançada disponível em qualquer preset, não ativados por padrão.

---

## 4. Definição dos Presets

### **Preset A — Auto / Estética**

**Modelos ativados:** 1 (negócio inteiro como recurso único)

**O que é pré-preenchido:**
- Tipo de recurso: `LOCATION` (único, implícito)
- Modo de seleção: `NONE`
- Capacidade: 1
- Buffer padrão: 30 minutos

**O que é perguntado:**
1. Nome do negócio
2. Horário de funcionamento
3. Quais serviços e quanto tempo cada um leva

**Assunção informada:** "Configuramos seu negócio para receber um cliente por vez. Se você tiver mais de uma baía ou ponto de atendimento simultâneo, isso pode ser ajustado em Configurações."

---

### **Preset B — Salão / Barbearia**

**Modelos ativados:** 2 ou 3 + 9

**Pergunta de bifurcação:**
> "Seus clientes costumam pedir uma profissional específica, ou qualquer uma disponível serve?"
- "Pedem uma específica" → Modelo 2 (`CUSTOMER_CHOICE`)
- "Qualquer disponível" → Modelo 3 (`AUTO_ANY`)

**O que é pré-preenchido:**
- Tipo de recurso: `STAFF`
- Buffer padrão: 15 minutos
- Capacidade: 1 por profissional

**O que é perguntado:**
1. Nomes das profissionais
2. Horário de cada uma
3. Quais serviços cada uma realiza
4. Duração e preço de cada serviço

---

### **Preset C — Clínica / Consultório**

**Modelos ativados:** 2 + 9

**Pergunta de bifurcação — ativa bundle de sala:**
> "Você tem salas de atendimento compartilhadas entre os profissionais?"
- "Sim" → ativa recurso `ROOM` como bundle obrigatório
- "Não" → apenas `STAFF`

**O que é pré-preenchido:**
- Tipo de recurso principal: `STAFF` com `CUSTOMER_CHOICE`
- Buffer padrão: 10 minutos

---

### **Preset D — Estúdio de Turmas**

**Modelos ativados:** 5 + 10 + 11

**O que é pré-preenchido:**
- `bookingModel: SESSION`
- Lista de espera: ativada por padrão
- Buffer: herdado do `turnoverMinutes` da sala (padrão 10min)

**O que é perguntado:**
1. Nome da modalidade
2. Capacidade por turma
3. Dias e horários recorrentes
4. Instrutoras
5. Salas

**Lógica de template automático:** ao informar "Pilates, seg/qua/sex às 8h, 4 vagas, Camila, Estúdio 1" → sistema cria o `ClassScheduleTemplate` sem expor esse conceito.

**Pergunta sobre clientes não-membros (`CAND-10b`):**
> "Você aceita clientes avulsos nas suas turmas?"
- "Não" → acesso de não-membros desabilitado
- "Sim" → configura `trial_slots` em cada horário: dentro desse número a vaga confirma automaticamente; acima dele a solicitação vai para aprovação da equipe.

**Nova decisão de produto (desta sessão):** dentro de cada turma, o negócio define quantas vagas são reservadas para visitantes (`trial_slots`). Dentro desse limite, a confirmação é instantânea. Acima do limite, vai para aprovação manual — independente de haver vagas gerais sobrando. Isso protege os alunos recorrentes e dá controle por horário (peak hours podem ter `trial_slots = 0`).

---

### **Preset E — Box / Academia**

**Modelos ativados:** 5 + 6 + 10

**Diferença do Preset D:** pergunta sobre turmas simultâneas está no fluxo principal.

**Pergunta de bifurcação:**
> "No mesmo horário, você chega a ter mais de uma turma acontecendo ao mesmo tempo?"
- "Sim" → ativa modelo 6 (templates independentes)
- "Não" → igual ao Preset D com capacidade maior

---

### **Preset F — Estúdio Misto**

**Modelos ativados:** 2 + 5 + 13

**Aviso ao usuário:**
> "Seus profissionais atendem tanto em grupo quanto individualmente. O sistema garante que nenhuma turma e nenhuma sessão individual sejam marcadas para a mesma pessoa no mesmo horário."

### **Preset G — Sala / Coworking / Locação por Tempo**

**Modelos ativados:** 4, 7, 9 + reserva APPOINTMENT de duração escolhida pelo cliente.

**O que é perguntado:**
1. Quais salas, mesas, quadras, vagas ou itens existem;
2. Se o cliente escolhe a unidade ou o sistema atribui uma disponível;
3. Duração mínima, máxima e incremento de reserva;
4. Valor por incremento e cobrança mínima;
5. Capacidade de participantes e recursos adicionais obrigatórios/opcionais.

**Assunção informada:** "Você vende uma reserva de tempo, não hospedagem. O cliente escolhe início e duração dentro das regras configuradas; o sistema protege a sala/recurso por todo esse intervalo."

---

## 5. Fluxo do Wizard

```
Etapa 1 — Tipo de negócio
  └── Usuário escolhe um preset
  └── Sistema explica em uma frase o que vai ser configurado

Etapa 2 — Perguntas do preset
  └── Mínimo de campos (listados acima por preset)
  └── Campos com padrões pré-preenchidos mostram o valor e permitem edição
  └── "Configuração avançada" disponível mas dobrado por padrão

Etapa 3 — Revisão
  └── Resumo em linguagem de negócio do que foi configurado
  └── Confirmação → sistema gera recursos, serviços e templates
```

**Protótipo de descoberta:** `MULTI_VERTICAL_SCHEDULING/prototype/manager-14-onboarding-preset.html` cobre a escolha, as perguntas mínimas e a revisão do bootstrap. É uma validação de UX, não uma tela comprometida com implementação.

---

## 6. Questões em Aberto

1. ~~**Quantos presets aparecem na tela de escolha?** Seis pode ser muito — considerar três categorias amplas primeiro.~~ **Resolvido:** mantenha os rótulos por reconhecimento imediato, agora incluindo Sala/Coworking/Locação por Tempo. Eles não significam fluxos independentes: B/C compartilham uma forma real, D/E compartilham outra, e G reutiliza a forma de recursos com política de duração/preço.
2. **Resolvido — mudança de preset após uso com histórico:** presets are bootstrap helpers, not a permanent tenant type. After any booking/history exists, the manager edits services/resources/policies individually; the system never performs a destructive preset conversion.
3. **Resolvido — Preset F:** self-service, but its review step exposes the generated multiple service families and recommends assisted setup only when the manager cannot complete the required resource/policy answers.
4. **Nomes finais dos presets:** requires a copy round, but is not a product or schema blocker.

## 7. Bootstrap contract

The wizard is the only empty-tenant bootstrap path. Confirming a preset creates the tenant's first LOCATION resource, business hours, services, eligible resources/pools, service policies and—where applicable—class schedule templates as one recoverable workflow. A failure publishes no partial configuration. After bootstrap, normal resource/service CANDs apply; they do not need to solve the initial service/resource dependency cycle.
